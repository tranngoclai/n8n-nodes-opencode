import {
  NodeApiError,
  NodeOperationError,
  type IExecuteFunctions,
  type INodeExecutionData,
  type INodeProperties,
} from 'n8n-workflow';
import { SHOW_GENERATE_TEXT } from './constants';
import {
  callGenerateContent,
  GEMINI_MAX_OUTPUT_TOKENS,
  getProjectId,
} from '../transport/antigravity.api';
import {
  isGeminiModel,
  resolveGenerateRequestInputs,
  type MessageInput,
} from './helpers/generate-params';
import { buildOutput, extractImagesFromResponse } from './helpers/generate-output';
import { prepareGeneratedImagesBinary } from './helpers/binary-output';
import { asRecord, type UnknownRecord } from './helpers/object';

export const description: INodeProperties[] = [
  {
    displayName: 'Model Name or ID',
    name: 'model',
    type: 'options',
    description:
      'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
    default: 'gemini-3-flash',
    required: true,
    displayOptions: SHOW_GENERATE_TEXT,
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
    displayOptions: SHOW_GENERATE_TEXT,
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
    displayOptions: SHOW_GENERATE_TEXT,
  },
  {
    displayName: 'Simplify Output',
    name: 'simplifyOutput',
    type: 'boolean',
    default: false,
    displayOptions: SHOW_GENERATE_TEXT,
  },
  {
    displayName: 'Built-in Tools',
    name: 'builtInTools',
    type: 'collection',
    placeholder: 'Add Built-in Tool',
    default: {},
    displayOptions: SHOW_GENERATE_TEXT,
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
    displayOptions: SHOW_GENERATE_TEXT,
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

      const { messages, enableWebSearch, anthropicRequest } = resolveGenerateRequestInputs({
        model,
        messagesParam,
        options,
        builtInTools,
        legacyParams,
      });

      if (!messages.length) {
        throw new NodeOperationError(this.getNode(), 'At least one message is required');
      }

      const projectId = await getProjectId(this);

      const response = await callGenerateContent(this, {
        anthropicRequest,
        projectId,
        enableGoogleSearch: enableWebSearch,
        outputContentAsJson,
      });
      const output = buildOutput(response, simplifyOutput, outputContentAsJson);
      const images = extractImagesFromResponse(response);
      const binary = await prepareGeneratedImagesBinary(this, images);

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
