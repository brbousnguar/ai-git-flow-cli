# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install        # Install dependencies
npm run dev        # Start Next.js dev server at http://localhost:3000
npm run build      # Production build
npm run start      # Serve production build
npm run lint       # Run ESLint

# Docker
docker compose up --build -d   # Run containerized
docker compose down            # Stop container

# CLI scripts (run directly, no build needed)
node ai-commit.js -t TICKET-123 -m "context"
node ai-release.js
node ai-mule-logs.js
node ai-jira-deploy-message.js
```

No test suite exists — workflows are validated through manual/interactive testing.

## Architecture

This is a hybrid AI Git automation system with two interfaces over the same logic:

```
CLI Scripts (ai-*.js)          Web App (Next.js 15)
       ↓                              ↓
  ai-common.js              src/app/api/*/route.ts
       ↓                              ↓
                   src/lib/server/
         config.ts · git.ts · openai.ts · commit.ts
         release.ts · jira.ts · deploy-message.ts
                              ↓
          Git CLI · GitHub CLI (gh) · OpenAI/Ollama · JIRA REST API
```

**Web app** (`src/app/page.tsx`) is a single React page that drives 3 workflows (commit, release, jira-deploy) via 4 API routes. All routes support a `?mode=preview` vs `?mode=execute` pattern — preview returns AI-generated content for user review, execute applies it.

**CLI scripts** duplicate the same workflows for terminal use, sharing utilities via `ai-common.js`.

**Repository discovery**: repos are scanned from `D:\Projects\RocheBB\Repos`. The `src/lib/server/config.ts` handles this along with all config/env loading.

## AI Provider Configuration (`config.json`)

Switch between local Ollama and OpenAI cloud by setting `"provider": "local"` or `"provider": "cloud"`. Local provider hits `http://localhost:11434/v1`. Model selection and defaults live in this file — no API keys here.

## Environment Variables (`.env`)

Required for cloud provider and JIRA features:
```
OPENAI_API_KEY=...
JIRA_BASE_URL=https://your-company.atlassian.net
JIRA_EMAIL=...
JIRA_API_TOKEN=...
```

## Critical Patterns

**Module system:** ES Modules throughout (`import`/`export`). Use `fileURLToPath(import.meta.url)` for `__dirname` equivalents.

**dotenv loading** — always load with explicit path and override:
```javascript
dotenv.config({ path: path.join(__dirname, ".env"), override: true });
```

**API key errors** must reference `.env`, never `config.json`.

**Path alias:** `@/*` maps to `./src/*` (configured in `tsconfig.json`). Use it for server lib imports in Next.js routes.

## Key Files

| File | Purpose |
|------|---------|
| `src/lib/server/config.ts` | Config loading, repo discovery, env validation |
| `src/lib/server/git.ts` | All `git`/`gh` CLI invocations |
| `src/lib/server/openai.ts` | AI client factory (works for both Ollama and OpenAI) |
| `src/lib/server/commit.ts` | Commit workflow orchestration (preview + execute) |
| `src/lib/server/types.ts` | Shared TypeScript interfaces |
| `ai-common.js` | Shared config, AI client, and console utilities for CLI scripts |

## Git Workflow Conventions

See `skills/git-workflow-repo-standards/references/` for authoritative branch naming, commit message, and PR rules enforced by the AI workflows in this repo.
