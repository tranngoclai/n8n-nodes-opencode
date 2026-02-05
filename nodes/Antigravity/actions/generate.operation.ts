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
  buildCloudCodePayload,
  callGenerateContent,
  deriveSessionId,
  GEMINI_MAX_OUTPUT_TOKENS,
  getProjectId,
} from '../transport/antigravity.api';

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

function toGeminiRole(role: string): 'user' | 'model' {
  return role === 'assistant' ? 'model' : 'user';
}

function buildGeminiContents(messages: NormalizedMessage[]): Array<Record<string, unknown>> {
  return messages.map(message => ({
    role: toGeminiRole(message.role),
    parts: [{ text: message.content }],
  }));
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
    .map(message => ({
      role: message?.role || 'user',
      content: typeof message?.content === 'string' ? message.content : '',
    }))
    .filter(message => message.content.trim().length > 0);

  if (normalizedMessages.length > 0) {
    return normalizedMessages;
  }

  if (legacyPrompt) {
    return [{ role: 'user', content: legacyPrompt }];
  }

  return [];
}

function buildSessionSeed(messages: NormalizedMessage[], legacyPrompt: string, itemIndex: number): string {
  const combinedMessageContent = messages.map(message => message.content).join('|');
  if (combinedMessageContent) {
    return combinedMessageContent;
  }
  if (legacyPrompt) {
    return legacyPrompt;
  }
  return `${itemIndex}`;
}

function buildGenerationConfig(options: GenerationOptions, outputContentAsJson: boolean): Record<string, unknown> {
  const generationConfig: Record<string, unknown> = {
    maxOutputTokens: Math.min(options.maxTokens, GEMINI_MAX_OUTPUT_TOKENS),
    temperature: options.temperature,
    topP: options.topP,
    topK: options.topK,
  };

  if (outputContentAsJson) {
    generationConfig.responseMimeType = 'application/json';
  }

  if (options.stopSequences.length > 0) {
    generationConfig.stopSequences = options.stopSequences;
  }

  return generationConfig;
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

function extractFirstCandidateText(response: unknown): string | undefined {
  if (!isRecord(response)) return undefined;
  const responseRecord = isRecord(response.response) ? (response.response as UnknownRecord) : response;
  const candidates = getArray(responseRecord.candidates);
  if (!candidates.length) return undefined;
  const firstCandidate = candidates[0];
  if (!isRecord(firstCandidate)) return undefined;
  const content = isRecord(firstCandidate.content) ? (firstCandidate.content as UnknownRecord) : {};
  const parts = getArray(content.parts);
  if (!parts.length) return undefined;
  const textParts = parts
    .map(part => (isRecord(part) ? getStringProp(part as UnknownRecord, 'text') : undefined))
    .filter((value): value is string => typeof value === 'string');
  if (!textParts.length) return undefined;
  return textParts.join('');
}

function buildOutput(
  response: unknown,
  simplifyOutput: boolean,
  outputContentAsJson: boolean
): IDataObject {
  let parsedContent: OutputValue | undefined;
  let jsonParseStatus: 'success' | 'failed' | undefined;
  if (outputContentAsJson) {
    const text = extractFirstCandidateText(response) ?? '';
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
    const text = extractFirstCandidateText(response) ?? '';
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
      const endpointPreference = getParam<string>('endpoint', 'auto');
      const legacyParams = asRecord(this.getNode().parameters);

      if (!isGeminiModel(model)) {
        throw new NodeOperationError(
          this.getNode(),
          `Only Gemini models are supported. Received: ${model || 'unknown'}`
        );
      }

      const legacyPrompt = getStringProp(legacyParams, 'prompt') ?? '';
      const messages = resolveMessages(messagesParam, legacyPrompt);

      if (!messages.length) {
        throw new NodeOperationError(this.getNode(), 'At least one message is required');
      }

      const enableWebSearch = resolveWebSearchEnabled(builtInTools, legacyParams);
      const generationOptions = resolveGenerationOptions(options, legacyParams);
      const projectId = await getProjectId(this, endpointPreference);
      const sessionSeed = buildSessionSeed(messages, legacyPrompt, i);
      const sessionId = deriveSessionId(sessionSeed);

      const googleRequest: Record<string, unknown> = {
        contents: buildGeminiContents(messages),
        generationConfig: buildGenerationConfig(generationOptions, outputContentAsJson),
      };

      if (generationOptions.systemMessage) {
        googleRequest.systemInstruction = { parts: [{ text: generationOptions.systemMessage }] };
      }

      if (enableWebSearch) {
        googleRequest.tools = [{ googleSearch: {} }];
      }

      const payload = buildCloudCodePayload({
        model,
        projectId,
        googleRequest,
        sessionId,
      });

      const response = await callGenerateContent(this, payload, endpointPreference, model);
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
