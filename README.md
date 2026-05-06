# AI Local Git Flow

CLI tools for AI-assisted Git workflows in Git Bash.

## Commands

The intended setup is through aliases in `~/.bashrc`:

```bash
alias ai-commit='node /d/Projects/RocheBB/Tools/ai-local-git-flow/bin/ai-commit.js'
alias ai-release='node /d/Projects/RocheBB/Tools/ai-local-git-flow/bin/ai-release.js'
```

Reload Git Bash after editing `~/.bashrc`, or run:

```bash
source ~/.bashrc
```

You can also run the tools from this repository:

```bash
npm run ai-commit --
npm run ai-release --
```

## Install

```bash
npm install
```

## Configuration

Configuration is loaded from `config.json`.

For OpenAI cloud usage, create `.env` next to the scripts:

```env
OPENAI_API_KEY=sk-your-key
```

Optional JIRA enrichment for ticket-aware commit and release generation:

```env
JIRA_BASE_URL=https://your-company.atlassian.net
JIRA_EMAIL=your.email@company.com
JIRA_API_TOKEN=your-token
```

Use `config.json` to switch providers:

```json
{
  "provider": "cloud"
}
```

or:

```json
{
  "provider": "local",
  "local": {
    "default": "qwen2.5-coder:14b",
    "baseURL": "http://localhost:11434/v1"
  }
}
```

## ai-commit

Generates branch-name variants, commit-message variants, GitHub labels, commits staged changes, pushes the branch, and creates a PR.

Stage files first:

```bash
git add <files>
```

Run the workflow:

```bash
ai-commit
```

Common options:

```bash
ai-commit -m "new feature, add customer request endpoint"
ai-commit -t SFSC-1573 -m "new feature, implement SSO authentication"
ai-commit -l "bug,enhancement" -m "hotfix, critical security patch"
ai-commit -m "update RAML customer request type" -n bug
```

Options:

- `-t, --ticket <number>`: ticket or issue number, for example `SFSC-1573`
- `-m, --message <text>`: context for branch naming and commit message generation
- `-l, --labels <labels>`: comma-separated GitHub labels
- `-n, --exclude-label <label>`: exclude a label from suggestions and PR creation
- `--exclude-labels <label>`: alias of `--exclude-label`
- `-bug`, `-documentation`, `-enhancement`: shorthand exclusion flags
- `-d, --debug`: print LLM request details
- `--debug-context`: print context windows used for generation

When `-m, --message` is provided, that developer context is treated as the highest-priority intent. JIRA and diff context are skipped for generation so naming and commit wording stay aligned with the supplied message.

When a JIRA ticket is provided, the ticket type is used to correct GitHub labels: Task/Tache maps to `enhancement`, and Bug maps to `bug`. Explicit `-l, --labels` values still take priority.

## ai-release

Generates release PR title and notes by comparing the development branch with the production branch.

```bash
ai-release
ai-release -v v1.1.23
ai-release -l "release,enhancement"
```

The script auto-detects:

- production branch: `main` or `master`
- development branch: `develop` or `dev`

It fetches remotes, summarizes changes, then can create the release PR through GitHub CLI.

## Requirements

- Node.js 18+
- Git
- GitHub CLI (`gh`) authenticated for PR creation
- OpenAI API key or local Ollama-compatible endpoint

## Runtime

- Node.js ES modules
- OpenAI SDK
- `dotenv`
- Git CLI
- GitHub CLI (`gh`)
- Optional JIRA REST enrichment through `.env`

## Project Files

- `bin/ai-commit.js`: commit workflow CLI
- `bin/ai-release.js`: release PR workflow CLI
- `src/ai-common.js`: shared config, OpenAI/Ollama client, token usage, console formatting
- `config.json`: provider/model/pricing configuration
- `prompts/branch-naming.md`: branch naming rules used in prompts
- `prompts/commit-message.md`: commit message rules used in prompts
