# n8n-nodes-antigravity

Community node for calling Antigravity Cloud Code directly. Web search is handled natively via Google's Grounding API.

## Quick Start

```bash
npm install
npm run build
```

For local development with live reload:

```bash
npm run dev
```

## Credentials

- **Antigravity OAuth2 API**: Use a Google OAuth client and grant offline access. Required for all operations.

## Web Search Providers

When **Enable Web Search** is true, the node uses Google Grounding API via the Antigravity API. It reuses the Antigravity OAuth2 API credential.

## Google Grounding API

The Google Grounding API provider uses `gemini-3-flash` to perform searches via Google's search grounding. This provides:
- Real-time web search results
- Source citations with titles and URLs
- Optional URL content analysis (when URLs are provided in the query)

**Note**: Google Grounding API cannot be combined with function declarations. When using this provider, the search is executed as a separate API call.
