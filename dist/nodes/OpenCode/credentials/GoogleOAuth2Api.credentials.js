"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GoogleOAuth2Api = void 0;
class GoogleOAuth2Api {
    constructor() {
        this.name = 'googleOAuth2Api';
        this.displayName = 'Google OAuth2 API';
        this.icon = 'file:google.svg';
        this.documentationUrl = 'https://developers.google.com/identity/protocols/oauth2';
        this.properties = [
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
                displayName: 'Scope',
                name: 'scope',
                type: 'hidden',
                default: 'openid email profile',
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
                displayName: 'Client ID',
                name: 'clientId',
                type: 'string',
                default: '',
                required: true,
            },
            {
                displayName: 'Client Secret',
                name: 'clientSecret',
                type: 'string',
                typeOptions: {
                    password: true,
                },
                default: '',
                required: true,
            },
        ];
        this.authenticate = {
            type: 'generic',
            properties: {
                headers: {
                    Authorization: '={{"Bearer " + $credentials.oauthTokenData.access_token}}',
                },
            },
        };
        this.test = {
            request: {
                baseURL: 'https://www.googleapis.com',
                url: '/oauth2/v1/userinfo',
            },
        };
    }
}
exports.GoogleOAuth2Api = GoogleOAuth2Api;
//# sourceMappingURL=GoogleOAuth2Api.credentials.js.map