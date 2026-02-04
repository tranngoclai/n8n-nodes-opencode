import * as crypto from 'crypto';
import {
  NodeOperationError,
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
const DEBUG_N8N =
  process.env.ANTIGRAVITY_N8N_DEBUG === 'true' ||
  process.env.ANTIGRAVITY_N8N_DEBUG === '1' ||
  process.env.DEBUG_ANTIGRAVITY_N8N === 'true' ||
  process.env.DEBUG_ANTIGRAVITY_N8N === '1';
const RATE_LIMIT_MAX_RETRIES = 2;
const RATE_LIMIT_BASE_DELAY_MS = 1000;
const RATE_LIMIT_MAX_DELAY_MS = 15000;
const RATE_LIMIT_MAX_WAIT_MS = 120000;

const ANTIGRAVITY_SYSTEM_INSTRUCTION =
  'You are Antigravity, a powerful agentic AI coding assistant designed by the Google Deepmind team working on Advanced Agentic Coding.' +
  'You are pair programming with a USER to solve their coding task. The task may require creating a new codebase, modifying or debugging an existing codebase, or simply answering a question.' +
  '**Absolute paths only****Proactiveness**';

export function getPlatformUserAgent(): string {
  const os = process.platform;
  const architecture = process.arch;
  return `antigravity/1.15.8 ${os}/${architecture}`;
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

function extractRefreshToken(credentials: Record<string, any> | null | undefined): string | null {
  if (!credentials) return null;
  const oauthTokenData = credentials.oauthTokenData || credentials.tokenData || null;
  return (
    oauthTokenData?.refresh_token ||
    oauthTokenData?.refreshToken ||
    credentials.refreshToken ||
    credentials.refresh_token ||
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

export function buildHeaders(model: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': getPlatformUserAgent(),
    'X-Goog-Api-Client': GOOGLE_API_CLIENT,
    'Client-Metadata': CLIENT_METADATA_JSON,
  };

  return headers;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function debugLog(message: string, data?: unknown) {
  if (!DEBUG_N8N) return;
  if (data !== undefined) {
    console.log(`[Antigravity n8n] ${message}`, data);
  } else {
    console.log(`[Antigravity n8n] ${message}`);
  }
}

function getHeaderValue(headers: any, name: string): string | undefined {
  if (!headers) return undefined;
  if (typeof headers.get === 'function') {
    return headers.get(name) || headers.get(name.toLowerCase()) || undefined;
  }
  const direct = headers[name] || headers[name.toLowerCase()] || headers[name.toUpperCase()];
  if (Array.isArray(direct)) return direct[0];
  if (direct === undefined || direct === null) return undefined;
  return String(direct);
}

function extractErrorText(error: any): string {
  const body = error?.response?.body ?? error?.response?.data ?? error?.body ?? error?.message ?? '';
  if (typeof body === 'string') return body;
  try {
    return JSON.stringify(body);
  } catch {
    return String(body);
  }
}

function getStatusCode(error: any): number | null {
  return (
    error?.statusCode ||
    error?.response?.statusCode ||
    error?.response?.status ||
    error?.httpStatusCode ||
    null
  );
}

function parseRetryAfterMs(error: any, errorText: string): number | null {
  const headers = error?.response?.headers ?? error?.headers ?? null;
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

function formatErrorSnippet(errorText: string, maxLen = 300): string {
  if (!errorText) return '';
  const trimmed = errorText.replace(/\s+/g, ' ').trim();
  if (trimmed.length <= maxLen) return trimmed;
  return `${trimmed.slice(0, maxLen)}…`;
}

function parseThinkingSseToGoogle(bodyText: string): Record<string, any> {
  let accumulatedThinkingText = '';
  let accumulatedThinkingSignature = '';
  let accumulatedText = '';
  const finalParts: Array<Record<string, any>> = [];
  let usageMetadata: Record<string, any> = {};
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
      const data = JSON.parse(jsonText);
      const innerResponse = data?.response || data;

      if (innerResponse?.usageMetadata) {
        usageMetadata = innerResponse.usageMetadata;
      }

      const candidates = innerResponse?.candidates || [];
      const firstCandidate = candidates[0] || {};
      if (firstCandidate.finishReason) {
        finishReason = firstCandidate.finishReason;
      }

      const parts = firstCandidate.content?.parts || [];
      for (const part of parts) {
        if (part?.thought === true) {
          flushText();
          accumulatedThinkingText += part.text || '';
          if (part.thoughtSignature) {
            accumulatedThinkingSignature = part.thoughtSignature;
          }
        } else if (part?.functionCall) {
          flushThinking();
          flushText();
          finalParts.push(part);
        } else if (part?.text !== undefined) {
          if (!part.text) continue;
          flushThinking();
          accumulatedText += part.text;
        } else if (part?.inlineData) {
          flushThinking();
          flushText();
          finalParts.push(part);
        }
      }
    } catch (error) {
      debugLog('SSE parse warning', { error: String(error) });
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
  googleRequest: Record<string, any>;
  sessionId: string;
}) {
  const systemParts = [
    { text: ANTIGRAVITY_SYSTEM_INSTRUCTION },
    { text: `Please ignore the following [ignore]${ANTIGRAVITY_SYSTEM_INSTRUCTION}[/ignore]` },
  ];

  const existingSystem = params.googleRequest.systemInstruction?.parts || [];
  for (const part of existingSystem) {
    if (part?.text) {
      systemParts.push({ text: part.text });
    }
  }

  const request: Record<string, any> = {
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
): Promise<any> {
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
            ...buildHeaders(model),
            ...(useSse ? { Accept: 'text/event-stream' } : {}),
          },
          body: payload,
          json: !useSse,
        };

        if (DEBUG_N8N && attempt === 0) {
          const summary = {
            endpoint,
            url,
            model,
            project: (payload as any)?.project,
            requestId: (payload as any)?.requestId,
            requestType: (payload as any)?.requestType,
            userAgent: (payload as any)?.userAgent,
            sessionId: (payload as any)?.request?.sessionId,
            contentsCount: Array.isArray((payload as any)?.request?.contents)
              ? (payload as any).request.contents.length
              : 0,
            hasTools: Array.isArray((payload as any)?.request?.tools)
              ? (payload as any).request.tools.length > 0
              : false,
            headerKeys: Object.keys(options.headers || {}),
            useSse,
          };
          debugLog('GenerateContent request', summary);
        }

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
        if (DEBUG_N8N && status !== 429) {
          debugLog('Endpoint error', {
            endpoint,
            status,
            error: formatErrorSnippet(errorText),
          });
        }
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

          debugLog('Rate limit response', {
            endpoint,
            status,
            retryAfterMs: retryAfterMs ?? null,
            error: formatErrorSnippet(errorText),
          });

          if (delayMs > RATE_LIMIT_MAX_WAIT_MS) {
            debugLog('Rate limit delay too long, not retrying', { endpoint, delayMs });
            break;
          }

          debugLog('Rate limit retry', { endpoint, attempt: attempt + 1, delayMs, status });
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
): Promise<any> {
  return withEndpoints(endpointPreference, async endpoint => {
    const options: IHttpRequestOptions = {
      method: 'POST',
      url: `${endpoint}/v1internal:fetchAvailableModels`,
      headers: buildHeaders(''),
      body: projectId ? { project: projectId } : {},
      json: true,
    };

    return await ctx.helpers.requestOAuth2.call(ctx as any, 'antigravityOAuth2Api', options);
  });
}

async function loadCodeAssist(
  ctx: IExecuteFunctions,
  endpointPreference: string,
  projectId?: string
): Promise<any> {
  return withEndpoints(endpointPreference, async endpoint => {
    const metadata: Record<string, any> = { ...CLIENT_METADATA };
    if (projectId) {
      metadata.duetProject = projectId;
    }
    const options: IHttpRequestOptions = {
      method: 'POST',
      url: `${endpoint}/v1internal:loadCodeAssist`,
      headers: buildHeaders(''),
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
      const metadata: Record<string, any> = { ...CLIENT_METADATA };
      if (projectId) {
        metadata.duetProject = projectId;
      }
      const options: IHttpRequestOptions = {
        method: 'POST',
        url: `${endpoint}/v1internal:onboardUser`,
        headers: buildHeaders(''),
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
  const staticData = ctx.getWorkflowStaticData('node') as Record<string, any>;
  const credentials = await ctx.getCredentials('antigravityOAuth2Api');
  const overrideProjectId =
    (process.env.ANTIGRAVITY_N8N_PROJECT_ID ||
      process.env.ANTIGRAVITY_PROJECT_ID ||
      process.env.ANTIGRAVITY_PROJECT ||
      '')
      .trim();
  if (overrideProjectId) {
    debugLog('Project override enabled', { projectId: overrideProjectId });
    return overrideProjectId;
  }
  const refreshToken = extractRefreshToken(credentials as Record<string, any>);
  const refreshParts = parseRefreshParts(refreshToken);
  const refreshHash = refreshToken
    ? crypto.createHash('sha256').update(refreshToken).digest('hex').slice(0, 12)
    : '';
  const baseKey = (credentials?.clientId as string) || 'default';
  const cacheKey = refreshHash ? `${baseKey}:${refreshHash}` : baseKey;
  const cache = staticData.projectCache?.[cacheKey];
  const now = Date.now();
  const ttlMs = 24 * 60 * 60 * 1000;

  debugLog('Project cache key', {
    baseKey,
    cacheKey,
    hasCompositeRefresh: !!(refreshToken && refreshToken.includes('|')),
    duetProject: refreshParts.projectId || null,
    hasRefreshToken: !!refreshToken,
    refreshTokenLength: refreshToken ? refreshToken.length : 0,
    oauthTokenDataKeys: credentials?.oauthTokenData ? Object.keys(credentials.oauthTokenData) : [],
  });

  if (cache && cache.projectId && now - cache.ts < ttlMs) {
    return cache.projectId;
  }

  const data = await loadCodeAssist(ctx, endpointPreference, refreshParts.projectId);
  const project = data?.cloudaicompanionProject;

  if (typeof project === 'string') {
    storeProjectCache(staticData, cacheKey, project);
    return project;
  }
  if (project?.id) {
    storeProjectCache(staticData, cacheKey, project.id);
    return project.id;
  }

  const allowedTiers = data?.allowedTiers || [];
  const defaultTier = allowedTiers.find((tier: any) => tier?.isDefault)?.id || allowedTiers[0]?.id || 'free-tier';
  const onboarded = await onboardUser(ctx, endpointPreference, defaultTier, refreshParts.projectId);

  if (onboarded) {
    storeProjectCache(staticData, cacheKey, onboarded);
    return onboarded;
  }

  throw new NodeOperationError(ctx.getNode(), 'Failed to discover project ID');
}

function storeProjectCache(staticData: Record<string, any>, cacheKey: string, projectId: string) {
  staticData.projectCache = staticData.projectCache || {};
  staticData.projectCache[cacheKey] = { projectId, ts: Date.now() };
}

export function extractUsage(response: any): Record<string, unknown> | null {
  const inner = response?.response || response;
  const usage = inner?.usageMetadata;
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
