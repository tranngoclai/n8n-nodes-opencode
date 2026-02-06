/**
 * SSE Parser for Cloud Code
 *
 * Parses SSE responses for non-streaming thinking models.
 * Accumulates all parts and returns a single response.
 */
import { convertGoogleToAnthropic } from '../format';
import { logger } from '../utils/logger';
import type { AnthropicResponse, UnknownRecord } from './types';

/**
 * Parse SSE response for thinking models and accumulate all parts
 *
 * @param {Response} response - The HTTP response with SSE body
 * @param {string} originalModel - The original model name
 * @returns {Promise<Object>} Anthropic-format response object
 */
export async function parseThinkingSSEResponse(response: Response, originalModel: string): Promise<AnthropicResponse> {
    let accumulatedThinkingText = '';
    let accumulatedThinkingSignature = '';
    let accumulatedText = '';
    const finalParts: UnknownRecord[] = [];
    let usageMetadata: UnknownRecord = {};
    let finishReason = 'STOP';

    const flushThinking = () => {
        if (accumulatedThinkingText) {
            finalParts.push({
                thought: true,
                text: accumulatedThinkingText,
                thoughtSignature: accumulatedThinkingSignature
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

    const body = response.body;
    if (!body) {
        throw new Error('Response body is empty');
    }

    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
            if (!line.startsWith('data:')) continue;
            const jsonText = line.slice(5).trim();
            if (!jsonText) continue;

            try {
                const data = JSON.parse(jsonText) as UnknownRecord & { response?: UnknownRecord };
                const innerResponse = data.response || data;

                if (innerResponse.usageMetadata && typeof innerResponse.usageMetadata === 'object') {
                    usageMetadata = innerResponse.usageMetadata as UnknownRecord;
                }

                const candidates = Array.isArray(innerResponse.candidates) ? innerResponse.candidates : [];
                const firstCandidate = (candidates[0] as UnknownRecord | undefined) || {};
                if (typeof firstCandidate.finishReason === 'string') {
                    finishReason = firstCandidate.finishReason;
                }

                const content = (firstCandidate.content as UnknownRecord | undefined) || {};
                const parts = Array.isArray(content.parts) ? content.parts : [];
                for (const part of parts) {
                    if (!part || typeof part !== 'object') continue;
                    const normalizedPart = part as UnknownRecord;
                    if (normalizedPart.thought === true) {
                        flushText();
                        accumulatedThinkingText += (String(normalizedPart.text || ''));
                        if (typeof normalizedPart.thoughtSignature === 'string') {
                            accumulatedThinkingSignature = normalizedPart.thoughtSignature;
                        }
                    } else if (normalizedPart.functionCall) {
                        flushThinking();
                        flushText();
                        finalParts.push(normalizedPart);
                    } else if (normalizedPart.text !== undefined) {
                        if (!normalizedPart.text) continue;
                        flushThinking();
                        accumulatedText += String(normalizedPart.text);
                    } else if (normalizedPart.inlineData) {
                        // Handle image content
                        flushThinking();
                        flushText();
                        finalParts.push(normalizedPart);
                    }
                }
            } catch (e) {
                const parseError = e instanceof Error ? e : new Error(String(e));
                logger.debug('[CloudCode] SSE parse warning:', parseError.message, 'Raw:', jsonText.slice(0, 100));
            }
        }
    }

    flushThinking();
    flushText();

    const accumulatedResponse = {
        candidates: [{ content: { parts: finalParts }, finishReason }],
        usageMetadata
    };

    const partTypes = finalParts.map((p) => p.thought ? 'thought' : (p.functionCall ? 'functionCall' : (p.inlineData ? 'inlineData' : 'text')));
    logger.debug('[CloudCode] Response received (SSE), part types:', partTypes);
    if (finalParts.some((p) => p.thought)) {
        const thinkingPart = finalParts.find((p) => p.thought);
        const signatureLength = typeof thinkingPart?.thoughtSignature === 'string'
          ? thinkingPart.thoughtSignature.length
          : 0;
        logger.debug('[CloudCode] Thinking signature length:', signatureLength);
    }

    return convertGoogleToAnthropic(accumulatedResponse, originalModel);
}
