# Repository Guidelines

## Project Structure & Module Organization

This repository contains Node.js ES module CLI tools for AI-assisted Git workflows.

- `ai-commit.js`: commit workflow CLI; generates branch names, commit messages, labels, commits staged files, pushes, and can create a PR.
- `ai-release.js`: release workflow CLI; compares development and production branches and prepares release PR content.
- `ai-common.js`: shared configuration, environment loading, AI client setup, token accounting, and console helpers.
- `config.json`: provider, model, and pricing configuration.
- `.env.example`: required environment variable template; keep real secrets in `.env`.
- `BRANCH_NAMING_GUIDE.md` and `COMMIT_MESSAGE_GUIDE.md`: source-of-truth prompt contracts.

There is currently no `src/`, frontend, Docker runtime, or dedicated test directory.

## Build, Test, and Development Commands

Install dependencies:

```bash
npm install
```

Run the commit workflow from the repo:

```bash
npm run ai-commit -- -t SFSC-1573 -m "implement SSO authentication"
```

Run the release workflow:

```bash
npm run ai-release --
```

For daily Git Bash usage, define the aliases documented in `README.md`.

## Coding Style & Naming Conventions

Use modern JavaScript ES modules; `package.json` sets `"type": "module"`. Keep code in top-level CLI files unless shared behavior belongs in `ai-common.js`. Prefer explicit function and variable names. Match the existing two-space indentation style. There is no configured formatter or linter, so preserve surrounding style.

## Testing Guidelines

No automated test suite is currently configured. Validate changes by running the relevant CLI with safe inputs and, where useful, `--debug` to inspect prompts and model requests. For workflow changes, test both direct npm execution and the Git Bash alias path. If adding tests later, prefer `test/` and wire it through `npm test`.

## Commit & Pull Request Guidelines

Follow the repository contracts in `BRANCH_NAMING_GUIDE.md` and `COMMIT_MESSAGE_GUIDE.md`.

- Branches: `<type>/<TICKET>-<verb>-<target>`, for example `feat/SFSC-2041-add-loyalty-banner`.
- Commit messages: `[TICKET] type(scope): short summary` when a ticket exists, otherwise `type(scope): short summary`.
- Allowed types: `feat`, `fix`, `refactor`, `chore`, `docs`, `test`, `perf`, `hotfix`.
- Keep summaries imperative, specific, and under 72 characters.

PRs should target `develop` unless release flow or project context says otherwise. Include a clear description, linked ticket when available, allowed labels, and manual validation notes.

## Security & Configuration Tips

Never commit `.env` or API tokens. Use `.env.example` for documentation only. Required integrations are Git, authenticated GitHub CLI, and either an OpenAI API key or a local Ollama-compatible endpoint.
