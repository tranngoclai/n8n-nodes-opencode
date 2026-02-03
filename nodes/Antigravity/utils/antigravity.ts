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
 * Transform OpenAI-compatible request to Antigravity v1internal format
 */
export function transformToAntigravityRequest(
    body: IDataObject,
    projectId: string,
): IDataObject {
    const model = body.model as string;
    const messages = body.messages as Array<{ role: string; content: string }>;

    // Convert messages to Antigravity contents format
    const contents = messages.map((msg) => ({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.content }],
    }));

    // Build generation config
    const generationConfig: IDataObject = {};

    if (body.temperature !== undefined) {
        generationConfig.temperature = body.temperature;
    }
    if (body.max_tokens !== undefined) {
        generationConfig.maxOutputTokens = body.max_tokens;
    }
    if (body.topP !== undefined) {
        generationConfig.topP = body.topP;
    }

    // Build inner request payload
    const requestPayload: IDataObject = {
        contents,
    };

    if (Object.keys(generationConfig).length > 0) {
        requestPayload.generationConfig = generationConfig;
    }

    // Wrap in Antigravity v1internal format
    return {
        model,
        project: projectId,
        request: requestPayload,
    };
}

/**
 * Transform Antigravity v1internal response to OpenAI-compatible format
 */
export function transformAntigravityResponse(response: IDataObject): IDataObject {
    // If response already has 'choices' field, it's compatible
    if (response.choices) {
        return response;
    }

    // Handle Antigravity v1internal response format
    const candidates = response.candidates as Array<IDataObject> | undefined;
    if (candidates && candidates.length > 0) {
        return {
            id: response.id || 'antigravity-response',
            object: 'chat.completion',
            created: Math.floor(Date.now() / 1000),
            model: response.model || '',
            choices: candidates.map((candidate, index) => {
                // Extract text from parts array
                const content = candidate.content as IDataObject | undefined;
                const parts = content?.parts as Array<IDataObject> | undefined;
                const text = parts?.[0]?.text as string || '';

                return {
                    index,
                    message: {
                        role: 'assistant',
                        content: text,
                    },
                    finish_reason: candidate.finishReason || 'stop',
                };
            }),
            usage: response.usageMetadata || response.usage || {
                prompt_tokens: 0,
                completion_tokens: 0,
                total_tokens: 0,
            },
        };
    }

    // Fallback: return as-is
    return response;
}
