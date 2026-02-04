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
  extractUsage,
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
    displayName: 'Simplify Output',
    name: 'simplifyOutput',
    type: 'boolean',
    default: false,
    displayOptions: SHOW_GENERATE,
  },
  {
    displayName: 'Output Content as JSON',
    name: 'outputContentAsJson',
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
            default: 512,
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

type SearchMetadata = {
  searchQueries: string[];
  sources: Array<{ title: string; url: string }>;
  urlsRetrieved: Array<{ url: string; status: string }>;
};

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null;
}

function asRecord(value: unknown): UnknownRecord {
  return isRecord(value) ? value : {};
}

function getArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
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

function isGeminiModel(model: string): boolean {
  return (model || '').toLowerCase().includes('gemini');
}

function toGeminiRole(role: string): 'user' | 'model' {
  return role === 'assistant' ? 'model' : 'user';
}

function buildGeminiContents(messages: Array<{ role: string; content: string }>): Array<Record<string, unknown>> {
  return messages.map(message => ({
    role: toGeminiRole(message.role),
    parts: [{ text: message.content }],
  }));
}

function parseGeminiResponse(response: unknown): {
  parts: Array<Record<string, unknown>>;
  text: string;
  stopReason: string | null;
  search: SearchMetadata;
} {
  const root = isRecord(response) && 'response' in response ? (response as UnknownRecord).response : response;
  const inner = asRecord(root);
  const candidates = getArray(inner.candidates);
  const candidate = isRecord(candidates[0]) ? (candidates[0] as UnknownRecord) : {};
  const content = asRecord(candidate.content);
  const parts = getArray(content.parts).filter(isRecord) as Array<Record<string, unknown>>;
  const text = parts
    .filter(part => part.text !== undefined && part.thought !== true)
    .map(part => (typeof part.text === 'string' ? part.text : ''))
    .join('');
  const stopReason = typeof candidate.finishReason === 'string' ? candidate.finishReason : null;

  const grounding = asRecord(candidate.groundingMetadata);
  const searchQueries = getArray(grounding.webSearchQueries).filter(
    (query): query is string => typeof query === 'string'
  );
  const sources = getArray(grounding.groundingChunks)
    .map(chunk => {
      if (!isRecord(chunk)) return null;
      const web = asRecord(chunk.web);
      const title = typeof web.title === 'string' ? web.title : '';
      const url = typeof web.uri === 'string' ? web.uri : '';
      return title && url ? { title, url } : null;
    })
    .filter((source): source is { title: string; url: string } => Boolean(source));
  const urlContext = asRecord(candidate.urlContextMetadata);
  const urlsRetrieved = getArray(urlContext.url_metadata)
    .map(meta => {
      if (!isRecord(meta)) return null;
      const url = typeof meta.retrieved_url === 'string' ? meta.retrieved_url : '';
      const statusValue = meta.url_retrieval_status;
      const status = typeof statusValue === 'string' ? statusValue : 'UNKNOWN';
      return url ? { url, status } : null;
    })
    .filter((entry): entry is { url: string; status: string } => Boolean(entry));

  return {
    parts,
    text,
    stopReason,
    search: {
      searchQueries,
      sources: sources as Array<{ title: string; url: string }>,
      urlsRetrieved: urlsRetrieved as Array<{ url: string; status: string }>,
    },
  };
}

export async function execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
  const items = this.getInputData();
  const returnData: INodeExecutionData[] = [];

  for (let i = 0; i < items.length; i++) {
    const getParam = <T,>(name: string, fallback: T) => this.getNodeParameter(name, i, fallback) as T;

    try {
      const model = getParam<string>('model', 'gemini-3-flash');
      const messagesParam = getParam<{ message?: Array<{ role?: string; content?: string }> }>('messages', {});
      const builtInTools = getParam<UnknownRecord>('builtInTools', {});
      const options = getParam<UnknownRecord>('options', {});
      const simplifyOutput = getParam<boolean>('simplifyOutput', false);
      const outputContentAsJson = getParam<boolean>('outputContentAsJson', false);
      const maxTokens = getNumberProp(options, 'maxTokens') ?? 512;
      const temperature = getNumberProp(options, 'temperature') ?? 0.7;
      const topP = getNumberProp(options, 'topP') ?? 1;
      const topK = getNumberProp(options, 'topK') ?? 0;
      const stopSequencesRaw = getStringProp(options, 'stopSequences') ?? '';
      const legacyParams = asRecord(this.getNode().parameters);
      const legacyEnableWebSearch = getBooleanProp(legacyParams, 'enableWebSearch');
      const enableWebSearch = getBooleanProp(builtInTools, 'googleSearch') ?? legacyEnableWebSearch ?? false;
      const endpointPreference = getParam<string>('endpoint', 'auto');
      const systemMessage =
        getStringProp(options, 'systemMessage') ?? getStringProp(legacyParams, 'systemPrompt') ?? '';

      if (!isGeminiModel(model)) {
        throw new NodeOperationError(
          this.getNode(),
          `Only Gemini models are supported. Received: ${model || 'unknown'}`
        );
      }

      const messageItems = Array.isArray(messagesParam.message) ? messagesParam.message : [];
      const normalizedMessages = messageItems
        .map(message => ({
          role: message?.role || 'user',
          content: typeof message?.content === 'string' ? message.content : '',
        }))
        .filter(message => message.content.trim().length > 0);

      const legacyPrompt = getStringProp(legacyParams, 'prompt') ?? '';
      const messages =
        normalizedMessages.length > 0
          ? normalizedMessages
          : legacyPrompt
            ? [{ role: 'user', content: legacyPrompt }]
            : [];

      if (!messages.length) {
        throw new NodeOperationError(this.getNode(), 'At least one message is required');
      }

      const projectId = await getProjectId(this, endpointPreference);

      const stopSequences = stopSequencesRaw
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);

      const sessionSeed = messages.map(message => message.content).join('|') || legacyPrompt || `${i}`;
      const sessionId = deriveSessionId(sessionSeed);

      const generationConfig: Record<string, unknown> = {};
      generationConfig.maxOutputTokens = Math.min(maxTokens, GEMINI_MAX_OUTPUT_TOKENS);
      generationConfig.temperature = temperature;
      generationConfig.topP = topP;
      generationConfig.topK = topK;
      if (stopSequences.length > 0) {
        generationConfig.stopSequences = stopSequences;
      }

      const googleRequest: Record<string, unknown> = {
        contents: buildGeminiContents(messages),
        generationConfig,
      };

      if (systemMessage) {
        googleRequest.systemInstruction = { parts: [{ text: systemMessage }] };
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
      const parsed = parseGeminiResponse(response);
      const searchMetadata = enableWebSearch
        ? {
            searchQueries: parsed.search.searchQueries,
            sources: parsed.search.sources,
            urlsRetrieved: parsed.search.urlsRetrieved,
          }
        : null;

      const fullOutput = {
        text: parsed.text,
        model,
        usage: extractUsage(response),
        raw: response,
        stopReason: parsed.stopReason || undefined,
        content: parsed.parts.length > 0 ? parsed.parts : undefined,
        ...(searchMetadata ?? {}),
      };

      const output = simplifyOutput
        ? outputContentAsJson
          ? {
              text: parsed.text,
              content: parsed.parts.length > 0 ? parsed.parts : undefined,
              ...(searchMetadata ?? {}),
            }
          : { text: parsed.text }
        : fullOutput;

      returnData.push({ json: output as IDataObject });
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
