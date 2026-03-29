---
name: git-workflow-repo-standards
description: Use when the user wants branch names, commit messages, PR titles, PR bodies, labels, or an end-to-end git workflow that follows the conventions implemented in the git-workflow-ai-assistant repo. Prefer the dedicated guide files and workflow code over stale README examples.
---

# Git Workflow Repo Standards

Use this skill when the user wants output that matches this repo's git workflow conventions.

## Source Of Truth

When you are inside this repo, prefer these sources in this order:

1. `BRANCH_NAMING_GUIDE.md`
2. `COMMIT_MESSAGE_GUIDE.md`
3. `ai-commit.js` and `src/lib/server/commit.ts`
4. `src/lib/server/git.ts` for PR title/body behavior
5. `README.md` only for usage examples, not for conflicting naming rules

If README examples conflict with the guides or implementation, follow the guides and implementation.

## Required Outputs

Default to returning a single best recommendation unless the user explicitly asks for variants.

If the user asks for a full workflow, return:

```text
Branch: ...
Commit: ...
PR Title: ...
PR Body:
## Commits Included
- ...
Labels: ...
```

## Priority Rules

Choose the highest-impact change.

- Prioritize JIRA ticket context first when available.
- Use the developer's stated intent second.
- Use the diff third to validate and refine scope.
- Ignore minor cleanup, formatting, and secondary refactors when a more important bug fix or feature is present.

## Branch Rules

Read [references/branch.md](references/branch.md) when generating or reviewing branch names.

Apply these repo-specific rules:

- Allowed types: `feat`, `fix`, `refactor`, `chore`, `docs`, `test`, `perf`, `hotfix`
- Canonical shape with ticket: `<type>/<TICKET>-<verb>-<target>`
- Shape without ticket: `<type>/<short-kebab-description>`
- Preserve ticket case exactly when the ticket is provided by the user.
- Use lowercase kebab-case for everything after the slash.
- Prefer 3 explicit words after the ticket.
- Allow 4 words only if clarity requires it.
- Do not use README-era aliases like `feature/` or `bugfix/`; normalize to `feat/` and `fix/`.

## Commit Rules

Read [references/commit.md](references/commit.md) when generating or reviewing commit messages.

Apply this repo-specific overlay:

- With ticket: `[TICKET] type(scope): short summary`
- Without ticket: `type(scope): short summary`
- Scope is preferred when clear, omitted when not clear.
- Summary must be imperative, specific, and under 72 characters.

## PR Rules

Read [references/pr.md](references/pr.md) when generating or reviewing PR content.

Apply these rules:

- PR title should match the selected commit message.
- Default base branch is `develop` unless the user or repo context says otherwise.
- PR body is a commit-log summary headed by `## Commits Included`.
- Labels must come from the allowed set only.

## Allowed Labels

Use zero, one, or two labels from:

- `bug`
- `documentation`
- `enhancement`
- `duplicate`
- `help wanted`
- `good first issue`
- `question`
- `wontfix`

Normalize common synonyms:

- `docs` -> `documentation`
- `feature` -> `enhancement`
- `defect` -> `bug`

## Operating Procedure

1. Check whether the user gave a ticket, developer intent, diff, staged changes, or commit log.
2. Infer the type from the highest-impact intent.
3. Generate branch, commit, labels, and PR content using the repo rules.
4. If the user asks for a review, treat the rules as validation criteria and point out concrete mismatches.
5. If you need repo confirmation, inspect the guide files and workflow code instead of guessing.
