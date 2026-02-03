/**
 * Constants for Antigravity OAuth and API integration
 * Ported from opencode-antigravity-auth/src/constants.ts
 */

export const ANTIGRAVITY_CLIENT_ID = '1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com';
export const ANTIGRAVITY_CLIENT_SECRET = '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';

export const ANTIGRAVITY_SCOPES = [
    'https://www.googleapis.com/auth/cloud-platform',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
    'https://www.googleapis.com/auth/cclog',
    'https://www.googleapis.com/auth/experimentsandconfigs',
];

export const ANTIGRAVITY_REDIRECT_URI = 'http://localhost:51121/oauth-callback';

// API Endpoints
export const ANTIGRAVITY_ENDPOINT_DAILY = 'https://daily-cloudcode-pa.sandbox.googleapis.com';
export const ANTIGRAVITY_ENDPOINT_AUTOPUSH = 'https://autopush-cloudcode-pa.sandbox.googleapis.com';
export const ANTIGRAVITY_ENDPOINT_PROD = 'https://cloudcode-pa.googleapis.com';

export const ANTIGRAVITY_ENDPOINT_FALLBACKS = [
    ANTIGRAVITY_ENDPOINT_DAILY,
    ANTIGRAVITY_ENDPOINT_AUTOPUSH,
    ANTIGRAVITY_ENDPOINT_PROD,
] as const;

// Version configuration
export const ANTIGRAVITY_VERSION = '1.15.8';

// Headers for Antigravity API requests
export const ANTIGRAVITY_HEADERS = {
    'User-Agent': `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Antigravity/${ANTIGRAVITY_VERSION} Chrome/138.0.7204.235 Electron/37.3.1 Safari/537.36`,
    'X-Goog-Api-Client': 'google-cloud-sdk vscode_cloudshelleditor/0.1',
    'Client-Metadata': '{"ideType":"IDE_UNSPECIFIED","platform":"PLATFORM_UNSPECIFIED","pluginType":"GEMINI"}',
} as const;

// Default project ID for accounts without a managed project
export const ANTIGRAVITY_DEFAULT_PROJECT_ID = 'rising-fact-p41fc';

// Antigravity model prefixes
export const ANTIGRAVITY_MODEL_PREFIXES = [
    'claude-opus-4',
    'claude-sonnet-4',
    'gemini-3-',
] as const;
