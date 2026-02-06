/**
 * Model API for Cloud Code
 *
 * Handles model listing and quota retrieval from the Cloud Code API.
 */
import {
  ANTIGRAVITY_ENDPOINT_FALLBACKS,
  ANTIGRAVITY_HEADERS,
  LOAD_CODE_ASSIST_ENDPOINTS,
  LOAD_CODE_ASSIST_HEADERS,
  getModelFamily,
  MODEL_VALIDATION_CACHE_TTL_MS,
} from '../constants';
import { logger } from '../utils/logger';
import type {
  ModelQuotaMap,
  SubscriptionTier,
  UnknownRecord,
} from './types';

interface ModelQuotaInfo {
  remainingFraction?: number;
  resetTime?: string;
}

interface ModelData extends UnknownRecord {
  displayName?: string;
  quotaInfo?: ModelQuotaInfo;
}

interface FetchAvailableModelsResponse extends UnknownRecord {
  models?: Record<string, ModelData>;
}

interface TierInfo {
  id?: string;
  isDefault?: boolean;
}

interface LoadCodeAssistResponse extends UnknownRecord {
  paidTier?: TierInfo;
  currentTier?: TierInfo;
  allowedTiers?: TierInfo[];
  cloudaicompanionProject?: string | { id?: string };
}

interface ModelListItem {
  id: string;
  object: 'model';
  created: number;
  owned_by: string;
  description: string;
}

interface ModelCache {
  validModels: Set<string>;
  lastFetched: number;
  fetchPromise: Promise<void> | null;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// Model validation cache
const modelCache: ModelCache = {
  validModels: new Set<string>(),
  lastFetched: 0,
  fetchPromise: null, // Prevents concurrent fetches
};

/**
 * Check if a model is supported (Claude or Gemini)
 * @param modelId - Model ID to check
 * @returns True if model is supported
 */
function isSupportedModel(modelId: string): boolean {
  const family = getModelFamily(modelId);
  return family === 'claude' || family === 'gemini';
}

/**
 * List available models in Anthropic API format
 * Fetches models dynamically from the Cloud Code API
 */
export async function listModels(
  token: string,
): Promise<{ object: 'list'; data: ModelListItem[] }> {
  const data = await fetchAvailableModels(token);
  if (!data.models) {
    return { object: 'list', data: [] };
  }

  const modelList = Object.entries(data.models)
    .filter(([modelId]) => isSupportedModel(modelId))
    .map(([modelId, modelData]): ModelListItem => ({
      id: modelId,
      object: 'model',
      created: Math.floor(Date.now() / 1000),
      owned_by: 'anthropic',
      description: modelData.displayName || modelId,
    }));

  // Warm the model validation cache
  modelCache.validModels = new Set(modelList.map((m) => m.id));
  modelCache.lastFetched = Date.now();

  return {
    object: 'list',
    data: modelList,
  };
}

/**
 * Fetch available models with quota info from Cloud Code API.
 */
export async function fetchAvailableModels(
  token: string,
  projectId: string | null = null,
): Promise<FetchAvailableModelsResponse> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    ...ANTIGRAVITY_HEADERS,
  };

  // Include project ID in body for accurate quota info (per Quotio implementation)
  const body: UnknownRecord = projectId ? { project: projectId } : {};

  for (const endpoint of ANTIGRAVITY_ENDPOINT_FALLBACKS) {
    try {
      const url = `${endpoint}/v1internal:fetchAvailableModels`;
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        logger.warn(
          `[CloudCode] fetchAvailableModels error at ${endpoint}: ${response.status}`,
        );
        continue;
      }

      const rawData = (await response.json()) as UnknownRecord;
      const models =
        rawData.models && typeof rawData.models === 'object'
          ? (rawData.models as Record<string, ModelData>)
          : undefined;

      return { ...rawData, models };
    } catch (error) {
      logger.warn(
        `[CloudCode] fetchAvailableModels failed at ${endpoint}:`,
        getErrorMessage(error),
      );
    }
  }

  throw new Error('Failed to fetch available models from all endpoints');
}

/**
 * Get model quotas for an account.
 */
export async function getModelQuotas(
  token: string,
  projectId: string | null = null,
): Promise<ModelQuotaMap> {
  const data = await fetchAvailableModels(token, projectId);
  if (!data.models) return {};

  const quotas: ModelQuotaMap = {};
  for (const [modelId, modelData] of Object.entries(data.models)) {
    // Only include Claude and Gemini models
    if (!isSupportedModel(modelId)) continue;

    if (modelData.quotaInfo) {
      quotas[modelId] = {
        // When remainingFraction is missing but resetTime is present, quota is exhausted (0%)
        remainingFraction:
          modelData.quotaInfo.remainingFraction ??
          (modelData.quotaInfo.resetTime ? 0 : null),
        resetTime: modelData.quotaInfo.resetTime ?? null,
      };
    }
  }

  return quotas;
}

/**
 * Parse tier ID string to determine subscription level.
 */
export function parseTierId(
  tierId: string | null | undefined,
): SubscriptionTier {
  if (!tierId) return 'unknown';
  const lower = tierId.toLowerCase();

  if (lower.includes('ultra')) {
    return 'ultra';
  }
  if (lower === 'standard-tier') {
    // standard-tier = "Gemini Code Assist" (paid, project-based)
    return 'pro';
  }
  if (lower.includes('pro') || lower.includes('premium')) {
    return 'pro';
  }
  if (lower === 'free-tier' || lower.includes('free')) {
    return 'free';
  }
  return 'unknown';
}

/**
 * Get subscription tier for an account.
 */
export async function getSubscriptionTier(
  token: string,
): Promise<{ tier: SubscriptionTier; projectId: string | null }> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    ...LOAD_CODE_ASSIST_HEADERS,
  };

  for (const endpoint of LOAD_CODE_ASSIST_ENDPOINTS) {
    try {
      const url = `${endpoint}/v1internal:loadCodeAssist`;
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          metadata: {
            ideType: 'IDE_UNSPECIFIED',
            platform: 'PLATFORM_UNSPECIFIED',
            pluginType: 'GEMINI',
            duetProject: 'rising-fact-p41fc',
          },
        }),
      });

      if (!response.ok) {
        logger.warn(`[CloudCode] loadCodeAssist error at ${endpoint}: ${response.status}`);
        continue;
      }

      const rawData = (await response.json()) as UnknownRecord;
      const data: LoadCodeAssistResponse = {
        ...rawData,
        paidTier:
          rawData.paidTier && typeof rawData.paidTier === 'object'
            ? (rawData.paidTier as TierInfo)
            : undefined,
        currentTier:
          rawData.currentTier && typeof rawData.currentTier === 'object'
            ? (rawData.currentTier as TierInfo)
            : undefined,
        allowedTiers: Array.isArray(rawData.allowedTiers)
          ? (rawData.allowedTiers as TierInfo[])
          : undefined,
      };

      // Debug: Log all tier-related fields from the response
      logger.debug(
        `[CloudCode] loadCodeAssist tier data: paidTier=${JSON.stringify(
          data.paidTier,
        )}, currentTier=${JSON.stringify(data.currentTier)}, allowedTiers=${JSON.stringify(
          data.allowedTiers?.map((t) => ({ id: t?.id, isDefault: t?.isDefault })),
        )}`,
      );

      // Extract project ID
      let projectId: string | null = null;
      if (typeof data.cloudaicompanionProject === 'string') {
        projectId = data.cloudaicompanionProject;
      } else if (data.cloudaicompanionProject?.id) {
        projectId = data.cloudaicompanionProject.id;
      }

      // Extract subscription tier
      // Priority: paidTier > currentTier > allowedTiers
      let tier: SubscriptionTier = 'unknown';
      let tierId: string | null = null;
      let tierSource: 'paidTier' | 'currentTier' | 'allowedTiers' | null = null;

      // 1. Check paidTier first (Google One AI subscription - most reliable)
      if (data.paidTier?.id) {
        tierId = data.paidTier.id;
        tier = parseTierId(tierId);
        tierSource = 'paidTier';
      }

      // 2. Fall back to currentTier if paidTier didn't give us a tier
      if (tier === 'unknown' && data.currentTier?.id) {
        tierId = data.currentTier.id;
        tier = parseTierId(tierId);
        tierSource = 'currentTier';
      }

      // 3. Fall back to allowedTiers (find the default or first non-free tier)
      if (
        tier === 'unknown' &&
        Array.isArray(data.allowedTiers) &&
        data.allowedTiers.length > 0
      ) {
        // First look for the default tier
        let defaultTier = data.allowedTiers.find((t) => t?.isDefault);
        if (!defaultTier) {
          defaultTier = data.allowedTiers[0];
        }
        if (defaultTier?.id) {
          tierId = defaultTier.id;
          tier = parseTierId(tierId);
          tierSource = 'allowedTiers';
        }
      }

      logger.debug(
        `[CloudCode] Subscription detected: ${tier} (tierId: ${tierId}, source: ${tierSource}), Project: ${projectId}`,
      );

      return { tier, projectId };
    } catch (error) {
      logger.warn(
        `[CloudCode] loadCodeAssist failed at ${endpoint}:`,
        getErrorMessage(error),
      );
    }
  }

  // Fallback: return default values if all endpoints fail
  logger.warn(
    '[CloudCode] Failed to detect subscription tier from all endpoints. Defaulting to free.',
  );
  return { tier: 'free', projectId: null };
}

/**
 * Populate the model validation cache.
 */
async function populateModelCache(
  token: string,
  projectId: string | null = null,
): Promise<void> {
  const now = Date.now();

  // Check if cache is fresh
  if (
    modelCache.validModels.size > 0 &&
    now - modelCache.lastFetched < MODEL_VALIDATION_CACHE_TTL_MS
  ) {
    return;
  }

  // If already fetching, wait for it
  if (modelCache.fetchPromise) {
    await modelCache.fetchPromise;
    return;
  }

  // Start fetch
  modelCache.fetchPromise = (async () => {
    try {
      const data = await fetchAvailableModels(token, projectId);
      if (data.models) {
        const validIds = Object.keys(data.models).filter((modelId) =>
          isSupportedModel(modelId),
        );
        modelCache.validModels = new Set(validIds);
        modelCache.lastFetched = Date.now();
        logger.debug(`[CloudCode] Model cache populated with ${validIds.length} models`);
      }
    } catch (error) {
      logger.warn('[CloudCode] Failed to populate model cache:', getErrorMessage(error));
      // Don't throw - validation should degrade gracefully
    } finally {
      modelCache.fetchPromise = null;
    }
  })();

  await modelCache.fetchPromise;
}

/**
 * Check if a model ID is valid (exists in the available models list).
 */
export async function isValidModel(
  modelId: string,
  token: string,
  projectId: string | null = null,
): Promise<boolean> {
  try {
    // Populate cache if needed
    await populateModelCache(token, projectId);

    // If cache is populated, validate against it
    if (modelCache.validModels.size > 0) {
      return modelCache.validModels.has(modelId);
    }

    // Cache empty (fetch failed) - fail open, let API validate
    return true;
  } catch (error) {
    logger.debug(`[CloudCode] Model validation error: ${getErrorMessage(error)}`);
    // Fail open - let the API validate
    return true;
  }
}
