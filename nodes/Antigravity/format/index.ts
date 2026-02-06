/* eslint-disable */
// @ts-nocheck
/**
 * Format Converter Module
 * Converts between Anthropic Messages API format and Google Generative AI format
 */

// Re-export all from each module
export * from './request-converter';
export * from './response-converter';
export * from './content-converter';
export * from './schema-sanitizer';
export * from './thinking-utils';

// Default export for backward compatibility
import { convertAnthropicToGoogle } from './request-converter';
import { convertGoogleToAnthropic } from './response-converter';

export default {
    convertAnthropicToGoogle,
    convertGoogleToAnthropic
};
