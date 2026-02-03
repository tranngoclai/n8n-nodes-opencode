import type {
    IExecuteFunctions,
    INodeExecutionData,
    INodeType,
    INodeTypeDescription,
    IDataObject,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import {
    getAntigravityEndpoint,
    getAntigravityHeaders,
    transformToAntigravityRequest,
    transformAntigravityResponse,
} from './utils/antigravity';
import { ANTIGRAVITY_DEFAULT_PROJECT_ID } from './utils/constants';


export class Antigravity implements INodeType {
    description: INodeTypeDescription = {
        displayName: 'Antigravity',
        name: 'antigravity',
        icon: 'file:google.svg',
        group: ['transform'],
        version: 1,
        subtitle: '={{$parameter["operation"]}}',
        description: 'Interact with Antigravity AI API',
        defaults: {
            name: 'Antigravity',
        },
        inputs: [NodeConnectionTypes.Main],
        outputs: [NodeConnectionTypes.Main],
        usableAsTool: true,
        credentials: [
            {
                name: 'antigravityOAuth2',
                required: true,
            },
        ],
        properties: [
            {
                displayName: 'Operation',
                name: 'operation',
                type: 'options',
                noDataExpression: true,
                options: [
                    {
                        name: 'Generate Code',
                        value: 'generateCode',
                        description: 'Generate code using AI',
                        action: 'Generate code using AI',
                    },
                    {
                        name: 'Complete Code',
                        value: 'completeCode',
                        description: 'Complete existing code',
                        action: 'Complete existing code',
                    },
                    {
                        name: 'Analyze Code',
                        value: 'analyzeCode',
                        description: 'Analyze and review code',
                        action: 'Analyze and review code',
                    },
                    {
                        name: 'Chat',
                        value: 'chat',
                        description: 'Have a conversation with AI',
                        action: 'Chat with AI',
                    },
                ],
                default: 'generateCode',
            },
            {
                displayName: 'Model',
                name: 'model',
                type: 'options',
                options: [
                    {
                        name: 'Claude 3 Opus',
                        value: 'claude-3-opus-20240229',
                    },
                    {
                        name: 'Claude 3.5 Sonnet',
                        value: 'claude-3-5-sonnet-20241022',
                    },
                    {
                        name: 'Claude Opus 4.5 (Antigravity)',
                        value: 'claude-opus-4.5',
                    },
                    {
                        name: 'Claude Sonnet 4.5 (Antigravity)',
                        value: 'claude-sonnet-4.5',
                    },
                    {
                        name: 'Gemini 3 Flash (Antigravity)',
                        value: 'gemini-3-flash',
                    },
                    {
                        name: 'Gemini 3 Pro (Antigravity)',
                        value: 'gemini-3-pro',
                    },
                    {
                        name: 'Gemini Pro',
                        value: 'gemini-pro',
                    },
                    {
                        name: 'GPT-3.5 Turbo',
                        value: 'gpt-3.5-turbo',
                    },
                    {
                        name: 'GPT-4',
                        value: 'gpt-4',
                    },
                ],
                default: 'gpt-4',
                description: 'The AI model to use (all models accessed via Antigravity)',
            },
            {
                displayName: 'Prompt',
                name: 'prompt',
                type: 'string',
                typeOptions: {
                    rows: 4,
                },
                default: '',
                required: true,
                displayOptions: {
                    show: {
                        operation: ['generateCode', 'chat'],
                    },
                },
                description: 'The prompt to send to the AI',
                placeholder: 'Write a function to calculate fibonacci numbers',
            },
            {
                displayName: 'Code',
                name: 'code',
                type: 'string',
                typeOptions: {
                    rows: 10,
                },
                default: '',
                required: true,
                displayOptions: {
                    show: {
                        operation: ['completeCode', 'analyzeCode'],
                    },
                },
                description: 'The code to complete or analyze',
            },
            {
                displayName: 'Instructions',
                name: 'instructions',
                type: 'string',
                typeOptions: {
                    rows: 2,
                },
                default: '',
                displayOptions: {
                    show: {
                        operation: ['completeCode', 'analyzeCode'],
                    },
                },
                description: 'Additional instructions for the AI',
                placeholder: 'Complete the function and add error handling',
            },
            {
                displayName: 'Temperature',
                name: 'temperature',
                type: 'number',
                typeOptions: {
                    minValue: 0,
                    maxValue: 2,
                    numberPrecision: 1,
                },
                default: 0.7,
                description: 'Controls randomness. Lower values are more focused and deterministic.',
            },
            {
                displayName: 'Max Tokens',
                name: 'maxTokens',
                type: 'number',
                default: 2000,
                description: 'Maximum number of tokens to generate',
            },
            {
                displayName: 'Additional Options',
                name: 'additionalOptions',
                type: 'collection',
                placeholder: 'Add Option',
                default: {},
                options: [
                    {
                        displayName: 'Top P',
                        name: 'topP',
                        type: 'number',
                        typeOptions: {
                            minValue: 0,
                            maxValue: 1,
                            numberPrecision: 2,
                        },
                        default: 1,
                        description: 'Controls diversity via nucleus sampling',
                    },
                    {
                        displayName: 'Frequency Penalty',
                        name: 'frequencyPenalty',
                        type: 'number',
                        typeOptions: {
                            minValue: 0,
                            maxValue: 2,
                            numberPrecision: 2,
                        },
                        default: 0,
                        description: 'Decreases likelihood of repeating the same line',
                    },
                    {
                        displayName: 'Presence Penalty',
                        name: 'presencePenalty',
                        type: 'number',
                        typeOptions: {
                            minValue: 0,
                            maxValue: 2,
                            numberPrecision: 2,
                        },
                        default: 0,
                        description: 'Increases likelihood of talking about new topics',
                    },
                ],
            },
        ],
    };

    async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
        const items = this.getInputData();
        const returnData: INodeExecutionData[] = [];

        for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
            try {
                const operation = this.getNodeParameter('operation', itemIndex) as string;
                const model = this.getNodeParameter('model', itemIndex) as string;
                const temperature = this.getNodeParameter('temperature', itemIndex) as number;
                const maxTokens = this.getNodeParameter('maxTokens', itemIndex) as number;
                const additionalOptions = this.getNodeParameter(
                    'additionalOptions',
                    itemIndex,
                    {},
                ) as IDataObject;

                // Get Antigravity OAuth2 credentials
                const credentials = await this.getCredentials('antigravityOAuth2');
                const oauthData = credentials.oauthTokenData as { access_token?: string } | undefined;
                const accessToken = oauthData?.access_token;
                const projectId = (credentials.projectId as string) || ANTIGRAVITY_DEFAULT_PROJECT_ID;

                if (!accessToken) {
                    throw new NodeOperationError(
                        this.getNode(),
                        'Access token not found. Please re-authenticate.',
                        { itemIndex },
                    );
                }

                let userMessage = '';

                // Build the prompt based on operation
                switch (operation) {
                    case 'generateCode':
                        userMessage = this.getNodeParameter('prompt', itemIndex) as string;
                        break;

                    case 'completeCode': {
                        const codeToComplete = this.getNodeParameter('code', itemIndex) as string;
                        const completeInstructions = this.getNodeParameter(
                            'instructions',
                            itemIndex,
                            '',
                        ) as string;
                        userMessage = completeInstructions
                            ? `${completeInstructions}\n\nCode:\n\`\`\`\n${codeToComplete}\n\`\`\``
                            : `Complete this code:\n\`\`\`\n${codeToComplete}\n\`\`\``;
                        break;
                    }

                    case 'analyzeCode': {
                        const codeToAnalyze = this.getNodeParameter('code', itemIndex) as string;
                        const analyzeInstructions = this.getNodeParameter(
                            'instructions',
                            itemIndex,
                            '',
                        ) as string;
                        userMessage = analyzeInstructions
                            ? `${analyzeInstructions}\n\nCode:\n\`\`\`\n${codeToAnalyze}\n\`\`\``
                            : `Analyze this code:\n\`\`\`\n${codeToAnalyze}\n\`\`\``;
                        break;
                    }

                    case 'chat':
                        userMessage = this.getNodeParameter('prompt', itemIndex) as string;
                        break;

                    default:
                        throw new NodeOperationError(
                            this.getNode(),
                            `Unknown operation: ${operation}`,
                            { itemIndex },
                        );
                }

                // Prepare request body
                const body: IDataObject = {
                    model,
                    messages: [
                        {
                            role: 'user',
                            content: userMessage,
                        },
                    ],
                    temperature,
                    max_tokens: maxTokens,
                    ...additionalOptions,
                };

                // Make direct Antigravity API request
                const endpoint = getAntigravityEndpoint();
                const headers = getAntigravityHeaders(accessToken);
                const transformedBody = transformToAntigravityRequest(body, projectId);

                const response = await this.helpers.httpRequest({
                    method: 'POST',
                    url: `${endpoint}/v1/chat/completions`,
                    headers,
                    body: transformedBody,
                    json: true,
                });

                const aiResponse = transformAntigravityResponse(response as IDataObject);
                const choices = aiResponse.choices as IDataObject[];
                const message = choices[0]?.message as IDataObject;
                const content = message?.content as string;

                returnData.push({
                    json: {
                        operation,
                        model,
                        prompt: userMessage,
                        response: content,
                        usage: aiResponse.usage,
                        fullResponse: aiResponse,
                    },
                    pairedItem: itemIndex,
                });
            } catch (error) {
                if (this.continueOnFail()) {
                    returnData.push({
                        json: {
                            error: error.message,
                        },
                        pairedItem: itemIndex,
                    });
                } else {
                    if (error.context) {
                        error.context.itemIndex = itemIndex;
                        throw error;
                    }
                    throw new NodeOperationError(this.getNode(), error, {
                        itemIndex,
                    });
                }
            }
        }

        return [returnData];
    }
}
