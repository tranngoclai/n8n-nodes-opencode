export type UnknownRecord = Record<string, unknown>;

export interface AnthropicContentBlock extends UnknownRecord {
  type?: string;
  text?: string;
}

export interface AnthropicMessage extends UnknownRecord {
  role: string;
  content?: string | AnthropicContentBlock[];
}

export interface AnthropicRequest extends UnknownRecord {
  model: string;
  messages?: AnthropicMessage[];
  max_tokens?: number;
  thinking?: UnknownRecord;
}

export type AnthropicResponse = UnknownRecord;

export interface AccountLike extends UnknownRecord {
  email: string;
  lastUsed?: number;
  modelRateLimits?: Record<string, { isRateLimited: boolean; resetTime: number }>;
}

export interface SelectedAccount {
  account: AccountLike | null;
  waitMs: number;
}

export interface AccountManagerLike {
  getAccountCount(): number;
  clearExpiredLimits(): void;
  getAvailableAccounts(model: string): AccountLike[];
  isAllRateLimited(model: string): boolean;
  getMinWaitTimeMs(model: string): number;
  selectAccount(model: string): SelectedAccount;
  getTokenForAccount(account: AccountLike): Promise<string>;
  getProjectForAccount(account: AccountLike, token: string): Promise<string>;
  markInvalid(email: string, reason: string): void;
  clearTokenCache(email: string): void;
  clearProjectCache(email: string): void;
  getConsecutiveFailures(email: string): number;
  incrementConsecutiveFailures(email: string): void;
  markRateLimited(email: string, waitMs: number | null, model: string): void;
  notifySuccess(account: AccountLike, model: string): void;
  notifyRateLimit(account: AccountLike, model: string): void;
  notifyFailure(account: AccountLike, model: string): void;
}

export interface CloudCodePayload extends UnknownRecord {
  project: string;
  model: string;
  request: UnknownRecord;
  userAgent: string;
  requestType: string;
  requestId: string;
}

export interface BackoffInfo {
  attempt: number;
  delayMs: number;
  isDuplicate: boolean;
}

export type SubscriptionTier = 'free' | 'pro' | 'ultra' | 'unknown';

export interface ModelQuota {
  remainingFraction: number | null;
  resetTime: string | null;
}

export type ModelQuotaMap = Record<string, ModelQuota>;

export interface LoggerLike {
  debug: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  log: (...args: unknown[]) => void;
  success?: (...args: unknown[]) => void;
}

export interface ErrorWithMessage extends Error {
  message: string;
  is429?: boolean;
  resetMs?: number | null;
  errorText?: string;
}
