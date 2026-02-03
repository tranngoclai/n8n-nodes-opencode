/**
 * Utility functions for Antigravity API integration
 */

import {
    ANTIGRAVITY_HEADERS,
    ANTIGRAVITY_ENDPOINT_FALLBACKS,
    ANTIGRAVITY_MODEL_PREFIXES,
    ANTIGRAVITY_DEFAULT_PROJECT_ID,
} from './constants';

import type { IDataObject } from 'n8n-workflow';

/**
 * Check if a model requires Antigravity authentication
 */
export function isAntigravityModel(model: string): boolean {
    return ANTIGRAVITY_MODEL_PREFIXES.some((prefix) => model.startsWith(prefix));
}

/**
 * Get Antigravity API headers
 */
export function getAntigravityHeaders(accessToken: string): Record<string, string> {
    return {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        ...ANTIGRAVITY_HEADERS,
    };
}

/**
 * Get primary Antigravity endpoint
 * Returns daily sandbox endpoint by default
 */
export function getAntigravityEndpoint(): string {
    return ANTIGRAVITY_ENDPOINT_FALLBACKS[0] || '';
}

/**
 * Parse refresh token to extract project ID
 * Format: "refresh_token|project_id"
 */
export function parseRefreshToken(refreshToken: string): {
    token: string;
    projectId: string;
} {
    const parts = refreshToken.split('|');
    return {
        token: parts[0] || '',
        projectId: parts[1] || ANTIGRAVITY_DEFAULT_PROJECT_ID,
    };
}

/**
 * Transform OpenAI-compatible request to Antigravity format
 */
export function transformToAntigravityRequest(
    body: IDataObject,
    projectId: string,
): IDataObject {
    const model = body.model as string;
    const messages = body.messages as Array<{ role: string; content: string }>;

    // Build Antigravity-compatible request
    const antigravityRequest: IDataObject = {
        model,
        messages,
    };

    // Add optional parameters
    if (body.temperature !== undefined) {
        antigravityRequest.temperature = body.temperature;
    }
    if (body.max_tokens !== undefined) {
        antigravityRequest.maxOutputTokens = body.max_tokens;
    }
    if (body.topP !== undefined) {
        antigravityRequest.topP = body.topP;
    }

    // Add project context
    antigravityRequest.project = projectId;

    return antigravityRequest;
}

/**
 * Transform Antigravity response to OpenAI-compatible format
 */
export function transformAntigravityResponse(response: IDataObject): IDataObject {
    // Antigravity uses similar format to OpenAI
    // This function can be expanded based on actual response differences

    // If response already has 'choices' field, it's compatible
    if (response.choices) {
        return response;
    }

    // Handle Antigravity-specific response format if needed
    const candidates = response.candidates as Array<IDataObject> | undefined;
    if (candidates && candidates.length > 0) {
        return {
            id: response.id || 'antigravity-response',
            object: 'chat.completion',
            created: Math.floor(Date.now() / 1000),
            model: response.model || '',
            choices: candidates.map((candidate, index) => ({
                index,
                message: {
                    role: 'assistant',
                    content: candidate.content || '',
                },
                finish_reason: candidate.finishReason || 'stop',
            })),
            usage: response.usage || {
                prompt_tokens: 0,
                completion_tokens: 0,
                total_tokens: 0,
            },
        };
    }

    // Fallback: return as-is
    return response;
}
