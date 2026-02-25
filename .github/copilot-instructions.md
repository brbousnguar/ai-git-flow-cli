# GitHub Copilot Instructions for .gpt-tools

## Project Overview
This project contains AI-powered Git automation tools that use either local Ollama models or cloud-based OpenAI models to generate commit messages, release notes, and analyze Mule logs.

## Security & Configuration Practices

### API Key Management
**CRITICAL:** API keys are NEVER stored in `config.json` or committed to version control.

- **API keys are stored in `.env` file** (in `.gitignore`)
- Each developer has their own `.env` file with their own API key
- Use `.env.example` as a template for new developers
- The `.env` file must keep API keys on a single line (no line breaks)

### Environment Variable Loading
All scripts use the following pattern to load environment variables:

```javascript
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from script directory with override
dotenv.config({ path: path.join(__dirname, ".env"), override: true });
```

**Important:** 
- Always use `override: true` to ensure `.env` values take precedence over system environment variables
- Always use `path.join(__dirname, ".env")` to load from script directory, not CWD
- This allows scripts to be run from any directory

### Configuration Structure
The `config.json` file contains:
- Provider selection (`local` or `cloud`)
- Model configurations
- Local Ollama settings (baseURL, available models)
- Cloud settings (model name only, NO API keys)
- Application-specific settings (e.g., muleLogs)

Example:
```json
{
  "provider": "cloud",
  "local": {
    "default": "qwen2.5-coder:7b",
    "models": { ... },
    "baseURL": "http://localhost:11434/v1"
  },
  "cloud": {
    "model": "gpt-4o-mini"
    // NO apiKey here - it's in .env
  }
}
```

## Code Patterns

### OpenAI Client Initialization
When initializing the OpenAI client for cloud provider:

```javascript
if (provider === "cloud") {
  if (!process.env.OPENAI_API_KEY) {
    console.error("❌ OpenAI API key not set in .env file");
    console.error("   Add OPENAI_API_KEY to your .env file");
    process.exit(1);
  }
  client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,  // Always from process.env
  });
  modelName = modelOverride || config.cloud.model;
}
```

### Error Messages
- Reference `.env` file for API key errors, never `config.json`
- Provide clear instructions: "Add OPENAI_API_KEY to your .env file"

## File Structure

```
.gpt-tools/
├── .env                    # Local, not committed (API keys)
├── .env.example           # Template, committed
├── config.json            # Provider & model config (NO secrets)
├── ai-commit.js          # Commit message generation
├── ai-release.js         # Release notes generation
├── ai-mule-logs.js       # Mule log analysis
├── package.json          # Dependencies (includes dotenv)
└── .github/
    └── copilot-instructions.md  # This file
```

## When Adding New Features

### Adding New Scripts
1. Import and configure dotenv at the top (use the pattern above)
2. Load from script directory with `override: true`
3. Check for `process.env.OPENAI_API_KEY` when using cloud provider
4. Never read API keys from config.json

### Adding New Environment Variables
1. Add to `.env` file
2. Add to `.env.example` with placeholder value
3. Document in README.md
4. Add validation checks in relevant scripts

### Updating Configuration
1. Non-sensitive config goes in `config.json`
2. Secrets/API keys go in `.env`
3. Update both examples and README when adding new options

## Common Pitfalls to Avoid

❌ **DON'T:**
- Store API keys in `config.json`
- Use `dotenv.config()` without specifying the path
- Forget `override: true` option
- Allow multi-line API keys in `.env`
- Commit `.env` file
- Reference `config.cloud.apiKey` (it doesn't exist anymore)

✅ **DO:**
- Store API keys in `.env`
- Use `dotenv.config({ path: path.join(__dirname, ".env"), override: true })`
- Keep API keys on single lines
- Use `.env.example` for documentation
- Reference `process.env.OPENAI_API_KEY`
- Validate environment variables before use

## Testing Environment Setup

To verify `.env` is loaded correctly:
```bash
node -e "import dotenv from 'dotenv'; const result = dotenv.config({ path: './.env', override: true }); console.log('Parsed:', Object.keys(result.parsed || {}).length, 'vars');"
```

Expected output: `Parsed: 1 vars` (or more if additional vars added)

## Dependencies

- `dotenv@^17.2.3` - Environment variable management
- `openai@^6.17.0` - OpenAI API client (works with Ollama too)

## Module System
This project uses **ES Modules** (`"type": "module"` in package.json):
- Use `import` not `require`
- File extensions in imports are optional
- Use `fileURLToPath` and `import.meta.url` for `__dirname`
