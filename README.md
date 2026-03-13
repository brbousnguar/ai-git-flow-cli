# AI Git Tools

AI-powered scripts for generating commit messages and release notes using local Ollama models.

## Prerequisites

1. **For Local Models (Ollama):**
   - Install [Ollama](https://ollama.ai)
   - Pull a model: `ollama pull mistral-nemo:12b`

2. **For Cloud Models (OpenAI):**
   - Get an API key from [OpenAI](https://platform.openai.com/api-keys)
   - Create a `.env` file from the template:
     ```bash
     cp .env.example .env
     ```
   - Add your API key to `.env` (see Configuration section below)

## Configuration

### API Key Setup (for Cloud/OpenAI)

**IMPORTANT:** API keys are stored in `.env` (not committed to git) for security.

1. **Create your .env file:**
   ```bash
   cp .env.example .env
   ```

2. **Add your OpenAI API key to `.env`:**
   ```env
   OPENAI_API_KEY=sk-your-actual-api-key-here
   ```

3. **Security notes:**
   - `.env` is in `.gitignore` and won't be committed
   - Never commit API keys in code or config files
   - Each team member needs their own `.env` with their own key
   - Keep the API key on a single line (no line breaks)

### Provider Configuration

Edit `config.json` to configure your AI provider:

**Local (Ollama) - Default:**
```json
{
  "provider": "local",
  "local": {
    "default": "qwen2.5-coder:7b",
    "models": {
      "qwen2.5-coder:7b": "Fast, excellent for code",
      "mistral-nemo:12b": "Slower, more capable"
    },
    "baseURL": "http://localhost:11434/v1"
  },
  "cloud": {
    "model": "gpt-4o-mini"
  }
}
```

**Use specific local model:**
```json
{
  "provider": "local:mistral-nemo:12b",
  ...
}
```

**Cloud (OpenAI):**
```json
{
  "provider": "cloud",
  "local": {
    "model": "mistral-nemo:12b",
    "baseURL": "http://localhost:11434/v1"
  },
  "cloud": {
    "model": "gpt-4o-mini"
  },
  "muleLogs": {
    "defaultPath": "D:\\IDE\\AnypointStudio\\plugins\\org.mule.tooling.server.4.10.ee_7.22.0.202511192101\\mule\\logs",
    "defaultLines": 200
  }
}
```

**Note:** API key is now stored in `.env`, not in `config.json`.

**Available models:**

*Local (Ollama):*
- `mistral-nemo:12b` - Balanced (European/Mistral AI)
- `mistral:7b` - Faster
- `codestral:22b` - Best for code
- `qwen2.5-coder:7b` - Fast code analysis

*Cloud (OpenAI):*
- `gpt-4o-mini` - Fast and affordable
- `gpt-4o` - Most capable
- `gpt-4-turbo` - Balanced

## Scripts

### 1. ai-commit.js - Commit Messages & Branch Names

Generates commit messages and branch names from staged changes, then runs one workflow: rename branch, commit, push, and create PR.

**Usage:**
```bash
# Stage your changes
git add <files>

# Full workflow (branch + commit + PR)
node .gpt-tools/ai-commit.js

# Provide context for better branch naming and commit messages
node .gpt-tools/ai-commit.js -m "new feature, add customer request endpoint"
node .gpt-tools/ai-commit.js -m "bugfix, fix timeout in payment processing"
node .gpt-tools/ai-commit.js -m "refactor authentication module for better security"

# With ticket number and context
node .gpt-tools/ai-commit.js -t SFSC-1573 -m "new feature, implement SSO authentication"
node .gpt-tools/ai-commit.js -t JIRA-456 -m "bugfix, resolve memory leak in cache"

# With custom labels
node .gpt-tools/ai-commit.js -l "bug,enhancement" -m "hotfix, critical security patch"

# Exclude labels (negative prompt)
node .gpt-tools/ai-commit.js -m "update RAML customer request type" -n bug
node .gpt-tools/ai-commit.js -m "update RAML customer request type" --exclude-label bug
node .gpt-tools/ai-commit.js -m "update RAML customer request type" -n -bug
```

**Command-Line Options:**
- `-t, --ticket <number>` - Ticket/issue number (e.g., SFSC-1573, JIRA-123)
- `-m, --message <text>` - Context to guide branch naming and commit message generation
  - Examples: "new feature, add customer endpoint", "bugfix, fix login timeout", "refactor authentication"
- `-l, --labels <labels>` - Custom GitHub labels (comma-separated)
- `-n, --exclude-label <label>` - Exclude a label from AI suggestions and PR creation
- `--exclude-labels <label>` - Alias of `--exclude-label`
- `-bug`, `-documentation`, `-enhancement`, etc. - Shorthand exclusion flags

**JIRA ticket enrichment (optional):**
- When `-t/--ticket` is provided, the script can call JIRA API to fetch ticket requirements and recent done-work (comments/worklogs).
- Add these variables to `.env`: `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN`.

**Supported labels:**
- `bug`
- `documentation`
- `enhancement`
- `duplicate`
- `help wanted`
- `good first issue`
- `question`
- `wontfix`

**Tips for Using Context (-m flag):**
- Start with the type: "new feature", "bugfix", "refactor", "hotfix"
- Add a brief description of what you're doing
- Example formats:
  - `"new feature, add customer request endpoint"`
  - `"bugfix, resolve timeout in payment processing"`
  - `"refactor authentication for better security"`
  - `"hotfix, critical database connection issue"`

**Workflow:**
- Always runs full workflow: rename branch, commit, push, and create PR

**Console output note:**
- Uses ASCII/professional prefixes (`INFO:`, `OK:`, `WARN:`, `ERROR:`) for Git Bash compatibility.

**Output:**
```
Workflow: Rename branch + Commit + Create PR

🌿 Branch Name Variants: (generated in 2.34s)

1. refactor/sfsc-1573-update-customer-mapping
2. refactor/sfsc-1573-restructure-customer-data
3. chore/sfsc-1573-update-mapping-logic
4. refactor/sfsc-1573-improve-mapping-structure

Select branch name (Enter=1, 2-4, or 'n' for new): 1

✅ Selected: refactor/sfsc-1573-update-customer-mapping

🌿 Renaming branch...
✅ Branch renamed successfully!

📝 Commit Message & Label Variants: (generated in 2.15s)

1. [SFSC-1573] refactor(api): update customer mapping
   Labels: enhancement

2. [SFSC-1573] refactor(mapping): restructure customer data
   Labels: enhancement

3. [SFSC-1573] chore(api): update mapping logic
   Labels: enhancement

4. [SFSC-1573] refactor: improve customer mapping structure
   Labels: enhancement

Select commit message (Enter=1, 2-4, or 'n' for new): 1

✅ Selected: [SFSC-1573] refactor(api): update customer mapping
🏷️  Labels: enhancement

📤 Committing changes...
✅ Committed successfully!

📤 Pushing branch to remote...
✅ Pushed successfully!

🔀 Creating Pull Request...
✅ Pull Request created successfully!

⏱️  Total time: 12.45s
```

### 2. ai-release.js - Pull Request Notes

Generates PR title and release notes comparing `develop` → `main`.

**Usage:**
```bash
# Without version
node .gpt-tools/ai-release.js

# With version tag
node .gpt-tools/ai-release.js -v v1.1.23
```

**Output:**
```
📦 Pull Request: develop → main

PR Title: Release v1.1.23

Release Notes:
## Refactoring
- Update API dependency to latest version
```

### 3. ai-mule-logs.js - Mule Log Analyzer

Analyzes Mule ESB/Anypoint Platform logs to identify errors and their root causes.

**Usage:**
```bash
# Analyze runtime logs (default)
node .gpt-tools/ai-mule-logs.js

# Analyze build logs
node .gpt-tools/ai-mule-logs.js --type build

# Analyze specific number of lines
node .gpt-tools/ai-mule-logs.js --lines 500

# Analyze specific log file
node .gpt-tools/ai-mule-logs.js --file mule-app.log

# Use custom log path
node .gpt-tools/ai-mule-logs.js --path "C:\Custom\Path\logs"

# Combine options
node .gpt-tools/ai-mule-logs.js --type runtime --lines 300 --file mule-app.log

# Show help
node .gpt-tools/ai-mule-logs.js --help
```

**Options:**
- `-t, --type`: Log type (`runtime` or `build`) - Default: `runtime`
- `-l, --lines`: Number of lines to analyze - Default: `200`
- `-p, --path`: Custom log directory path
- `-f, --file`: Specific log file to analyze
- `-h, --help`: Show help message

**Log Types:**
- **runtime**: Mule Runtime Engine logs (mule-app.log)
  - Exception stack traces
  - Flow execution errors
  - Component failures
  - Connection issues
  - Data transformation errors
  
- **build**: Mule Build/Deployment logs
  - Deployment failures
  - Application startup errors
  - Configuration issues
  - Dependency problems

**Output Example:**
```
🔍 Mule Log Analyzer
========================
📂 Log directory: D:\IDE\AnypointStudio\plugins\...\mule\logs
📝 Log type: runtime
📊 Lines to analyze: 200
📄 Analyzing: mule-app.log
🕒 Last modified: 2/6/2026, 10:30:45 AM

================================================================================
📊 ANALYSIS RESULTS
================================================================================

## 🔴 Primary Error
NullPointerException in customer data transformation flow

## 📍 Error Origin
Flow: process-customer-order
Component: Transform Message (line 45)
File: customer-mapping.dwl

## 🔍 Root Cause Analysis
The transformation is attempting to access a nested property (customer.address.zipCode)
but the address object is null for certain customers...

## ✅ Recommended Actions
1. Add null-safe navigation in DataWeave script
2. Implement validation before transformation
3. Add logging to identify which customers lack address data
...

⏱️  Analysis completed in: 8.23s
================================================================================
```

**Configuration:**

Set your default Mule logs path in `config.json`:
```json
{
  "muleLogs": {
    "defaultPath": "D:\\IDE\\AnypointStudio\\plugins\\org.mule.tooling.server.4.10.ee_7.22.0.202511192101\\mule\\logs",
    "defaultLines": 200
  }
}
```

### 4. ai-jira-deploy-message.js - JIRA Deployment Reply

Creates a short French reply message for the reporter, injects the latest git tag, and posts it to a JIRA ticket after approval.

**Usage:**
```bash
# With ticket and reporter
node .gpt-tools/ai-jira-deploy-message.js -t SFSC-1638 -r "Guilhem"

# Same command but publish to JIRA (comment + Mulesoft Version update)
node .gpt-tools/ai-jira-deploy-message.js -t SFSC-1638 -r "Guilhem" --post

# With ticket only (reporter auto-loaded from JIRA issue)
node .gpt-tools/ai-jira-deploy-message.js -t SFSC-1638

# List recent comments on a ticket
node .gpt-tools/ai-jira-deploy-message.js -t SFSC-1638 --list-comments

# Delete a comment by id
node .gpt-tools/ai-jira-deploy-message.js -t SFSC-1638 --delete --comment-id 123456

# Delete all comments on a ticket (interactive: review each comment)
node .gpt-tools/ai-jira-deploy-message.js -t SFSC-1638 --delete-all
```

**Flow:**
- Reads latest git tag (`git tag --sort=-version:refname`)
- Suggests a message in terminal
- `Enter`: post to JIRA
- `n`: regenerate another variant
- `q`: cancel
- Default mode is preview only (no JIRA write)
- `--post` publishes the comment and updates issue field `Mulesoft Version` (if field exists)
- Delete mode: list comments, pick an id, and remove it from JIRA
- Delete-all mode: reviews comments one by one (`Enter` delete, `n` skip, `q` stop)

**Required .env variables:**
- `JIRA_BASE_URL`
- `JIRA_EMAIL`
- `JIRA_API_TOKEN`

## Gitflow Best Practices

**Branch Types:**
- `feature/` - New features
- `bugfix/` - Bug fixes
- `hotfix/` - Urgent production fixes
- `refactor/` - Code refactoring
- `chore/` - Maintenance tasks
- `docs/` - Documentation

**Commit Format:**
- `[TICKET] type(scope): description`
- Example: `[SFSC-1573] feat(auth): add SSO support`

## References

- [Conventional Commits Specification](https://www.conventionalcommits.org/en/v1.0.0/)

## Troubleshooting

**Error: Cannot connect to Ollama**
```bash
# Start Ollama
ollama serve

# Pull the model
ollama pull mistral-nemo:12b
```

**Error: No staged changes**
```bash
git add <files>
```

**Error: Branch not found**
```bash
git fetch origin
```
