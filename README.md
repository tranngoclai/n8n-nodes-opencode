# n8n-nodes-antigravity

Community node for calling Antigravity Cloud Code (Gemini) with optional Google Grounding search.

## Features

- Message Gemini models through Antigravity Cloud Code
- List available models in your Antigravity project
- Optional Google Grounding web search with citations
- Simplified or full outputs with token usage

## Installation

Community Nodes UI (recommended): In n8n go to Settings → Community Nodes, click Install, and enter `n8n-nodes-antigravity`.

Manual install (self-hosted): From your n8n user folder (usually `~/.n8n`) run:

```bash
npm install n8n-nodes-antigravity
```

Restart n8n after installation. For Docker, mount your custom extensions folder or set `N8N_CUSTOM_EXTENSIONS` to the folder that contains this package.

## Credentials

Create an `Antigravity OAuth2 API` credential in n8n and authorize with your Google account. The credential uses a preconfigured Google OAuth client and requests offline access.

Project selection is automatic.

## Usage

Resource `Text` provides the `Message a Model` operation.

Resource `Image` provides the `Generate Image` operation.

Resource `Model` provides the `List Models` operation.

Key parameters for `Message a Model`:

- `Model` (Gemini models only)
- `Messages` (role + prompt)
- `Built-in Tools > Google Search` to enable Google Grounding
- `Options` for system message, max tokens, temperature, top P, top K, and stop sequences
- `Options > Response JSON Schema (JSON)` to constrain the model output to a JSON shape
- `Options > Response Schema Builder` to design a simple schema via fields
- `Simplify Output` and `Output Content as JSON`
- `Endpoint` to choose Auto, Prod, or Daily

Key parameters for `Generate Image`:

- Uses fixed model `gemini-3-pro-image` (no model picker)
- `Prompt`
- `Image Size` (`1K` or `2K`, default `1K`)
- `Aspect Ratio` (`1:1`, `3:4`, `4:3`, `9:16`, `16:9`, default `1:1`)
- `Person Generation` (`dont_allow`, `allow_adult`, `allow_all`; default `allow_adult`)

`Generate Image` returns the regular JSON response and binary images (`image` for one image, or `image_1`, `image_2`, ... for multiple images). If the model response contains no image blocks, the node fails with a clear error.

## Web Search

When Google Search is enabled, the node uses Google Grounding via Antigravity. The response includes `searchQueries`, `sources` (title + URL), and `urlsRetrieved`. Google Grounding cannot be combined with function declarations, so search runs as a separate call.

## Output

Full output includes `text`, `model`, `usage`, `raw`, `stopReason`, and `content` (if present). When `Simplify Output` is enabled, the node returns only `text`, or `text` plus `content` when `Output Content as JSON` is enabled.

## Development

```bash
npm install
npm run build
npm run dev
```

## License

MIT
