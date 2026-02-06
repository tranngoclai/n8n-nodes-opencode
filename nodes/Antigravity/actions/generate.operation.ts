import {
  NodeApiError,
  NodeOperationError,
  type IExecuteFunctions,
  type IDataObject,
  type INodeExecutionData,
  type INodeProperties,
} from 'n8n-workflow';
import { SHOW_GENERATE } from './constants';
import {
  callGenerateContent,
  GEMINI_MAX_OUTPUT_TOKENS,
  getProjectId,
} from '../transport/antigravity.api';
import type { AnthropicRequest } from '../cloudcode/types';

export const description: INodeProperties[] = [
  {
    displayName: 'Model Name or ID',
    name: 'model',
    type: 'options',
    description:
      'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
    default: 'gemini-3-flash',
    required: true,
    displayOptions: SHOW_GENERATE,
    typeOptions: {
      loadOptionsMethod: 'getModels',
    },
  },
  {
    displayName: 'Messages',
    name: 'messages',
    type: 'fixedCollection',
    typeOptions: {
      multipleValues: true,
    },
    default: {},
    displayOptions: SHOW_GENERATE,
    options: [
      {
        name: 'message',
        displayName: 'Message',
        values: [
          {
            displayName: 'Prompt',
            name: 'content',
            type: 'string',
            default: '',
            required: true,
            typeOptions: {
              rows: 4,
            },
          },
          {
            displayName: 'Role',
            name: 'role',
            type: 'options',
            options: [
              { name: 'User', value: 'user' },
              { name: 'Assistant', value: 'assistant' },
            ],
            default: 'user',
          },
        ],
      },
    ],
  },
  {
    displayName: 'Output Content as JSON',
    name: 'outputContentAsJson',
    type: 'boolean',
    default: false,
    displayOptions: SHOW_GENERATE,
  },
  {
    displayName: 'Simplify Output',
    name: 'simplifyOutput',
    type: 'boolean',
    default: false,
    displayOptions: SHOW_GENERATE,
  },
  {
    displayName: 'Built-in Tools',
    name: 'builtInTools',
    type: 'collection',
    placeholder: 'Add Built-in Tool',
    default: {},
    displayOptions: SHOW_GENERATE,
    options: [
      {
        name: 'googleSearch',
        displayName: 'Google Search',
        values: [
          {
            displayName: 'Google Search',
            name: 'googleSearch',
            type: 'boolean',
            default: true,
          },
        ],
      },
    ],
  },
  {
    displayName: 'Options',
    name: 'options',
    type: 'collection',
    placeholder: 'Add Option',
    default: {},
    displayOptions: SHOW_GENERATE,
    options: [
      {
        name: 'maxTokens',
        displayName: 'Max Tokens',
        values: [
          {
            displayName: 'Max Tokens',
            name: 'maxTokens',
            type: 'number',
            default: GEMINI_MAX_OUTPUT_TOKENS,
          },
        ],
      },
      {
        name: 'stopSequences',
        displayName: 'Stop Sequences (Comma-Separated)',
        values: [
          {
            displayName: 'Stop Sequences (Comma-Separated)',
            name: 'stopSequences',
            type: 'string',
            default: '',
          },
        ],
      },
      {
        name: 'systemMessage',
        displayName: 'System Message',
        values: [
          {
            displayName: 'System Message',
            name: 'systemMessage',
            type: 'string',
            default: '',
            typeOptions: {
              rows: 4,
            },
          },
        ],
      },
      {
        name: 'temperature',
        displayName: 'Temperature',
        values: [
          {
            displayName: 'Temperature',
            name: 'temperature',
            type: 'number',
            default: 0.7,
          },
        ],
      },
      {
        name: 'topK',
        displayName: 'Top K',
        values: [
          {
            displayName: 'Top K',
            name: 'topK',
            type: 'number',
            default: 0,
          },
        ],
      },
      {
        name: 'topP',
        displayName: 'Top P',
        values: [
          {
            displayName: 'Top P',
            name: 'topP',
            type: 'number',
            default: 1,
          },
        ],
      },
    ],
  },
];

type UnknownRecord = Record<string, unknown>;

type MessageInput = { role?: string; content?: string };

type NormalizedMessage = { role: string; content: string };

type GenerationOptions = {
  maxTokens: number;
  temperature: number;
  topP: number;
  topK: number;
  stopSequences: string[];
  systemMessage: string;
};

type AnthropicMessageRequest = {
  model: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  max_tokens: number;
  temperature: number;
  top_p: number;
  top_k: number;
  stop_sequences?: string[];
  system?: string;
};

const JSON_CONVERSION_SYSTEM_NOTICE =
  'Convert the provided raw text into valid JSON. Return JSON only without markdown fences or additional commentary.';
const JSON_CONVERSION_MODEL = 'gemini-2.5-flash';

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null;
}

function asRecord(value: unknown): UnknownRecord {
  return isRecord(value) ? value : {};
}

function getStringProp(record: UnknownRecord, key: string): string | undefined {
  const value = record[key];
  return typeof value === 'string' ? value : undefined;
}

function getNumberProp(record: UnknownRecord, key: string): number | undefined {
  const value = record[key];
  return typeof value === 'number' ? value : undefined;
}

function getBooleanProp(record: UnknownRecord, key: string): boolean | undefined {
  const value = record[key];
  return typeof value === 'boolean' ? value : undefined;
}

function getNestedRecord(record: UnknownRecord, key: string): UnknownRecord {
  return isRecord(record[key]) ? (record[key] as UnknownRecord) : {};
}

function getNestedStringProp(record: UnknownRecord, key: string): string | undefined {
  return getStringProp(record, key) ?? getStringProp(getNestedRecord(record, key), key);
}

function getNestedNumberProp(record: UnknownRecord, key: string): number | undefined {
  return getNumberProp(record, key) ?? getNumberProp(getNestedRecord(record, key), key);
}

function getNestedBooleanProp(record: UnknownRecord, key: string): boolean | undefined {
  return getBooleanProp(record, key) ?? getBooleanProp(getNestedRecord(record, key), key);
}

function getArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function isGeminiModel(model: string): boolean {
  return (model || '').toLowerCase().includes('gemini');
}

function parseStopSequences(stopSequencesRaw: string): string[] {
  return stopSequencesRaw
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
}

function resolveGenerationOptions(options: UnknownRecord, legacyParams: UnknownRecord): GenerationOptions {
  const maxTokens = getNestedNumberProp(options, 'maxTokens') ?? GEMINI_MAX_OUTPUT_TOKENS;
  const temperature = getNestedNumberProp(options, 'temperature') ?? 0.7;
  const topP = getNestedNumberProp(options, 'topP') ?? 1;
  const topK = getNestedNumberProp(options, 'topK') ?? 1;
  const stopSequencesRaw = getNestedStringProp(options, 'stopSequences') ?? '';
  const systemMessage = getNestedStringProp(options, 'systemMessage') ?? getStringProp(legacyParams, 'systemPrompt') ?? '';

  return {
    maxTokens,
    temperature,
    topP,
    topK,
    stopSequences: parseStopSequences(stopSequencesRaw),
    systemMessage,
  };
}

function resolveWebSearchEnabled(builtInTools: UnknownRecord, legacyParams: UnknownRecord): boolean {
  return getNestedBooleanProp(builtInTools, 'googleSearch') ?? getBooleanProp(legacyParams, 'enableWebSearch') ?? false;
}

function resolveMessages(messagesParam: { message?: MessageInput[] }, legacyPrompt: string): NormalizedMessage[] {
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

function buildAnthropicRequest(
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

function buildJsonConversionSystemPrompt(systemMessage?: string): string {
  const trimmedSystemMessage = systemMessage?.trim();
  if (!trimmedSystemMessage) {
    return JSON_CONVERSION_SYSTEM_NOTICE;
  }

  return `${JSON_CONVERSION_SYSTEM_NOTICE}\n\n${trimmedSystemMessage}`;
}

function extractRawTextForJsonConversion(response: unknown): string {
  const text = extractFirstResponseText(response);
  if (typeof text === 'string' && text.trim().length > 0) {
    return text;
  }

  if (typeof response === 'string') {
    return response;
  }

  if (response === null || response === undefined) {
    return '';
  }

  try {
    return JSON.stringify(response);
  } catch {
    return String(response);
  }
}

function buildJsonConversionRequest(
  sourceRequest: AnthropicMessageRequest,
  rawText: string,
): AnthropicRequest {
  return {
    model: JSON_CONVERSION_MODEL,
    messages: [{ role: 'user', content: rawText }],
    system: buildJsonConversionSystemPrompt(sourceRequest.system),
  };
}

type OutputValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | object
  | IDataObject
  | Array<string | number | boolean | null | undefined | object>
  | IDataObject[];

function extractFirstResponseText(response: unknown): string | undefined {
  if (!isRecord(response)) return undefined;

  const content = getArray(response.content);
  if (!content.length) return undefined;

  const textParts = content
    .map((block) => {
      if (!isRecord(block)) return undefined;
      const type = getStringProp(block as UnknownRecord, 'type');
      if (type !== 'text') return undefined;
      return getStringProp(block as UnknownRecord, 'text');
    })
    .filter((value): value is string => typeof value === 'string');

  if (!textParts.length) return undefined;
  return textParts.join('');
}

function buildOutput(
  response: unknown,
  simplifyOutput: boolean,
  outputContentAsJson: boolean,
): IDataObject {
  let parsedContent: OutputValue | undefined;
  let jsonParseStatus: 'success' | 'failed' | undefined;

  if (outputContentAsJson) {
    const text = extractFirstResponseText(response) ?? '';
    try {
      parsedContent = JSON.parse(text) as OutputValue;
      jsonParseStatus = 'success';
    } catch {
      jsonParseStatus = 'failed';
    }
  }

  if (simplifyOutput) {
    if (outputContentAsJson) {
      return { response: parsedContent, jsonParseStatus };
    }

    const text = extractFirstResponseText(response) ?? '';
    return { response: text };
  }

  if (isRecord(response)) {
    if (outputContentAsJson) {
      return { ...(response as IDataObject), content: parsedContent, jsonParseStatus };
    }
    return response as IDataObject;
  }

  let responseValue: OutputValue;
  if (response === null || response === undefined) {
    responseValue = response;
  } else if (Array.isArray(response)) {
    responseValue = response as Array<string | number | boolean | null | undefined | object>;
  } else {
    const primitive = typeof response;
    if (primitive === 'string' || primitive === 'number' || primitive === 'boolean') {
      responseValue = response;
    } else if (primitive === 'object') {
      responseValue = response as object;
    } else {
      responseValue = String(response);
    }
  }

  if (outputContentAsJson) {
    return { response: responseValue, jsonParseStatus };
  }

  return { response: responseValue };
}

export async function execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
  const items = this.getInputData();
  const returnData: INodeExecutionData[] = [];

  for (let i = 0; i < items.length; i++) {
    const getParam = <T,>(name: string, fallback: T) => this.getNodeParameter(name, i, fallback) as T;

    try {
      const model = getParam<string>('model', 'gemini-3-flash');
      const messagesParam = getParam<{ message?: MessageInput[] }>('messages', {});
      const builtInTools = getParam<UnknownRecord>('builtInTools', {});
      const options = getParam<UnknownRecord>('options', {});
      const outputContentAsJson = getParam<boolean>('outputContentAsJson', false);
      const simplifyOutput = getParam<boolean>('simplifyOutput', false);
      const legacyParams = asRecord(this.getNode().parameters);

      if (!isGeminiModel(model)) {
        throw new NodeOperationError(
          this.getNode(),
          `Only Gemini models are supported. Received: ${model || 'unknown'}`,
        );
      }

      const legacyPrompt = getStringProp(legacyParams, 'prompt') ?? '';
      const messages = resolveMessages(messagesParam, legacyPrompt);

      if (!messages.length) {
        throw new NodeOperationError(this.getNode(), 'At least one message is required');
      }

      const enableWebSearch = resolveWebSearchEnabled(builtInTools, legacyParams);
      const generationOptions = resolveGenerationOptions(options, legacyParams);
      const anthropicRequest = buildAnthropicRequest(model, messages, generationOptions);
      const projectId = await getProjectId(this);

      let response: unknown;

      if (outputContentAsJson) {
        const rawResponse = await callGenerateContent(this, {
          anthropicRequest,
          projectId,
          enableGoogleSearch: enableWebSearch,
          outputContentAsJson: false,
        });

        const rawText = extractRawTextForJsonConversion(rawResponse);
        const jsonConversionRequest = buildJsonConversionRequest(anthropicRequest, rawText);

        response = await callGenerateContent(this, {
          anthropicRequest: jsonConversionRequest,
          projectId,
          enableGoogleSearch: false,
          outputContentAsJson: true,
        });
      } else {
        response = await callGenerateContent(this, {
          anthropicRequest,
          projectId,
          enableGoogleSearch: enableWebSearch,
          outputContentAsJson: false,
        });
      }

      const output = buildOutput(response, simplifyOutput, outputContentAsJson);

      returnData.push({ json: output });
    } catch (error) {
      if (error instanceof NodeApiError || error instanceof NodeOperationError) {
        throw error;
      }
      const err = error instanceof Error ? error : new Error(String(error));
      throw new NodeOperationError(this.getNode(), err);
    }
  }

  return [returnData];
}
