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
    icon: 'file:antigravity.png',
    group: ['input'],
    version: 1,
    description: 'Call Antigravity Cloud Code models',
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
        options: [
          { name: 'Text', value: 'text' },
          { name: 'Models', value: 'models' },
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
        options: [{ name: 'Message a Model', value: 'generate' }],
        default: 'generate',
      },
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        displayOptions: {
          show: {
            resource: ['models'],
          },
        },
        options: [{ name: 'List Models', value: 'listModels' }],
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
