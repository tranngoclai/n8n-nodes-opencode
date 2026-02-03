import type {
    IAuthenticateGeneric,
    ICredentialTestRequest,
    ICredentialType,
    INodeProperties,
} from 'n8n-workflow';

export class OpenCodeApi implements ICredentialType {
    name = 'openCodeApi';
    displayName = 'OpenCode API';
    icon = 'file:opencode.svg' as unknown as ICredentialType['icon'];
    documentationUrl = 'https://opencode.ai';
    properties: INodeProperties[] = [
        {
            displayName: 'API Key',
            name: 'apiKey',
            type: 'string',
            typeOptions: {
                password: true,
            },
            default: '',
            required: true,
            description: 'Your OpenCode API key',
        },
        {
            displayName: 'Base URL',
            name: 'baseUrl',
            type: 'string',
            default: 'https://api.opencode.ai',
            description: 'The base URL for OpenCode API',
        },
    ];

    authenticate: IAuthenticateGeneric = {
        type: 'generic',
        properties: {
            headers: {
                Authorization: '={{"Bearer " + $credentials.apiKey}}',
            },
        },
    };

    test: ICredentialTestRequest = {
        request: {
            baseURL: '={{$credentials.baseUrl}}',
            url: '/v1/models',
            method: 'GET',
        },
    };
}
