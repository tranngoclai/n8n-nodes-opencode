import {
  NodeConnectionTypes,
  NodeOperationError,
  type IExecuteFunctions,
  type INodeExecutionData,
  type INodeType,
  type INodeTypeDescription,
} from 'n8n-workflow';
import { descriptions, operations } from './actions';
import { loadOptions } from './methods';

export class Antigravity implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Antigravity',
    name: 'antigravity',
    icon: 'file:antigravity.svg',
    group: ['input'],
    version: 1,
    subtitle: '={{ $parameter["operation"] + ": " + $parameter["resource"] }}',
    description: 'Call Antigravity Cloud Code models',
    usableAsTool: true,
    defaults: {
      name: 'Antigravity',
    },
    inputs: [NodeConnectionTypes.Main],
    outputs: [NodeConnectionTypes.Main],
    credentials: [{ name: 'antigravityOAuth2Api', required: true }],
    properties: [
      {
        displayName: 'Resource',
        name: 'resource',
        type: 'options',
        noDataExpression: true,
        options: [
          { name: 'Text', value: 'text' },
          { name: 'Image', value: 'image' },
          { name: 'Model', value: 'model' },
        ],
        default: 'text',
      },
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        displayOptions: {
          show: {
            resource: ['text'],
          },
        },
        noDataExpression: true,
        options: [{ name: 'Message a Model', value: 'generate', action: 'Message a model' }],
        default: 'generate',
      },
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        displayOptions: {
          show: {
            resource: ['image'],
          },
        },
        noDataExpression: true,
        options: [{ name: 'Generate Image', value: 'generateImage', action: 'Generate an image' }],
        default: 'generateImage',
      },
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        displayOptions: {
          show: {
            resource: ['model'],
          },
        },
        noDataExpression: true,
        options: [{ name: 'List Models', value: 'listModels', action: 'List models' }],
        default: 'listModels',
      },
      ...descriptions,
    ],
  };

  methods = { loadOptions };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const operation = this.getNodeParameter('operation', 0) as keyof typeof operations;
    const handler = operations[operation];

    if (!handler?.execute) {
      throw new NodeOperationError(this.getNode(), `Unknown operation: ${String(operation)}`);
    }

    return handler.execute.call(this);
  }
}
