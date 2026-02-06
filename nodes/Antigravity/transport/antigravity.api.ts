import * as crypto from 'crypto';
import {
  NodeOperationError,
  sleep,
  type IExecuteFunctions,
  type IHttpRequestOptions,
  type ILoadOptionsFunctions,
} from 'n8n-workflow';
import {
  ANTIGRAVITY_ENDPOINT_FALLBACKS,
  ANTIGRAVITY_HEADERS,
  DEFAULT_COOLDOWN_MS,
  LOAD_CODE_ASSIST_ENDPOINTS,
} from '../constants';
import { fetchAvailableModels as fetchCloudCodeModels, sendMessage } from '../cloudcode';
import type { AccountLike, AccountManagerLike, AnthropicRequest, UnknownRecord } from '../cloudcode/types';

export const GEMINI_MAX_OUTPUT_TOKENS = 65535;

const CLIENT_METADATA = {
  ideType: 'IDE_UNSPECIFIED',
  platform: 'PLATFORM_UNSPECIFIED',
  pluginType: 'GEMINI',
} as const;

type ProjectCacheEntry = { projectId: string; ts: number };
type ProjectCache = Record<string, ProjectCacheEntry>;
type StaticData = Record<string, unknown> & { projectCache?: ProjectCache };

interface GenerateContentOptions {
  anthropicRequest: AnthropicRequest;
  projectId: string;
  enableGoogleSearch?: boolean;
  outputContentAsJson?: boolean;
}

interface CredentialContext {
  getCredentials(name: string): Promise<unknown>;
}

interface TokenSupplier {
  getToken(): Promise<string>;
  clearCache(): void;
}

type ModelRateLimitState = { isRateLimited: boolean; resetTime: number };

class SingleAccountManager implements AccountManagerLike {
  private readonly account: AccountLike & {
    isInvalid: boolean;
    modelRateLimits: Record<string, ModelRateLimitState>;
    consecutiveFailures: number;
  };

  constructor(
    private readonly projectId: string,
    private readonly tokenSupplier: TokenSupplier,
    email = 'n8n-oauth-account',
  ) {
    this.account = {
      email,
      isInvalid: false,
      modelRateLimits: {},
      consecutiveFailures: 0,
    };
  }

  getAccountCount(): number {
    return this.account.isInvalid ? 0 : 1;
  }

  clearExpiredLimits(): void {
    const now = Date.now();

    for (const [model, limit] of Object.entries(this.account.modelRateLimits)) {
      if (limit.isRateLimited && limit.resetTime <= now) {
        delete this.account.modelRateLimits[model];
      }
    }
  }

  getAvailableAccounts(model: string): AccountLike[] {
    this.clearExpiredLimits();
    if (this.account.isInvalid) return [];

    const limit = this.account.modelRateLimits[model];
    if (limit && limit.isRateLimited && limit.resetTime > Date.now()) {
      return [];
    }

    return [this.account];
  }

  isAllRateLimited(model: string): boolean {
    return this.getAvailableAccounts(model).length === 0;
  }

  getMinWaitTimeMs(model: string): number {
    const limit = this.account.modelRateLimits[model];
    if (!limit || !limit.isRateLimited) return 0;

    const wait = limit.resetTime - Date.now();
    return wait > 0 ? wait : 0;
  }

  selectAccount(model: string): { account: AccountLike | null; waitMs: number } {
    const available = this.getAvailableAccounts(model);
    if (available.length > 0) {
      return { account: available[0], waitMs: 0 };
    }

    return { account: null, waitMs: this.getMinWaitTimeMs(model) };
  }

  async getTokenForAccount(account: AccountLike): Promise<string> {
    void account;
    return await this.tokenSupplier.getToken();
  }

  async getProjectForAccount(account: AccountLike, token: string): Promise<string> {
    void account;
    void token;
    return this.projectId;
  }

  markInvalid(email: string, reason: string): void {
    void reason;
    if (email === this.account.email) {
      this.account.isInvalid = true;
    }
  }

  clearTokenCache(email: string): void {
    if (email === this.account.email) {
      this.tokenSupplier.clearCache();
    }
  }

  clearProjectCache(email: string): void {
    void email;
    // Project ID is provided by n8n and remains stable for this execution.
  }

  getConsecutiveFailures(email: string): number {
    return email === this.account.email ? this.account.consecutiveFailures : 0;
  }

  incrementConsecutiveFailures(email: string): void {
    if (email === this.account.email) {
      this.account.consecutiveFailures += 1;
    }
  }

  markRateLimited(email: string, waitMs: number | null, model: string): void {
    if (email !== this.account.email) return;

    const cooldownMs = waitMs && waitMs > 0 ? waitMs : DEFAULT_COOLDOWN_MS;
    this.account.modelRateLimits[model] = {
      isRateLimited: true,
      resetTime: Date.now() + cooldownMs,
    };
    this.account.consecutiveFailures += 1;
  }

  notifySuccess(account: AccountLike, model: string): void {
    if (account.email !== this.account.email) return;

    this.account.consecutiveFailures = 0;
    delete this.account.modelRateLimits[model];
  }

  notifyRateLimit(account: AccountLike, model: string): void {
    void account;
    void model;
    // Rate-limit state is handled by markRateLimited.
  }

  notifyFailure(account: AccountLike, model: string): void {
    void model;
    if (account.email === this.account.email) {
      this.account.consecutiveFailures += 1;
    }
  }
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null;
}

function asRecord(value: unknown): UnknownRecord {
  return isRecord(value) ? value : {};
}

function getString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function getNumber(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}

function toStringValue(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return undefined;
}

function getBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function getArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function extractRefreshToken(credentials: UnknownRecord | null | undefined): string | null {
  if (!credentials) return null;

  const record = asRecord(credentials);
  const oauthTokenData = asRecord(record.oauthTokenData ?? record.tokenData);

  return (
    getString(oauthTokenData.refresh_token) ??
    getString(oauthTokenData.refreshToken) ??
    getString(record.refreshToken) ??
    getString(record.refresh_token) ??
    null
  );
}

function extractAccessToken(credentials: UnknownRecord | null | undefined): string | null {
  if (!credentials) return null;

  const record = asRecord(credentials);
  const oauthTokenData = asRecord(record.oauthTokenData ?? record.tokenData);

  return (
    getString(oauthTokenData.access_token) ??
    getString(oauthTokenData.accessToken) ??
    getString(record.accessToken) ??
    getString(record.access_token) ??
    null
  );
}

function extractCredentialEmail(credentials: UnknownRecord | null | undefined): string {
  if (!credentials) return 'n8n-oauth-account';

  const record = asRecord(credentials);
  const oauthTokenData = asRecord(record.oauthTokenData ?? record.tokenData);

  return (
    getString(oauthTokenData.email) ??
    getString(oauthTokenData.user) ??
    getString(record.email) ??
    'n8n-oauth-account'
  );
}

function parseRefreshParts(
  refresh: string | null,
): { refreshToken: string; projectId?: string } {
  if (!refresh || typeof refresh !== 'string') {
    return { refreshToken: '' };
  }

  const [refreshToken = '', projectId = ''] = refresh.split('|');
  return {
    refreshToken,
    projectId: projectId || undefined,
  };
}

function parseExpiryMs(tokenData: UnknownRecord): number | null {
  const raw =
    getNumber(tokenData.expires_at) ??
    getNumber(tokenData.expiresAt) ??
    getNumber(tokenData.expires) ??
    null;

  if (raw === null) return null;
  return raw < 1_000_000_000_000 ? raw * 1000 : raw;
}

async function refreshAccessToken(credentials: UnknownRecord, refreshToken: string): Promise<string> {
  const tokenUrl = getString(credentials.accessTokenUrl) ?? 'https://oauth2.googleapis.com/token';
  const clientId = getString(credentials.clientId) ?? '';
  const clientSecret = getString(credentials.clientSecret) ?? '';

  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });

  if (clientId) params.set('client_id', clientId);
  if (clientSecret) params.set('client_secret', clientSecret);

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  if (!response.ok) {
    throw new Error(`OAuth refresh failed: ${response.status}`);
  }

  const tokenPayload = asRecord(await response.json());
  const accessToken = getString(tokenPayload.access_token);
  if (!accessToken) {
    throw new Error('OAuth refresh failed: access_token missing in response');
  }

  return accessToken;
}

async function resolveAccessToken(ctx: CredentialContext): Promise<string> {
  const credentials = asRecord(await ctx.getCredentials('antigravityOAuth2Api'));
  const tokenData = asRecord(credentials.oauthTokenData ?? credentials.tokenData);
  const accessToken = extractAccessToken(credentials);
  const refreshToken = extractRefreshToken(credentials);
  const expiresAtMs = parseExpiryMs(tokenData);
  const isFresh = expiresAtMs === null || expiresAtMs > Date.now() + 60_000;

  if (accessToken && isFresh) {
    return accessToken;
  }

  if (refreshToken) {
    try {
      return await refreshAccessToken(credentials, refreshToken);
    } catch {
      if (accessToken) return accessToken;
      throw new Error('Unable to refresh OAuth access token');
    }
  }

  if (accessToken) {
    return accessToken;
  }

  throw new Error('No OAuth access token available');
}

function createTokenSupplier(ctx: IExecuteFunctions): TokenSupplier {
  let cachedToken: string | null = null;

  return {
    async getToken() {
      if (cachedToken) return cachedToken;
      cachedToken = await resolveAccessToken(ctx);
      return cachedToken;
    },
    clearCache() {
      cachedToken = null;
    },
  };
}

function buildRequestHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    ...ANTIGRAVITY_HEADERS,
  };
}

export async function callGenerateContent(
  ctx: IExecuteFunctions,
  options: GenerateContentOptions,
): Promise<unknown> {
  const {
    anthropicRequest,
    projectId,
    enableGoogleSearch = false,
    outputContentAsJson = false,
  } = options;

  const credentials = asRecord(await ctx.getCredentials('antigravityOAuth2Api'));
  const manager = new SingleAccountManager(
    projectId,
    createTokenSupplier(ctx),
    extractCredentialEmail(credentials),
  );

  const request = {
    ...anthropicRequest,
    ...(enableGoogleSearch ? { google_search: true } : {}),
    ...(outputContentAsJson ? { response_mime_type: 'application/json' } : {}),
  } as AnthropicRequest;

  return await sendMessage(request, manager, false);
}

export async function fetchAvailableModels(
  ctx: IExecuteFunctions | ILoadOptionsFunctions,
  projectId?: string,
): Promise<unknown> {
  const token = await resolveAccessToken(ctx);
  return await fetchCloudCodeModels(token, projectId ?? null);
}

async function loadCodeAssist(
  ctx: IExecuteFunctions,
  projectId?: string,
): Promise<unknown> {
  const endpoints = [...LOAD_CODE_ASSIST_ENDPOINTS];

  let lastError: unknown = new Error('No endpoints available');

  for (const endpoint of endpoints) {
    try {
      const metadata: Record<string, unknown> = { ...CLIENT_METADATA };
      if (projectId) {
        metadata.duetProject = projectId;
      }

      const options: IHttpRequestOptions = {
        method: 'POST',
        url: `${endpoint}/v1internal:loadCodeAssist`,
        headers: buildRequestHeaders(),
        body: {
          metadata,
        },
        json: true,
      };

      return await ctx.helpers.requestOAuth2.call(ctx, 'antigravityOAuth2Api', options);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
}

async function onboardUser(
  ctx: IExecuteFunctions,
  tierId: string,
  projectId?: string,
  maxAttempts = 5,
  delayMs = 2000,
): Promise<string | null> {
  const endpoints = [...ANTIGRAVITY_ENDPOINT_FALLBACKS];

  for (const endpoint of endpoints) {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const metadata: Record<string, unknown> = { ...CLIENT_METADATA };
      if (projectId) {
        metadata.duetProject = projectId;
      }

      const options: IHttpRequestOptions = {
        method: 'POST',
        url: `${endpoint}/v1internal:onboardUser`,
        headers: buildRequestHeaders(),
        body: {
          tierId,
          metadata,
        },
        json: true,
      };

      try {
        const response = await ctx.helpers.requestOAuth2.call(ctx, 'antigravityOAuth2Api', options);
        const managedProjectId = response?.response?.cloudaicompanionProject?.id;

        if (response?.done && managedProjectId) {
          return managedProjectId;
        }

        if (response?.done && response?.response?.cloudaicompanionProject) {
          return response.response.cloudaicompanionProject;
        }
      } catch {
        break;
      }

      await sleep(delayMs);
    }
  }

  return null;
}

export async function getProjectId(
  ctx: IExecuteFunctions,
): Promise<string> {
  const staticData = ctx.getWorkflowStaticData('node') as StaticData;
  const credentials = asRecord(await ctx.getCredentials('antigravityOAuth2Api'));
  const refreshToken = extractRefreshToken(credentials);
  const refreshParts = parseRefreshParts(refreshToken);
  const refreshHash = refreshToken
    ? crypto.createHash('sha256').update(refreshToken).digest('hex').slice(0, 12)
    : '';
  const baseKey = getString(credentials.clientId) || 'default';
  const cacheKey = refreshHash ? `${baseKey}:${refreshHash}` : baseKey;
  const cache = staticData.projectCache?.[cacheKey];
  const now = Date.now();
  const ttlMs = 24 * 60 * 60 * 1000;

  if (cache && cache.projectId && now - cache.ts < ttlMs) {
    return cache.projectId;
  }

  const data = await loadCodeAssist(ctx, refreshParts.projectId);
  const dataRecord = asRecord(data);
  const project = dataRecord.cloudaicompanionProject;
  const projectRecord = isRecord(project) ? project : null;

  if (typeof project === 'string') {
    storeProjectCache(staticData, cacheKey, project);
    return project;
  }

  if (projectRecord?.id) {
    const projectId = toStringValue(projectRecord.id);
    if (projectId) {
      storeProjectCache(staticData, cacheKey, projectId);
      return projectId;
    }
  }

  const allowedTierRecords = getArray(dataRecord.allowedTiers).map((tier) => asRecord(tier));
  const defaultTier =
    toStringValue(allowedTierRecords.find((tier) => getBoolean(tier.isDefault))?.id) ||
    toStringValue(allowedTierRecords[0]?.id) ||
    'free-tier';
  const onboarded = await onboardUser(ctx, defaultTier, refreshParts.projectId);

  if (onboarded) {
    storeProjectCache(staticData, cacheKey, onboarded);
    return onboarded;
  }

  throw new NodeOperationError(ctx.getNode(), 'Failed to discover project ID');
}

function storeProjectCache(staticData: StaticData, cacheKey: string, projectId: string): void {
  staticData.projectCache = staticData.projectCache || {};
  staticData.projectCache[cacheKey] = { projectId, ts: Date.now() };
}
