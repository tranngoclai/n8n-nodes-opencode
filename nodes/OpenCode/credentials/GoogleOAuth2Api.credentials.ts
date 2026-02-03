import type {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class GoogleOAuth2Api implements ICredentialType {
	name = 'googleOAuth2Api';
	displayName = 'Google OAuth2 API';
	icon = 'file:google.svg' as unknown as ICredentialType['icon'];
	documentationUrl = 'https://developers.google.com/identity/protocols/oauth2';
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
		},
	};
}
