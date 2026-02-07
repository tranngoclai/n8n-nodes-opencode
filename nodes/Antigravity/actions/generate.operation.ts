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

type ExtractedImage = {
  data: string;
  mimeType: string;
};

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

function extractImagesFromResponse(response: unknown): ExtractedImage[] {
  if (!isRecord(response)) return [];

  return getArray(response.content)
    .map((block) => {
      if (!isRecord(block)) return undefined;
      if (getStringProp(block as UnknownRecord, 'type') !== 'image') return undefined;

      const source = getNestedRecord(block as UnknownRecord, 'source');
      if (getStringProp(source, 'type') !== 'base64') return undefined;

      const data = getStringProp(source, 'data');
      if (!data) return undefined;

      const mimeType = getStringProp(source, 'media_type') ?? 'application/octet-stream';

      return { data, mimeType };
    })
    .filter((image): image is ExtractedImage => image !== undefined);
}

function extensionForMimeType(mimeType: string): string {
  const normalized = mimeType.toLowerCase();
  if (normalized === 'image/jpeg') return 'jpg';
  if (normalized === 'image/png') return 'png';
  if (normalized === 'image/gif') return 'gif';
  if (normalized === 'image/webp') return 'webp';
  if (normalized === 'image/bmp') return 'bmp';
  if (normalized === 'image/tiff') return 'tiff';

  const [, subtype] = normalized.split('/');
  if (!subtype) return 'bin';
  return subtype.split('+')[0] || 'bin';
}

function stripJsonCodeFences(text: string): string {
  const trimmed = text.trim();
  const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (!match) {
    return text;
  }
  return match[1].trim();
}

function buildOutput(
  response: unknown,
  simplifyOutput: boolean,
  outputContentAsJson: boolean,
): IDataObject {
  let parsedContent: OutputValue | undefined;
  let jsonParseStatus: 'success' | 'failed' | 'disabled' = 'disabled';

  if (outputContentAsJson) {
    const text = stripJsonCodeFences(extractFirstResponseText(response) ?? '');
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
    return { response: text, jsonParseStatus };
  }

  if (isRecord(response)) {
    if (outputContentAsJson) {
      return { ...(response as IDataObject), content: parsedContent, jsonParseStatus };
    }
    return { ...(response as IDataObject), jsonParseStatus };
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

  return { response: responseValue, jsonParseStatus };
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

      const response = await callGenerateContent(this, {
        anthropicRequest,
        projectId,
        enableGoogleSearch: enableWebSearch,
        outputContentAsJson,
      });
      const output = buildOutput(response, simplifyOutput, outputContentAsJson);
      const images = extractImagesFromResponse(response);
      let binary: INodeExecutionData['binary'] | undefined;

      if (images.length > 0) {
        binary = {};

        for (let imageIndex = 0; imageIndex < images.length; imageIndex++) {
          const image = images[imageIndex];
          const propertyName = images.length === 1 ? 'image' : `image_${imageIndex + 1}`;
          const extension = extensionForMimeType(image.mimeType);
          const fileName = `generated_${imageIndex + 1}.${extension}`;

          binary[propertyName] = await this.helpers.prepareBinaryData(
            Buffer.from(image.data, 'base64'),
            fileName,
            image.mimeType,
          );
        }
      }

      returnData.push({ json: output, binary });
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
