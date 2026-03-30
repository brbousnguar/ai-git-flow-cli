# Project Summary

## What it does
AI-powered Git automation toolset for a Roche development environment. Generates commit messages, release notes, and JIRA deployment messages using AI, with both a web UI and CLI interface over shared business logic.

## Tech stack
- **Runtime:** Node.js (ES Modules), TypeScript
- **Web framework:** Next.js 15 (App Router, React 19)
- **AI:** OpenAI SDK — supports OpenAI cloud or local Ollama (`http://localhost:11434/v1`)
- **External integrations:** Git CLI, GitHub CLI (`gh`), JIRA REST API

## Entry points
- `npm run dev` — Next.js web app at `http://localhost:3000`
- `node ai-commit.js -t TICKET-123 -m "context"` — CLI commit workflow
- `node ai-release.js` — CLI release notes workflow
- `node ai-jira-deploy-message.js` — CLI JIRA deploy message workflow
- `node ai-mule-logs.js` — CLI MuleSoft log analysis
- `docker compose up --build -d` — containerized web app

## Key workflows
- **Commit**: stages diff, generates AI commit message variants, user picks one → `git commit`
- **Release**: summarizes commits since last tag → creates GitHub release via `gh`
- **JIRA deploy message**: generates deployment message and posts as JIRA comment
- **Repos**: scans `D:\Projects\RocheBB\Repos` and exposes repo list via API

## Structure
```
ai-*.js              CLI scripts (share logic via ai-common.js)
ai-common.js         Shared config, AI client, console utils for CLI
src/
  app/
    page.tsx         Single-page React UI (commit / release / jira-deploy tabs)
    api/
      commit/        Preview + execute commit workflow
      release/       Preview + execute release workflow
      jira-deploy/   Preview + execute JIRA deploy message
      repos/         List discovered repos
  lib/server/        Core business logic (TypeScript)
    config.ts        Config loading, repo discovery, env validation
    git.ts           All git/gh CLI calls
    openai.ts        AI client factory (Ollama or OpenAI)
    commit.ts        Commit orchestration
    release.ts       Release orchestration
    deploy-message.ts JIRA deploy message orchestration
    jira.ts          JIRA REST API client
config.json          AI provider switch (local/cloud) and model config
.env                 API keys and JIRA credentials
```
