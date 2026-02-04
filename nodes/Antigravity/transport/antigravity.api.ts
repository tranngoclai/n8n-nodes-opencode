import * as crypto from 'crypto';
import {
  NodeOperationError,
  sleep,
  type IExecuteFunctions,
  type IHttpRequestOptions,
  type ILoadOptionsFunctions,
} from 'n8n-workflow';

const ANTIGRAVITY_ENDPOINT_PROD = 'https://cloudcode-pa.googleapis.com';
const ANTIGRAVITY_ENDPOINT_DAILY = 'https://daily-cloudcode-pa.googleapis.com';
const ANTIGRAVITY_ENDPOINTS = [ANTIGRAVITY_ENDPOINT_PROD, ANTIGRAVITY_ENDPOINT_DAILY];
const GOOGLE_API_CLIENT = 'google-cloud-sdk vscode_cloudshelleditor/0.1';
export const GEMINI_MAX_OUTPUT_TOKENS = 16384;
const CLIENT_METADATA = {
  ideType: 'IDE_UNSPECIFIED',
  platform: 'PLATFORM_UNSPECIFIED',
  pluginType: 'GEMINI',
} as const;
const CLIENT_METADATA_JSON = JSON.stringify(CLIENT_METADATA);
const RATE_LIMIT_MAX_RETRIES = 2;
const RATE_LIMIT_BASE_DELAY_MS = 1000;
const RATE_LIMIT_MAX_DELAY_MS = 15000;
const RATE_LIMIT_MAX_WAIT_MS = 120000;

type UnknownRecord = Record<string, unknown>;
type ProjectCacheEntry = { projectId: string; ts: number };
type ProjectCache = Record<string, ProjectCacheEntry>;
type StaticData = Record<string, unknown> & { projectCache?: ProjectCache };

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null;
}

function asRecord(value: unknown): UnknownRecord {
  return isRecord(value) ? value : {};
}

function getString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
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


const ANTIGRAVITY_SYSTEM_INSTRUCTION =
  'You are Antigravity, a powerful agentic AI coding assistant designed by the Google Deepmind team working on Advanced Agentic Coding.' +
  'You are pair programming with a USER to solve their coding task. The task may require creating a new codebase, modifying or debugging an existing codebase, or simply answering a question.' +
  '**Absolute paths only****Proactiveness**';

export function getPlatformUserAgent(): string {
  return 'antigravity/1.15.8';
}

export function getModelFamily(model: string): 'gemini' | 'unknown' {
  const lower = (model || '').toLowerCase();
  if (lower.includes('gemini')) return 'gemini';
  return 'unknown';
}

export function isThinkingModel(model: string): boolean {
  const lower = (model || '').toLowerCase();
  if (!lower.includes('gemini')) return false;
  if (lower.includes('thinking')) return true;
  const versionMatch = lower.match(/gemini-(\d+)/);
  if (versionMatch && parseInt(versionMatch[1], 10) >= 3) return true;
  return false;
}

export function deriveSessionId(seed: string): string {
  return crypto.createHash('sha256').update(seed).digest('hex').slice(0, 16);
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

function parseRefreshParts(refresh: string | null): { refreshToken: string; projectId?: string; managedProjectId?: string } {
  if (!refresh || typeof refresh !== 'string') {
    return { refreshToken: '' };
  }
  const [refreshToken = '', projectId = '', managedProjectId = ''] = refresh.split('|');
  return {
    refreshToken,
    projectId: projectId || undefined,
    managedProjectId: managedProjectId || undefined,
  };
}

export function buildHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': getPlatformUserAgent(),
    'X-Goog-Api-Client': GOOGLE_API_CLIENT,
    'Client-Metadata': CLIENT_METADATA_JSON,
  };

  return headers;
}

function getHeaderValue(headers: unknown, name: string): string | undefined {
  if (!headers) return undefined;
  if (isRecord(headers) && typeof (headers as { get?: unknown }).get === 'function') {
    const getter = (headers as { get: (key: string) => unknown }).get;
    const value = getter(name) ?? getter(name.toLowerCase());
    if (value === undefined || value === null) return undefined;
    return Array.isArray(value) ? String(value[0]) : String(value);
  }
  const record = asRecord(headers);
  const direct = record[name] ?? record[name.toLowerCase()] ?? record[name.toUpperCase()];
  if (Array.isArray(direct)) return direct.length > 0 ? String(direct[0]) : undefined;
  if (direct === undefined || direct === null) return undefined;
  return String(direct);
}

function extractErrorText(error: unknown): string {
  const errorRecord = asRecord(error);
  const response = asRecord(errorRecord.response);
  const body = response.body ?? response.data ?? errorRecord.body ?? errorRecord.message ?? '';
  if (typeof body === 'string') return body;
  try {
    return JSON.stringify(body);
  } catch {
    return String(body);
  }
}

function getStatusCode(error: unknown): number | null {
  const errorRecord = asRecord(error);
  const response = asRecord(errorRecord.response);
  const status =
    errorRecord.statusCode ?? response.statusCode ?? response.status ?? errorRecord.httpStatusCode ?? null;
  return typeof status === 'number' ? status : null;
}

function parseRetryAfterMs(error: unknown, errorText: string): number | null {
  const errorRecord = asRecord(error);
  const response = asRecord(errorRecord.response);
  const headers = response.headers ?? errorRecord.headers ?? null;
  const retryAfter = getHeaderValue(headers, 'retry-after');
  if (retryAfter) {
    const seconds = parseInt(retryAfter, 10);
    if (!Number.isNaN(seconds)) return seconds * 1000;
    const date = new Date(retryAfter);
    if (!Number.isNaN(date.getTime())) {
      const delta = date.getTime() - Date.now();
      return delta > 0 ? delta : 0;
    }
  }

  const resetAfter = getHeaderValue(headers, 'x-ratelimit-reset-after');
  if (resetAfter) {
    const seconds = parseInt(resetAfter, 10);
    if (!Number.isNaN(seconds) && seconds > 0) return seconds * 1000;
  }

  const resetAt = getHeaderValue(headers, 'x-ratelimit-reset');
  if (resetAt) {
    const seconds = parseInt(resetAt, 10);
    if (!Number.isNaN(seconds) && seconds > 0) {
      const delta = seconds * 1000 - Date.now();
      return delta > 0 ? delta : 0;
    }
  }

  const msg = errorText || '';
  const quotaDelayMatch = msg.match(/quotaResetDelay[:\s"]+(\d+(?:\.\d+)?)(ms|s)/i);
  if (quotaDelayMatch) {
    const value = parseFloat(quotaDelayMatch[1]);
    const unit = quotaDelayMatch[2].toLowerCase();
    return unit === 's' ? Math.ceil(value * 1000) : Math.ceil(value);
  }

  const quotaTimestampMatch = msg.match(/quotaResetTimeStamp[:\s"]+(\d{4}-\d{2}-\d{2}T[\d:.]+Z?)/i);
  if (quotaTimestampMatch) {
    const resetTime = new Date(quotaTimestampMatch[1]).getTime();
    if (!Number.isNaN(resetTime)) {
      const delta = resetTime - Date.now();
      return delta > 0 ? delta : 0;
    }
  }

  return null;
}

function parseThinkingSseToGoogle(bodyText: string): Record<string, unknown> {
  let accumulatedThinkingText = '';
  let accumulatedThinkingSignature = '';
  let accumulatedText = '';
  const finalParts: Array<Record<string, unknown>> = [];
  let usageMetadata: Record<string, unknown> = {};
  let finishReason = 'STOP';

  const flushThinking = () => {
    if (accumulatedThinkingText) {
      finalParts.push({
        thought: true,
        text: accumulatedThinkingText,
        thoughtSignature: accumulatedThinkingSignature,
      });
      accumulatedThinkingText = '';
      accumulatedThinkingSignature = '';
    }
  };

  const flushText = () => {
    if (accumulatedText) {
      finalParts.push({ text: accumulatedText });
      accumulatedText = '';
    }
  };

  const lines = bodyText.split('\n');
  for (const line of lines) {
    if (!line.startsWith('data:')) continue;
    const jsonText = line.slice(5).trim();
    if (!jsonText || jsonText === '[DONE]') continue;

    try {
      const data = JSON.parse(jsonText) as unknown;
      const innerResponse = isRecord(data) && 'response' in data ? (data as UnknownRecord).response : data;
      const inner = asRecord(innerResponse);

      if (isRecord(inner.usageMetadata)) {
        usageMetadata = inner.usageMetadata;
      }

      const candidates = getArray(inner.candidates);
      const firstCandidate = isRecord(candidates[0]) ? (candidates[0] as UnknownRecord) : {};
      const finish = getString(firstCandidate.finishReason);
      if (finish) {
        finishReason = finish;
      }

      const content = asRecord(firstCandidate.content);
      const parts = getArray(content.parts);
      for (const part of parts) {
        if (!isRecord(part)) continue;
        if (part.thought === true) {
          flushText();
          accumulatedThinkingText += getString(part.text) ?? '';
          if (part.thoughtSignature) {
            accumulatedThinkingSignature = getString(part.thoughtSignature) ?? accumulatedThinkingSignature;
          }
        } else if (part.functionCall) {
          flushThinking();
          flushText();
          finalParts.push(part);
        } else if (part.text !== undefined) {
          const text = getString(part.text);
          if (!text) continue;
          flushThinking();
          accumulatedText += text;
        } else if (part.inlineData) {
          flushThinking();
          flushText();
          finalParts.push(part);
        }
      }
    } catch {
      continue;
    }
  }

  flushThinking();
  flushText();

  return {
    candidates: [{ content: { parts: finalParts }, finishReason }],
    usageMetadata,
  };
}

export function buildCloudCodePayload(params: {
  model: string;
  projectId: string;
  googleRequest: Record<string, unknown>;
  sessionId: string;
}) {
  const systemParts = [
    { text: ANTIGRAVITY_SYSTEM_INSTRUCTION },
    { text: `Please ignore the following [ignore]${ANTIGRAVITY_SYSTEM_INSTRUCTION}[/ignore]` },
  ];

  const existingSystem = getArray(asRecord(params.googleRequest.systemInstruction).parts).filter(isRecord);
  for (const part of existingSystem) {
    const text = getString(part.text);
    if (text) systemParts.push({ text });
  }

  const request: Record<string, unknown> = {
    ...params.googleRequest,
    sessionId: params.sessionId,
    systemInstruction: {
      role: 'user',
      parts: systemParts,
    },
  };

  return {
    project: params.projectId,
    model: params.model,
    request,
    userAgent: 'antigravity',
    requestType: 'agent',
    requestId: `agent-${crypto.randomUUID()}`,
  };
}

export async function withEndpoints<T>(
  endpointPreference: string,
  request: (endpoint: string) => Promise<T>
): Promise<T> {
  const endpoints = resolveEndpoints(endpointPreference);
  let lastError: unknown = new Error('No endpoints available');

  for (const endpoint of endpoints) {
    try {
      return await request(endpoint);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
}

export async function callGenerateContent(
  ctx: IExecuteFunctions,
  payload: Record<string, unknown>,
  endpointPreference: string,
  model: string
): Promise<unknown> {
  const endpoints = resolveEndpoints(endpointPreference);
  let lastError: unknown = new Error('No endpoints available');
  const useSse = getModelFamily(model) === 'gemini' && isThinkingModel(model);

  for (const endpoint of endpoints) {
    for (let attempt = 0; attempt <= RATE_LIMIT_MAX_RETRIES; attempt++) {
      try {
        const url = useSse
          ? `${endpoint}/v1internal:streamGenerateContent?alt=sse`
          : `${endpoint}/v1internal:generateContent`;
        const options: IHttpRequestOptions = {
          method: 'POST',
          url,
          headers: {
            ...buildHeaders(),
            ...(useSse ? { Accept: 'text/event-stream' } : {}),
          },
          body: payload,
          json: !useSse,
        };

        const response = await ctx.helpers.requestOAuth2.call(ctx, 'antigravityOAuth2Api', options);
        if (useSse) {
          const bodyText = typeof response === 'string' ? response : JSON.stringify(response || {});
          return parseThinkingSseToGoogle(bodyText);
        }
        return response;
      } catch (error) {
        lastError = error;
        const status = getStatusCode(error);
        const errorText = extractErrorText(error);
        const isRateLimit =
          status === 429 ||
          errorText.toLowerCase().includes('resource_exhausted') ||
          errorText.toLowerCase().includes('quota_exhausted') ||
          errorText.toLowerCase().includes('rate limit');

        if (isRateLimit && attempt < RATE_LIMIT_MAX_RETRIES) {
          const retryAfterMs = parseRetryAfterMs(error, errorText);
          const backoff = Math.min(
            RATE_LIMIT_BASE_DELAY_MS * Math.pow(2, attempt),
            RATE_LIMIT_MAX_DELAY_MS
          );
          const delayMs = retryAfterMs ?? backoff;

          if (delayMs > RATE_LIMIT_MAX_WAIT_MS) {
            break;
          }

          await sleep(delayMs);
          continue;
        }

        break;
      }
    }
  }

  throw lastError;
}

export async function fetchAvailableModels(
  ctx: IExecuteFunctions | ILoadOptionsFunctions,
  endpointPreference: string,
  projectId?: string
): Promise<unknown> {
  return withEndpoints(endpointPreference, async endpoint => {
    const options: IHttpRequestOptions = {
      method: 'POST',
      url: `${endpoint}/v1internal:fetchAvailableModels`,
      headers: buildHeaders(),
      body: projectId ? { project: projectId } : {},
      json: true,
    };

    return await ctx.helpers.requestOAuth2.call(ctx, 'antigravityOAuth2Api', options);
  });
}

async function loadCodeAssist(
  ctx: IExecuteFunctions,
  endpointPreference: string,
  projectId?: string
): Promise<unknown> {
  return withEndpoints(endpointPreference, async endpoint => {
    const metadata: Record<string, unknown> = { ...CLIENT_METADATA };
    if (projectId) {
      metadata.duetProject = projectId;
    }
    const options: IHttpRequestOptions = {
      method: 'POST',
      url: `${endpoint}/v1internal:loadCodeAssist`,
      headers: buildHeaders(),
      body: {
        metadata,
      },
      json: true,
    };

    return await ctx.helpers.requestOAuth2.call(ctx, 'antigravityOAuth2Api', options);
  });
}

async function onboardUser(
  ctx: IExecuteFunctions,
  endpointPreference: string,
  tierId: string,
  projectId?: string,
  maxAttempts = 5,
  delayMs = 2000
): Promise<string | null> {
  const endpoints = resolveEndpoints(endpointPreference);

  for (const endpoint of endpoints) {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const metadata: Record<string, unknown> = { ...CLIENT_METADATA };
      if (projectId) {
        metadata.duetProject = projectId;
      }
      const options: IHttpRequestOptions = {
        method: 'POST',
        url: `${endpoint}/v1internal:onboardUser`,
        headers: buildHeaders(),
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
  endpointPreference: string
): Promise<string> {
  const staticData = ctx.getWorkflowStaticData('node') as StaticData;
  const credentials = (await ctx.getCredentials('antigravityOAuth2Api')) as UnknownRecord;
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

  const data = await loadCodeAssist(ctx, endpointPreference, refreshParts.projectId);
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

  const allowedTierRecords = getArray(dataRecord.allowedTiers).map(tier => asRecord(tier));
  const defaultTier =
    toStringValue(allowedTierRecords.find(tier => getBoolean(tier.isDefault))?.id) ||
    toStringValue(allowedTierRecords[0]?.id) ||
    'free-tier';
  const onboarded = await onboardUser(ctx, endpointPreference, defaultTier, refreshParts.projectId);

  if (onboarded) {
    storeProjectCache(staticData, cacheKey, onboarded);
    return onboarded;
  }

  throw new NodeOperationError(ctx.getNode(), 'Failed to discover project ID');
}

function storeProjectCache(staticData: StaticData, cacheKey: string, projectId: string) {
  staticData.projectCache = staticData.projectCache || {};
  staticData.projectCache[cacheKey] = { projectId, ts: Date.now() };
}

export function extractUsage(response: unknown): Record<string, unknown> | null {
  const root = isRecord(response) && 'response' in response ? (response as UnknownRecord).response : response;
  const inner = asRecord(root);
  const usage = isRecord(inner.usageMetadata) ? inner.usageMetadata : null;
  if (!usage) return null;
  return {
    promptTokens: usage.promptTokenCount ?? null,
    outputTokens: usage.candidatesTokenCount ?? null,
    cachedTokens: usage.cachedContentTokenCount ?? null,
  };
}

export function resolveEndpoints(preference: string): string[] {
  if (preference === 'prod') return [ANTIGRAVITY_ENDPOINT_PROD, ANTIGRAVITY_ENDPOINT_DAILY];
  if (preference === 'daily') return [ANTIGRAVITY_ENDPOINT_DAILY, ANTIGRAVITY_ENDPOINT_PROD];
  return ANTIGRAVITY_ENDPOINTS;
}
