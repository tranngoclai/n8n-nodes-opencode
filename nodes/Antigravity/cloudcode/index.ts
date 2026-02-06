/**
 * Cloud Code Client for Antigravity
 *
 * Communicates with Google's Cloud Code internal API using the
 * v1internal:streamGenerateContent endpoint with proper request wrapping.
 *
 * Supports multi-account load balancing with automatic failover.
 *
 * Based on: https://github.com/NoeFabris/opencode-antigravity-auth
 */

// Re-export public API
export { sendMessage } from './message-handler';
export { sendMessageStream } from './streaming-handler';
export { listModels, fetchAvailableModels, getModelQuotas, getSubscriptionTier, isValidModel } from './model-api';

// Default export for backwards compatibility
import { sendMessage } from './message-handler';
import { sendMessageStream } from './streaming-handler';
import { listModels, fetchAvailableModels, getModelQuotas, getSubscriptionTier, isValidModel } from './model-api';

export default {
    sendMessage,
    sendMessageStream,
    listModels,
    fetchAvailableModels,
    getModelQuotas,
    getSubscriptionTier,
    isValidModel
};
