# Commit Message Contract

Generate one Git commit message that follows this contract exactly.

## Format

With ticket:

```text
[TICKET] <type>(<scope>): <summary>
```

Without ticket:

```text
<type>(<scope>): <summary>
```

Never use `[TICKET]` as a placeholder. If no ticket is provided, omit the bracketed ticket prefix entirely.

If no clear scope exists, omit it:

```text
fix: handle null API response
```

Examples:

```text
[SFSC-1591] fix(cart): correct discount rounding
feat(checkout): add coupon validation
refactor(price-service): simplify discount logic
```

## Rules

- Allowed types: `feat`, `fix`, `refactor`, `chore`, `docs`, `test`, `perf`, `hotfix`.
- Scope is optional and must be lowercase kebab-case when present.
- Summary must be imperative, specific, and under 72 characters.
- Use one main idea only.
- Do not add a trailing period.
- Describe the highest-impact change.
- Prefer developer-provided intent over noisy diff details.
- Ignore secondary refactors, formatting, and small version bumps when a more important change exists.
- Do not use vague wording: `stuff`, `things`, `various`, `multiple`, `update everything`, `fix everything`, `misc`.

## Type Heuristics

- `fix`: bug fix, prevention, null handling, error handling.
- `feat`: new behavior, endpoint, integration, capability.
- `refactor`: restructure without behavior change.
- `chore`: dependency, config, tooling, maintenance only.
- `docs`: documentation only.
- `test`: tests only.
- `perf`: performance improvement.
- `hotfix`: urgent production fix.

## Optional Body

Add a body only when it clarifies important context.

- Explain why the change was made.
- Summarize what changed at a high level.
- Mention impact when relevant.
- Keep body lines at 100 characters or less.

For breaking changes, end the body with:

```text
BREAKING CHANGE: <description>
```

## Output

Return only the commit message. No markdown, explanation, list, or surrounding text.
