# n8n-nodes-opencode

This is an n8n community node that provides integration with OpenCode AI with built-in Antigravity authentication for premium AI models.

![n8n.io - Workflow Automation](https://raw.githubusercontent.com/n8n-io/n8n/master/assets/n8n-logo.png)

## Features

- **Built-in Antigravity Auth**: Automatically uses `opencode-antigravity-auth@latest` plugin for enhanced model access
- **Multiple AI Operations**:
  - **Generate Code**: Create code from natural language descriptions
  - **Complete Code**: Auto-complete existing code snippets
  - **Analyze Code**: Get code reviews and analysis
  - **Chat**: Have conversations with AI about code
- **9 AI Models**: Support for premium Antigravity models plus standard GPT, Claude, and Gemini models
- **Flexible Configuration**: Customize temperature, max tokens, and other AI parameters

## Installation

### In n8n (Self-hosted)

1. Go to **Settings** → **Community Nodes**
2. Click **Install**
3. Enter `n8n-nodes-opencode`
4. Click **Install**

### Manual Installation

```bash
npm install n8n-nodes-opencode
```

> **Note:** The node automatically uses the `opencode-antigravity-auth@latest` plugin. Ensure your OpenCode API endpoint supports this plugin for access to premium Antigravity models.

## Prerequisites

Before using this node, you need:

**OpenCode API Credentials**
- Sign up at [OpenCode.ai](https://opencode.ai)
- Generate an API key from your account settings

## Configuration

### Setting up OpenCode API

1. In n8n, go to **Credentials** → **New**
2. Select **OpenCode API**
3. Enter your:
   - **API Key**: From your OpenCode account
   - **Base URL**: Default is `https://api.opencode.ai` (change if using a different endpoint)
4. Click **Create**

> **Note:** The node automatically includes `opencode-antigravity-auth@latest` plugin for premium model access.

## Usage

### Basic Example: Generate Code

1. Add the **OpenCode** node to your workflow
2. Select **Operation**: Generate Code
4. Choose your **Model**: e.g., GPT-4
5. Enter your **Prompt**: "Write a Python function to calculate factorial"
6. Configure **Temperature** and **Max Tokens** as needed
7. Execute the node

The node will return:
```json
{
  "operation": "generateCode",
  "model": "gpt-4",
  "prompt": "Write a Python function to calculate factorial",
  "response": "def factorial(n):\n    if n == 0 or n == 1:\n        return 1\n    return n * factorial(n - 1)",
  "usage": {
    "prompt_tokens": 12,
    "completion_tokens": 45,
    "total_tokens": 57
  }
}
```

### Example: Complete Code

1. Select **Operation**: Complete Code
2. Enter your incomplete **Code**:
```python
def fibonacci(n):
    # Complete this function
```
3. Add **Instructions**: "Complete the function and add error handling"
4. Execute

### Example: Analyze Code

1. Select **Operation**: Analyze Code
2. Paste your **Code** to analyze
3. Add **Instructions** (optional): "Check for security issues"
4. Execute

## Operations

### Generate Code
Generates new code based on a text prompt.

**Parameters:**
- **Prompt** (required): Description of what code to generate
- **Model**: AI model to use
- **Temperature**: Control randomness (0-2)
- **Max Tokens**: Maximum response length

### Complete Code
Completes existing code snippets.

**Parameters:**
- **Code** (required): The code to complete
- **Instructions** (optional): Specific completion instructions
- **Model**: AI model to use

### Analyze Code
Analyzes and reviews code.

**Parameters:**
- **Code** (required): The code to analyze
- **Instructions** (optional): What to focus on in the analysis
- **Model**: AI model to use

### Chat
Have a conversation with AI about programming.

**Parameters:**
- **Prompt** (required): Your message
- **Model**: AI model to use

## Advanced Options

All operations support these additional options:

- **Top P**: Nucleus sampling parameter (0-1)
- **Frequency Penalty**: Reduce repetition (0-2)
- **Presence Penalty**: Encourage new topics (0-2)

## Supported AI Models

### Standard Models
- **GPT-4**: Most capable OpenAI model
- **GPT-3.5 Turbo**: Faster, cost-effective option
- **Claude 3.5 Sonnet**: Latest Claude model with strong coding abilities
- **Claude 3 Opus**: Most capable Claude model
- **Gemini Pro**: Google's flagship model

### Antigravity Premium Models
> **Powered by `opencode-antigravity-auth@latest` plugin** (automatically included)

- **Claude Opus 4.5**: Latest most capable Claude model via Antigravity
- **Claude Sonnet 4.5**: Enhanced Claude Sonnet via Antigravity
- **Gemini 3 Pro**: Next-generation Gemini Pro model
- **Gemini 3 Flash**: Ultra-fast Gemini model for quick responses

> **Note:** Antigravity models provide extended thinking capabilities, multi-account load balancing, and access to premium AI models with higher rate limits.

## Development

### Building from Source

```bash
# Clone the repository
git clone https://github.com/lai.tran/n8n-nodes-opencode.git
cd n8n-nodes-opencode

# Install dependencies
npm install

# Build the node
npm run build

# Run linter
npm run lint

# Run in development mode with n8n
npm run dev
```

### Testing Locally

```bash
npm run dev
```

This will start n8n with your custom node loaded. Access n8n at `http://localhost:5678`.

## Compatibility

- n8n version: 1.0.0 or higher
- n8n-workflow: Any version

## Resources

- [n8n Community Nodes Documentation](https://docs.n8n.io/integrations/community-nodes/)
- [OpenCode Documentation](https://opencode.ai/docs)

## License

MIT

## Author

**lai.tran**
- Email: lai.tran@executionlab.asia

## Support

For issues and questions:
- Open an issue on [GitHub](https://github.com/lai.tran/n8n-nodes-opencode/issues)
- Join the [n8n Community](https://community.n8n.io)

## Changelog

### 0.2.0
- **Hard-coded Antigravity Auth**: Integrated `opencode-antigravity-auth@latest` plugin as default
- **4 New Premium Models**: Added Claude Opus 4.5, Claude Sonnet 4.5, Gemini 3 Pro, Gemini 3 Flash
- **Enhanced Model Access**: Automatic access to extended thinking models and multi-account load balancing

### 0.1.0 (Initial Release)
- OpenCode AI integration with Antigravity auth
- Four core operations: Generate, Complete, Analyze, Chat
- Support for multiple AI models
- Comprehensive parameter configuration
