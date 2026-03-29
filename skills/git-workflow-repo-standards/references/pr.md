# PR Rules

Use these rules when generating or reviewing pull requests for this repo's workflow.

## Title

- PR title should match the selected commit message.
- Do not invent a separate marketing-style title for normal feature or fix PRs.

## Body

Default body format:

```markdown
## Commits Included
- commit message one
- commit message two
```

Build the bullets from commit messages, not from a rewritten prose summary.

If there are no commits available, use:

```markdown
## Commits Included
- No commit messages found
```

## Base Branch

- Default to `develop` for normal workflow PRs unless the user or repo context says otherwise.

## Labels

Allowed labels:

- `bug`
- `documentation`
- `enhancement`
- `duplicate`
- `help wanted`
- `good first issue`
- `question`
- `wontfix`

Choose labels that match the actual change. Normalize synonyms to the allowed set.

## Repo Automation Notes

When mirroring the repo's scripted workflow:

- Rename the current branch first.
- Commit with the selected message.
- Push the branch to `origin`.
- Create the PR against `develop`.
- Use the commit message as the PR title.

The existing scripts also assign the PR to `brahimbousnguar`. Treat that as repo-specific automation, not a universal convention.
