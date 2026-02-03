"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpenCodeApi = void 0;
class OpenCodeApi {
    constructor() {
        this.name = 'openCodeApi';
        this.displayName = 'OpenCode API';
        this.icon = 'file:opencode.svg';
        this.documentationUrl = 'https://opencode.ai';
        this.properties = [
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
        this.authenticate = {
            type: 'generic',
            properties: {
                headers: {
                    Authorization: '={{"Bearer " + $credentials.apiKey}}',
                },
            },
        };
        this.test = {
            request: {
                baseURL: '={{$credentials.baseUrl}}',
                url: '/v1/models',
                method: 'GET',
            },
        };
    }
}
exports.OpenCodeApi = OpenCodeApi;
//# sourceMappingURL=OpenCodeApi.credentials.js.map