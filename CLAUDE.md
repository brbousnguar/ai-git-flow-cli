# CLAUDE.md

This repository contains two Git Bash CLI tools:

```bash
ai-commit -t TICKET-123 -m "context"
ai-release
```

The aliases are expected to be defined in `~/.bashrc`:

```bash
alias ai-commit='node /d/Projects/RocheBB/Tools/ai-local-git-flow/ai-commit.js'
alias ai-release='node /d/Projects/RocheBB/Tools/ai-local-git-flow/ai-release.js'
```

## Commands

```bash
npm install
npm run ai-commit -- -t TICKET-123 -m "context"
npm run ai-release --
```

No frontend, Docker app, TypeScript build, or test suite is part of this trimmed repo.

## Architecture

```text
ai-commit.js
ai-release.js
      |
      v
ai-common.js
      |
      v
config.json + .env + OpenAI/Ollama + Git CLI + GitHub CLI + optional JIRA REST
```

## Key Files

| File | Purpose |
|------|---------|
| `ai-commit.js` | Generates branch names, commit messages, labels, then commits/pushes/creates PR |
| `ai-release.js` | Generates release PR title/body from branch diff |
| `ai-common.js` | Shared config/env loading, AI client, text generation, token usage |
| `config.json` | AI provider, model, and pricing configuration |
| `BRANCH_NAMING_GUIDE.md` | Prompt reference for branch names |
| `COMMIT_MESSAGE_GUIDE.md` | Prompt reference for commit messages |

## Notes

- ES modules are used throughout.
- `.env` is loaded from the repository root.
- API key errors should refer to `.env`, not `config.json`.
- Git workflow conventions live in `skills/git-workflow-repo-standards/references/`.
