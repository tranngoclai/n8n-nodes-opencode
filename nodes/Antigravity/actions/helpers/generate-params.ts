import { GEMINI_MAX_OUTPUT_TOKENS } from '../../transport/antigravity.api';
import {
  getBooleanProp,
  getNestedBooleanProp,
  getNestedNumberProp,
  getNestedStringProp,
  getStringProp,
  type UnknownRecord,
} from './object';

export type MessageInput = { role?: string; content?: string };

export type NormalizedMessage = { role: string; content: string };

export type GenerationOptions = {
  maxTokens: number;
  temperature: number;
  topP: number;
  topK: number;
  stopSequences: string[];
  systemMessage: string;
};

export type AnthropicMessageRequest = {
  model: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  max_tokens: number;
  temperature: number;
  top_p: number;
  top_k: number;
  stop_sequences?: string[];
  system?: string;
};

export type ResolveGenerateRequestInputsResult = {
  messages: NormalizedMessage[];
  enableWebSearch: boolean;
  anthropicRequest: AnthropicMessageRequest;
};

function parseStopSequences(stopSequencesRaw: string): string[] {
  return stopSequencesRaw
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
}

export function isGeminiModel(model: string): boolean {
  return (model || '').toLowerCase().includes('gemini');
}

export function resolveGenerationOptions(options: UnknownRecord, legacyParams: UnknownRecord): GenerationOptions {
  const maxTokens = getNestedNumberProp(options, 'maxTokens') ?? GEMINI_MAX_OUTPUT_TOKENS;
  const temperature = getNestedNumberProp(options, 'temperature') ?? 0.7;
  const topP = getNestedNumberProp(options, 'topP') ?? 1;
  const topK = getNestedNumberProp(options, 'topK') ?? 1;
  const stopSequencesRaw = getNestedStringProp(options, 'stopSequences') ?? '';
  const systemMessage =
    getNestedStringProp(options, 'systemMessage') ?? getStringProp(legacyParams, 'systemPrompt') ?? '';

  return {
    maxTokens,
    temperature,
    topP,
    topK,
    stopSequences: parseStopSequences(stopSequencesRaw),
    systemMessage,
  };
}

export function resolveWebSearchEnabled(builtInTools: UnknownRecord, legacyParams: UnknownRecord): boolean {
  return getNestedBooleanProp(builtInTools, 'googleSearch') ?? getBooleanProp(legacyParams, 'enableWebSearch') ?? false;
}

export function resolveMessages(
  messagesParam: { message?: MessageInput[] },
  legacyPrompt: string,
): NormalizedMessage[] {
  const messageItems = Array.isArray(messagesParam.message) ? messagesParam.message : [];
  const normalizedMessages = messageItems
    .map((message) => ({
      role: message?.role || 'user',
      content: typeof message?.content === 'string' ? message.content : '',
    }))
    .filter((message) => message.content.trim().length > 0);

  if (normalizedMessages.length > 0) {
    return normalizedMessages;
  }

  if (legacyPrompt) {
    return [{ role: 'user', content: legacyPrompt }];
  }

  return [];
}

export function buildAnthropicRequest(
  model: string,
  messages: NormalizedMessage[],
  options: GenerationOptions,
): AnthropicMessageRequest {
  const request: AnthropicMessageRequest = {
    model,
    messages: messages.map((message) => ({
      role: message.role === 'assistant' ? 'assistant' : 'user',
      content: message.content,
    })),
    max_tokens: Math.min(options.maxTokens, GEMINI_MAX_OUTPUT_TOKENS),
    temperature: options.temperature,
    top_p: options.topP,
    top_k: options.topK,
  };

  if (options.stopSequences.length > 0) {
    request.stop_sequences = options.stopSequences;
  }

  if (options.systemMessage) {
    request.system = options.systemMessage;
  }

  return request;
}

export function resolveGenerateRequestInputs(input: {
  model: string;
  messagesParam: { message?: MessageInput[] };
  options: UnknownRecord;
  builtInTools: UnknownRecord;
  legacyParams: UnknownRecord;
}): ResolveGenerateRequestInputsResult {
  const legacyPrompt = getStringProp(input.legacyParams, 'prompt') ?? '';
  const messages = resolveMessages(input.messagesParam, legacyPrompt);
  const enableWebSearch = resolveWebSearchEnabled(input.builtInTools, input.legacyParams);
  const generationOptions = resolveGenerationOptions(input.options, input.legacyParams);
  const anthropicRequest = buildAnthropicRequest(input.model, messages, generationOptions);

  return {
    messages,
    enableWebSearch,
    anthropicRequest,
  };
}
