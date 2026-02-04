import type { ICredentialType, INodeProperties } from 'n8n-workflow';

export class AntigravityOAuth2Api implements ICredentialType {
  name = 'antigravityOAuth2Api';
  extends = ['oAuth2Api'];
  displayName = 'Antigravity OAuth2 API';
  documentationUrl = 'https://accounts.google.com/';

  properties: INodeProperties[] = [
    {
      displayName: 'Grant Type',
      name: 'grantType',
      type: 'hidden',
      default: 'authorizationCode',
    },
    {
      displayName: 'Client ID',
      name: 'clientId',
      type: 'hidden',
      default: '1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com',
    },
    {
      displayName: 'Client Secret',
      name: 'clientSecret',
      type: 'hidden',
      typeOptions: { password: true },
      default: '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',
    },
    {
      displayName: 'Authorization URL',
      name: 'authUrl',
      type: 'hidden',
      default: 'https://accounts.google.com/o/oauth2/v2/auth',
      required: true,
    },
    {
      displayName: 'Access Token URL',
      name: 'accessTokenUrl',
      type: 'hidden',
      default: 'https://oauth2.googleapis.com/token',
      required: true,
    },
    {
      displayName: 'Scope',
      name: 'scope',
      type: 'hidden',
      default: [
        'https://www.googleapis.com/auth/cloud-platform',
        'https://www.googleapis.com/auth/userinfo.email',
        'https://www.googleapis.com/auth/userinfo.profile',
        'https://www.googleapis.com/auth/cclog',
        'https://www.googleapis.com/auth/experimentsandconfigs',
      ].join(' '),
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
      default: 'header',
    },
  ];
}
