/**
 * SSE Streamer for Cloud Code
 *
 * Streams SSE events in real-time, converting Google format to Anthropic format.
 * Handles thinking blocks, text blocks, and tool use blocks.
 */
import crypto from 'crypto';
import { MIN_SIGNATURE_LENGTH, getModelFamily } from '../constants';
import { EmptyResponseError } from '../errors';
import { cacheSignature, cacheThinkingSignature } from '../format/signature-cache';
import { logger } from '../utils/logger';
import type { SseEvent, UnknownRecord } from './types';

/**
 * Stream SSE response and yield Anthropic-format events
 *
 * @param {Response} response - The HTTP response with SSE body
 * @param {string} originalModel - The original model name
 * @yields {Object} Anthropic-format SSE events
 */
export async function* streamSSEResponse(response: Response, originalModel: string): AsyncGenerator<SseEvent> {
    const messageId = `msg_${crypto.randomBytes(16).toString('hex')}`;
    let hasEmittedStart = false;
    let blockIndex = 0;
    let currentBlockType: 'thinking' | 'text' | 'tool_use' | 'image' | null = null;
    let currentThinkingSignature = '';
    let inputTokens = 0;
    let outputTokens = 0;
    let cacheReadTokens = 0;
    let stopReason: 'tool_use' | 'max_tokens' | 'end_turn' | null = null;

    const body = response.body;
    if (!body) {
        throw new EmptyResponseError('No response body');
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
                const innerResponse = (data.response || data) as UnknownRecord;

                // Extract usage metadata (including cache tokens)
                const usage = (innerResponse.usageMetadata || {}) as UnknownRecord;
                if (usage) {
                    inputTokens = Number(usage.promptTokenCount) || inputTokens;
                    outputTokens = Number(usage.candidatesTokenCount) || outputTokens;
                    cacheReadTokens = Number(usage.cachedContentTokenCount) || cacheReadTokens;
                }

                const candidates = Array.isArray(innerResponse.candidates) ? innerResponse.candidates : [];
                const firstCandidate = (candidates[0] as UnknownRecord | undefined) || {};
                const content = (firstCandidate.content as UnknownRecord | undefined) || {};
                const parts = Array.isArray(content.parts) ? content.parts : [];

                // Emit message_start on first data
                // Note: input_tokens = promptTokenCount - cachedContentTokenCount (Antigravity includes cached in total)
                if (!hasEmittedStart && parts.length > 0) {
                    hasEmittedStart = true;
                    yield {
                        type: 'message_start',
                        message: {
                            id: messageId,
                            type: 'message',
                            role: 'assistant',
                            content: [],
                            model: originalModel,
                            stop_reason: null,
                            stop_sequence: null,
                            usage: {
                                input_tokens: inputTokens - cacheReadTokens,
                                output_tokens: 0,
                                cache_read_input_tokens: cacheReadTokens,
                                cache_creation_input_tokens: 0
                            }
                        }
                    };
                }

                // Process each part
                for (const part of parts) {
                    if (!part || typeof part !== 'object') {
                        continue;
                    }
                    const normalizedPart = part as UnknownRecord;

                    if (normalizedPart.thought === true) {
                        // Handle thinking block
                        const text = String(normalizedPart.text || '');
                        const signature = String(normalizedPart.thoughtSignature || '');

                        if (currentBlockType !== 'thinking') {
                            if (currentBlockType !== null) {
                                yield { type: 'content_block_stop', index: blockIndex };
                                blockIndex++;
                            }
                            currentBlockType = 'thinking';
                            currentThinkingSignature = '';
                            yield {
                                type: 'content_block_start',
                                index: blockIndex,
                                content_block: { type: 'thinking', thinking: '' }
                            };
                        }

                        if (signature && signature.length >= MIN_SIGNATURE_LENGTH) {
                            currentThinkingSignature = signature;
                            // Cache thinking signature with model family for cross-model compatibility
                            const modelFamily = getModelFamily(originalModel);
                            cacheThinkingSignature(signature, modelFamily);
                        }

                        yield {
                            type: 'content_block_delta',
                            index: blockIndex,
                            delta: { type: 'thinking_delta', thinking: text }
                        };

                    } else if (normalizedPart.text !== undefined) {
                        // Skip empty text parts (but preserve whitespace-only chunks for proper spacing)
                        if (normalizedPart.text === '') {
                            continue;
                        }

                        // Handle regular text
                        if (currentBlockType !== 'text') {
                            if (currentBlockType === 'thinking' && currentThinkingSignature) {
                                yield {
                                    type: 'content_block_delta',
                                    index: blockIndex,
                                    delta: { type: 'signature_delta', signature: currentThinkingSignature }
                                };
                                currentThinkingSignature = '';
                            }
                            if (currentBlockType !== null) {
                                yield { type: 'content_block_stop', index: blockIndex };
                                blockIndex++;
                            }
                            currentBlockType = 'text';
                            yield {
                                type: 'content_block_start',
                                index: blockIndex,
                                content_block: { type: 'text', text: '' }
                            };
                        }

                        yield {
                            type: 'content_block_delta',
                            index: blockIndex,
                            delta: { type: 'text_delta', text: String(normalizedPart.text) }
                        };

                    } else if (normalizedPart.functionCall) {
                        // Handle tool use
                        // For Gemini 3+, capture thoughtSignature from the functionCall part
                        // The signature is a sibling to functionCall, not inside it
                        const functionCallSignature = String(normalizedPart.thoughtSignature || '');
                        const functionCall = normalizedPart.functionCall as UnknownRecord;

                        if (currentBlockType === 'thinking' && currentThinkingSignature) {
                            yield {
                                type: 'content_block_delta',
                                index: blockIndex,
                                delta: { type: 'signature_delta', signature: currentThinkingSignature }
                            };
                            currentThinkingSignature = '';
                        }
                        if (currentBlockType !== null) {
                            yield { type: 'content_block_stop', index: blockIndex };
                            blockIndex++;
                        }
                        currentBlockType = 'tool_use';
                        stopReason = 'tool_use';

                        const toolId = String(functionCall.id || `toolu_${crypto.randomBytes(12).toString('hex')}`);

                        // For Gemini, include the thoughtSignature in the tool_use block
                        // so it can be sent back in subsequent requests
                        const toolUseBlock: UnknownRecord & {
                          type: string;
                          id: string;
                          name: string;
                          input: UnknownRecord;
                          thoughtSignature?: string;
                        } = {
                            type: 'tool_use',
                            id: toolId,
                            name: String(functionCall.name),
                            input: {}
                        };

                        // Store the signature in the tool_use block for later retrieval
                        if (functionCallSignature && functionCallSignature.length >= MIN_SIGNATURE_LENGTH) {
                            toolUseBlock.thoughtSignature = functionCallSignature;
                            // Cache for future requests (Claude Code may strip this field)
                            cacheSignature(toolId, functionCallSignature);
                        }

                        yield {
                            type: 'content_block_start',
                            index: blockIndex,
                            content_block: toolUseBlock
                        };

                        yield {
                            type: 'content_block_delta',
                            index: blockIndex,
                            delta: {
                                type: 'input_json_delta',
                                partial_json: JSON.stringify(functionCall.args || {})
                            }
                        };
                    } else if (normalizedPart.inlineData) {
                        // Handle image content from Google format
                        const inlineData = normalizedPart.inlineData as UnknownRecord;
                        if (currentBlockType === 'thinking' && currentThinkingSignature) {
                            yield {
                                type: 'content_block_delta',
                                index: blockIndex,
                                delta: { type: 'signature_delta', signature: currentThinkingSignature }
                            };
                            currentThinkingSignature = '';
                        }
                        if (currentBlockType !== null) {
                            yield { type: 'content_block_stop', index: blockIndex };
                            blockIndex++;
                        }
                        currentBlockType = 'image';

                        // Emit image block as a complete block
                        yield {
                            type: 'content_block_start',
                            index: blockIndex,
                            content_block: {
                                type: 'image',
                                source: {
                                    type: 'base64',
                                    media_type: String(inlineData.mimeType),
                                    data: String(inlineData.data)
                                }
                            }
                        };

                        yield { type: 'content_block_stop', index: blockIndex };
                        blockIndex++;
                        currentBlockType = null;
                    }
                }

                // Check finish reason (only if not already set by tool_use)
                if (typeof firstCandidate.finishReason === 'string' && !stopReason) {
                    if (firstCandidate.finishReason === 'MAX_TOKENS') {
                        stopReason = 'max_tokens';
                    } else if (firstCandidate.finishReason === 'STOP') {
                        stopReason = 'end_turn';
                    }
                }

            } catch (parseError) {
                const normalizedError = parseError instanceof Error ? parseError : new Error(String(parseError));
                logger.warn('[CloudCode] SSE parse error:', normalizedError.message);
            }
        }
    }

    // Handle no content received - throw error to trigger retry in streaming-handler
    if (!hasEmittedStart) {
        logger.warn('[CloudCode] No content parts received, throwing for retry');
        throw new EmptyResponseError('No content parts received from API');
    } else {
        // Close any open block
        if (currentBlockType !== null) {
            if (currentBlockType === 'thinking' && currentThinkingSignature) {
                yield {
                    type: 'content_block_delta',
                    index: blockIndex,
                    delta: { type: 'signature_delta', signature: currentThinkingSignature }
                };
            }
            yield { type: 'content_block_stop', index: blockIndex };
        }
    }

    // Emit message_delta and message_stop
    yield {
        type: 'message_delta',
        delta: { stop_reason: stopReason || 'end_turn', stop_sequence: null },
        usage: {
            output_tokens: outputTokens,
            cache_read_input_tokens: cacheReadTokens,
            cache_creation_input_tokens: 0
        }
    };

    yield { type: 'message_stop' };
}
