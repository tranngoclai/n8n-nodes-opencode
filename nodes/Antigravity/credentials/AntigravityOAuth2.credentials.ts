import type {
    IAuthenticateGeneric,
    ICredentialTestRequest,
    ICredentialType,
    INodeProperties,
} from 'n8n-workflow';

import {
    ANTIGRAVITY_CLIENT_ID,
    ANTIGRAVITY_CLIENT_SECRET,
    ANTIGRAVITY_SCOPES,
} from '../utils/constants';

export class AntigravityOAuth2 implements ICredentialType {
    name = 'antigravityOAuth2';
    displayName = 'Antigravity OAuth2 API';
    icon = 'file:google.svg' as unknown as ICredentialType['icon'];
    documentationUrl = 'https://cloud.google.com/code/docs';
    extends = ['oAuth2Api'];

    properties: INodeProperties[] = [
        {
            displayName: 'Grant Type',
            name: 'grantType',
            type: 'hidden',
            default: 'authorizationCode',
        },
        {
            displayName: 'Authorization URL',
            name: 'authUrl',
            type: 'hidden',
            default: 'https://accounts.google.com/o/oauth2/v2/auth',
        },
        {
            displayName: 'Access Token URL',
            name: 'accessTokenUrl',
            type: 'hidden',
            default: 'https://oauth2.googleapis.com/token',
        },
        {
            displayName: 'Client ID',
            name: 'clientId',
            type: 'string',
            default: ANTIGRAVITY_CLIENT_ID,
            required: true,
            description: 'The Antigravity OAuth2 Client ID',
        },
        {
            displayName: 'Client Secret',
            name: 'clientSecret',
            type: 'string',
            typeOptions: {
                password: true,
            },
            default: ANTIGRAVITY_CLIENT_SECRET,
            required: true,
            description: 'The Antigravity OAuth2 Client Secret',
        },
        {
            displayName: 'Scope',
            name: 'scope',
            type: 'hidden',
            default: ANTIGRAVITY_SCOPES.join(' '),
        },
        {
            displayName: 'Auth URI Query Parameters',
            name: 'authQueryParameters',
            type: 'hidden',
            default: 'access_type=offline&prompt=consent',
        },
        {
            displayName: 'Authentication',
            name: 'authentication',
            type: 'hidden',
            default: 'body',
        },
        {
            displayName: 'Project ID',
            name: 'projectId',
            type: 'string',
            default: '',
            placeholder: 'rising-fact-p41fc',
            description: 'Google Cloud Project ID (optional - will be auto-detected if not provided)',
        },
    ];

    authenticate: IAuthenticateGeneric = {
        type: 'generic',
        properties: {
            headers: {
                Authorization: '={{"Bearer " + $credentials.oauthTokenData.access_token}}',
            },
        },
    };

    test: ICredentialTestRequest = {
        request: {
            baseURL: 'https://www.googleapis.com',
            url: '/oauth2/v1/userinfo',
            method: 'GET',
        },
    };
}
