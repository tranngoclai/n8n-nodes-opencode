import {
  NodeApiError,
  NodeOperationError,
  type IExecuteFunctions,
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
    displayName: 'Model',
    name: 'model',
    type: 'options',
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
        name: 'stopSequences',
        displayName: 'Stop Sequences (comma-separated)',
        values: [
          {
            displayName: 'Stop Sequences (comma-separated)',
            name: 'stopSequences',
            type: 'string',
            default: '',
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

function isGeminiModel(model: string): boolean {
  return (model || '').toLowerCase().includes('gemini');
}

function toGeminiRole(role: string): 'user' | 'model' {
  return role === 'assistant' ? 'model' : 'user';
}

function buildGeminiContents(messages: Array<{ role: string; content: string }>): Array<Record<string, any>> {
  return messages.map(message => ({
    role: toGeminiRole(message.role),
    parts: [{ text: message.content }],
  }));
}

function parseGeminiResponse(response: any): {
  parts: Array<Record<string, any>>;
  text: string;
  stopReason: string | null;
  search: SearchMetadata;
} {
  const inner = response?.response ?? response;
  const candidate = inner?.candidates?.[0] ?? {};
  const parts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [];
  const text = parts
    .filter((part: any) => part?.text !== undefined && part?.thought !== true)
    .map((part: any) => part.text ?? '')
    .join('');
  const stopReason = candidate?.finishReason ?? null;

  const grounding = candidate?.groundingMetadata ?? {};
  const searchQueries = Array.isArray(grounding?.webSearchQueries) ? grounding.webSearchQueries : [];
  const sources = Array.isArray(grounding?.groundingChunks)
    ? grounding.groundingChunks
        .map((chunk: any) =>
          chunk?.web?.uri && chunk?.web?.title ? { title: chunk.web.title, url: chunk.web.uri } : null
        )
        .filter(Boolean)
    : [];
  const urlsRetrieved = Array.isArray(candidate?.urlContextMetadata?.url_metadata)
    ? candidate.urlContextMetadata.url_metadata
        .map((meta: any) =>
          meta?.retrieved_url ? { url: meta.retrieved_url, status: meta.url_retrieval_status ?? 'UNKNOWN' } : null
        )
        .filter(Boolean)
    : [];

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
      const builtInTools = getParam<Record<string, any>>('builtInTools', {});
      const options = getParam<Record<string, any>>('options', {});
      const simplifyOutput = getParam<boolean>('simplifyOutput', false);
      const outputContentAsJson = getParam<boolean>('outputContentAsJson', false);
      const maxTokens = typeof options.maxTokens === 'number' ? options.maxTokens : 512;
      const temperature = typeof options.temperature === 'number' ? options.temperature : 0.7;
      const topP = typeof options.topP === 'number' ? options.topP : 1;
      const topK = typeof options.topK === 'number' ? options.topK : 0;
      const stopSequencesRaw = typeof options.stopSequences === 'string' ? options.stopSequences : '';
      const legacyParams = this.getNode().parameters as Record<string, any>;
      const legacyEnableWebSearch = typeof legacyParams.enableWebSearch === 'boolean' ? legacyParams.enableWebSearch : undefined;
      const enableWebSearch =
        typeof builtInTools.googleSearch === 'boolean' ? builtInTools.googleSearch : legacyEnableWebSearch ?? false;
      const endpointPreference = getParam<string>('endpoint', 'auto');
      const systemMessage =
        typeof options.systemMessage === 'string'
          ? options.systemMessage
          : typeof legacyParams.systemPrompt === 'string'
            ? legacyParams.systemPrompt
            : '';

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

      const legacyPrompt = typeof legacyParams.prompt === 'string' ? legacyParams.prompt : '';
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

      const generationConfig: Record<string, any> = {};
      if (typeof maxTokens === 'number') {
        generationConfig.maxOutputTokens = Math.min(maxTokens, GEMINI_MAX_OUTPUT_TOKENS);
      }
      if (temperature !== undefined) {
        generationConfig.temperature = temperature;
      }
      if (topP !== undefined) {
        generationConfig.topP = topP;
      }
      if (topK !== undefined) {
        generationConfig.topK = topK;
      }
      if (stopSequences.length > 0) {
        generationConfig.stopSequences = stopSequences;
      }

      const googleRequest: Record<string, any> = {
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

      returnData.push({ json: output as any });
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
