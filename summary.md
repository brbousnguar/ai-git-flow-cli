# Project Summary

## What It Does

AI-assisted Git Bash workflow tools for commit/PR creation and release PR notes.

## Entry Points

- `ai-commit -t TICKET-123 -m "context"`: commit workflow
- `ai-release`: release PR workflow
- `npm run ai-commit --`: repo-local fallback
- `npm run ai-release --`: repo-local fallback

## Runtime

- Node.js ES modules
- OpenAI SDK
- `dotenv`
- Git CLI
- GitHub CLI (`gh`)
- Optional JIRA REST enrichment through `.env`

## Structure

```text
ai-commit.js             Commit workflow CLI
ai-release.js            Release PR workflow CLI
ai-common.js             Shared config, AI client, console utilities
config.json              Provider/model/pricing configuration
BRANCH_NAMING_GUIDE.md   Branch naming prompt rules
COMMIT_MESSAGE_GUIDE.md  Commit message prompt rules
skills/                  Local workflow reference skill
```
