Scan the current working directory and generate a concise project summary saved as `summary.md` in the current directory.

## Instructions

1. Explore the project structure: read `package.json`, `README.md`, `CLAUDE.md`, and any other top-level config files that exist.
2. Identify the project's purpose, tech stack, key entry points, and main workflows.
3. Write a `summary.md` file (overwrite if it exists) with this structure:

```
# Project Summary

## What it does
[1-3 sentences describing the project's purpose]

## Tech stack
[Bullet list: language, frameworks, key dependencies]

## Entry points
[Bullet list: main files/commands to run the project]

## Key workflows
[Bullet list: the main things this project can do]

## Structure
[Short description of the top-level folder/file layout — only what's non-obvious]
```

Keep the summary concise (under 60 lines). Do not include generic advice or obvious information.
