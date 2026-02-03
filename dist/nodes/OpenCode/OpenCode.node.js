"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpenCode = void 0;
const n8n_workflow_1 = require("n8n-workflow");
class OpenCode {
    constructor() {
        this.description = {
            displayName: 'OpenCode',
            name: 'openCode',
            icon: 'file:opencode.svg',
            group: ['transform'],
            version: 1,
            subtitle: '={{$parameter["operation"]}}',
            description: 'Interact with OpenCode AI API',
            defaults: {
                name: 'OpenCode',
            },
            inputs: [n8n_workflow_1.NodeConnectionTypes.Main],
            outputs: [n8n_workflow_1.NodeConnectionTypes.Main],
            usableAsTool: true,
            credentials: [
                {
                    name: 'googleOAuth2Api',
                    required: true,
                    displayOptions: {
                        show: {
                            authentication: ['googleOAuth2'],
                        },
                    },
                },
                {
                    name: 'openCodeApi',
                    required: true,
                },
            ],
            properties: [
                {
                    displayName: 'Authentication',
                    name: 'authentication',
                    type: 'options',
                    options: [
                        {
                            name: 'Google OAuth2',
                            value: 'googleOAuth2',
                        },
                        {
                            name: 'None',
                            value: 'none',
                        },
                    ],
                    default: 'googleOAuth2',
                    description: 'Authentication method to use',
                },
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
                    description: 'The AI model to use (Antigravity models require opencode-antigravity-auth plugin)',
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
    }
    async execute() {
        var _a;
        const items = this.getInputData();
        const returnData = [];
        for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
            try {
                const operation = this.getNodeParameter('operation', itemIndex);
                const model = this.getNodeParameter('model', itemIndex);
                const temperature = this.getNodeParameter('temperature', itemIndex);
                const maxTokens = this.getNodeParameter('maxTokens', itemIndex);
                const additionalOptions = this.getNodeParameter('additionalOptions', itemIndex, {});
                const credentials = await this.getCredentials('openCodeApi');
                const baseUrl = credentials.baseUrl;
                let userMessage = '';
                switch (operation) {
                    case 'generateCode':
                        userMessage = this.getNodeParameter('prompt', itemIndex);
                        break;
                    case 'completeCode': {
                        const codeToComplete = this.getNodeParameter('code', itemIndex);
                        const completeInstructions = this.getNodeParameter('instructions', itemIndex, '');
                        userMessage = completeInstructions
                            ? `${completeInstructions}\n\nCode:\n\`\`\`\n${codeToComplete}\n\`\`\``
                            : `Complete this code:\n\`\`\`\n${codeToComplete}\n\`\`\``;
                        break;
                    }
                    case 'analyzeCode': {
                        const codeToAnalyze = this.getNodeParameter('code', itemIndex);
                        const analyzeInstructions = this.getNodeParameter('instructions', itemIndex, '');
                        userMessage = analyzeInstructions
                            ? `${analyzeInstructions}\n\nCode:\n\`\`\`\n${codeToAnalyze}\n\`\`\``
                            : `Analyze this code:\n\`\`\`\n${codeToAnalyze}\n\`\`\``;
                        break;
                    }
                    case 'chat':
                        userMessage = this.getNodeParameter('prompt', itemIndex);
                        break;
                    default:
                        throw new n8n_workflow_1.NodeOperationError(this.getNode(), `Unknown operation: ${operation}`, { itemIndex });
                }
                const body = {
                    model,
                    messages: [
                        {
                            role: 'user',
                            content: userMessage,
                        },
                    ],
                    temperature,
                    max_tokens: maxTokens,
                    plugin: ['opencode-antigravity-auth@latest'],
                    ...additionalOptions,
                };
                const response = await this.helpers.httpRequestWithAuthentication.call(this, 'openCodeApi', {
                    method: 'POST',
                    url: `${baseUrl}/v1/chat/completions`,
                    body,
                    json: true,
                });
                const aiResponse = response;
                const choices = aiResponse.choices;
                const message = (_a = choices[0]) === null || _a === void 0 ? void 0 : _a.message;
                const content = message === null || message === void 0 ? void 0 : message.content;
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
            }
            catch (error) {
                if (this.continueOnFail()) {
                    returnData.push({
                        json: {
                            error: error.message,
                        },
                        pairedItem: itemIndex,
                    });
                }
                else {
                    if (error.context) {
                        error.context.itemIndex = itemIndex;
                        throw error;
                    }
                    throw new n8n_workflow_1.NodeOperationError(this.getNode(), error, {
                        itemIndex,
                    });
                }
            }
        }
        return [returnData];
    }
}
exports.OpenCode = OpenCode;
//# sourceMappingURL=OpenCode.node.js.map