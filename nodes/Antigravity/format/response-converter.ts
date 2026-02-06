/* eslint-disable */
// @ts-nocheck
/**
 * Response Converter
 * Converts Google Generative AI responses to Anthropic Messages API format
 */

import crypto from 'crypto';
import { MIN_SIGNATURE_LENGTH, getModelFamily } from '../constants';
import { cacheSignature, cacheThinkingSignature } from './signature-cache';

/**
 * Convert Google Generative AI response to Anthropic Messages API format
 *
 * @param {Object} googleResponse - Google format response (the inner response object)
 * @param {string} model - The model name used
 * @returns {Object} Anthropic format response
 */
export function convertGoogleToAnthropic(googleResponse, model) {
    // Handle the response wrapper
    const response = googleResponse.response || googleResponse;

    // const candidates = response.candidates || [];
    // const firstCandidate = candidates[0] || {};
    // const content = firstCandidate.content || {};
    // const parts = content.parts || [];

    // // Convert parts to Anthropic content blocks
    // const anthropicContent = [];

    // for (const part of parts) {
    //     if (part.text !== undefined) {
    //         // Handle thinking blocks
    //         if (part.thought === true) {
    //             const signature = part.thoughtSignature || '';

    //             // Cache thinking signature with model family for cross-model compatibility
    //             if (signature && signature.length >= MIN_SIGNATURE_LENGTH) {
    //                 const modelFamily = getModelFamily(model);
    //                 cacheThinkingSignature(signature, modelFamily);
    //             }

    //             // Include thinking blocks in the response for Claude Code
    //             anthropicContent.push({
    //                 type: 'thinking',
    //                 thinking: part.text,
    //                 signature: signature
    //             });
    //         } else {
    //             anthropicContent.push({
    //                 type: 'text',
    //                 text: part.text
    //             });
    //         }
    //     } else if (part.functionCall) {
    //         // Convert functionCall to tool_use
    //         // Use the id from the response if available, otherwise generate one
    //         const toolId = part.functionCall.id || `toolu_${crypto.randomBytes(12).toString('hex')}`;
    //         const toolUseBlock = {
    //             type: 'tool_use',
    //             id: toolId,
    //             name: part.functionCall.name,
    //             input: part.functionCall.args || {}
    //         };

    //         // For Gemini 3+, include thoughtSignature from the part level
    //         if (part.thoughtSignature && part.thoughtSignature.length >= MIN_SIGNATURE_LENGTH) {
    //             toolUseBlock.thoughtSignature = part.thoughtSignature;
    //             // Cache for future requests (Claude Code may strip this field)
    //             cacheSignature(toolId, part.thoughtSignature);
    //         }

    //         anthropicContent.push(toolUseBlock);
    //     } else if (part.inlineData) {
    //         // Handle image content from Google format
    //         anthropicContent.push({
    //             type: 'image',
    //             source: {
    //                 type: 'base64',
    //                 media_type: part.inlineData.mimeType,
    //                 data: part.inlineData.data
    //             }
    //         });
    //     }
    // }

    // const mappedContent = anthropicContent.length > 0 ? anthropicContent : [{ type: 'text', text: '' }];

    // Return raw Google response while removing `parts` from candidates.
    // Keep extracted Anthropic-style content as `content` for downstream consumers.
    // return {
    //     ...response,
    //     content: mappedContent,
    //     candidates: candidates.map((candidate, index) => {
    //         const candidateContent = candidate?.content;
    //         if (!candidateContent || typeof candidateContent !== 'object') {
    //             return candidate;
    //         }

    //         const { parts: _parts, ...restContent } = candidateContent;
    //         return {
    //             ...candidate,
    //             content: index === 0
    //                 ? { ...restContent, anthropicContent: mappedContent }
    //                 : restContent
    //         };
    //     })
    // };
    return response;
}
