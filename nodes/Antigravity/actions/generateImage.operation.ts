import {
  NodeApiError,
  NodeOperationError,
  type IExecuteFunctions,
  type INodeExecutionData,
  type INodeProperties,
} from 'n8n-workflow';
import { SHOW_GENERATE_IMAGE } from './constants';
import { callGenerateContent, getProjectId } from '../transport/antigravity.api';
import { buildOutput, extractImagesFromResponse } from './helpers/generate-output';
import { prepareGeneratedImagesBinary } from './helpers/binary-output';
import {
  buildImageGenerationRequest,
  type AspectRatio,
  type ImageSize,
  type PersonGeneration,
} from './helpers/generate-image-params';

const IMAGE_GENERATION_MODEL = 'gemini-3-pro-image';

export const description: INodeProperties[] = [
  {
    displayName: 'Prompt',
    name: 'prompt',
    type: 'string',
    default: '',
    required: true,
    displayOptions: SHOW_GENERATE_IMAGE,
    typeOptions: {
      rows: 4,
    },
  },
  {
    displayName: 'Image Size',
    name: 'imageSize',
    type: 'options',
    options: [
      { name: '1K', value: '1K' },
      { name: '2K', value: '2K' },
    ],
    default: '1K',
    displayOptions: SHOW_GENERATE_IMAGE,
    description: 'Supported for Standard and Ultra models',
  },
  {
    displayName: 'Aspect Ratio',
    name: 'aspectRatio',
    type: 'options',
    options: [
      { name: '1:1', value: '1:1' },
      { name: '16:9', value: '16:9' },
      { name: '3:4', value: '3:4' },
      { name: '4:3', value: '4:3' },
      { name: '9:16', value: '9:16' },
    ],
    default: '1:1',
    displayOptions: SHOW_GENERATE_IMAGE,
  },
  {
    displayName: 'Person Generation',
    name: 'personGeneration',
    type: 'options',
    options: [
      { name: "Don't Allow", value: 'dont_allow' },
      { name: 'Allow Adult', value: 'allow_adult' },
      { name: 'Allow All', value: 'allow_all' },
    ],
    default: 'allow_adult',
    displayOptions: SHOW_GENERATE_IMAGE,
  },
  {
    displayName: 'Output Content as JSON',
    name: 'outputContentAsJson',
    type: 'boolean',
    default: false,
    displayOptions: SHOW_GENERATE_IMAGE,
  },
  {
    displayName: 'Simplify Output',
    name: 'simplifyOutput',
    type: 'boolean',
    default: false,
    displayOptions: SHOW_GENERATE_IMAGE,
  },
];

export async function execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
  const items = this.getInputData();
  const returnData: INodeExecutionData[] = [];

  for (let i = 0; i < items.length; i++) {
    const getParam = <T,>(name: string, fallback: T) => this.getNodeParameter(name, i, fallback) as T;

    try {
      const prompt = getParam<string>('prompt', '');
      const imageSize = getParam<ImageSize>('imageSize', '1K');
      const aspectRatio = getParam<AspectRatio>('aspectRatio', '1:1');
      const personGeneration = getParam<PersonGeneration>('personGeneration', 'allow_adult');
      const outputContentAsJson = getParam<boolean>('outputContentAsJson', false);
      const simplifyOutput = getParam<boolean>('simplifyOutput', false);

      if (!prompt.trim()) {
        throw new NodeOperationError(this.getNode(), 'Prompt is required');
      }

      const anthropicRequest = buildImageGenerationRequest({
        model: IMAGE_GENERATION_MODEL,
        prompt,
        imageSize,
        aspectRatio,
        personGeneration,
      });

      const projectId = await getProjectId(this);
      const response = await callGenerateContent(this, {
        anthropicRequest,
        projectId,
        outputContentAsJson,
      });

      const images = extractImagesFromResponse(response);
      if (images.length === 0) {
        throw new NodeOperationError(
          this.getNode(),
          'No images were generated. Use an image-capable Gemini model and verify image parameters.',
        );
      }

      const output = buildOutput(response, simplifyOutput, outputContentAsJson);
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
