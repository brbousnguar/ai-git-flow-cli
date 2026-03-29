# Commit Message Rules

Use these rules for this repo's commit messages.

## Format

Default:

```text
type(scope): short summary
```

Repo-specific ticketed format:

```text
[TICKET] type(scope): short summary
```

If the scope is unclear:

```text
type: short summary
```

## Allowed Types

- `feat`
- `fix`
- `refactor`
- `chore`
- `docs`
- `test`
- `perf`
- `hotfix`

## Scope Rules

- Scope should represent the main module or business area.
- Use lowercase kebab-case.
- Omit the scope when it would be vague or misleading.

## Summary Rules

- Use imperative mood.
- Keep it under 72 characters.
- No trailing period.
- Keep one main idea only.
- Prefer specific nouns from ticket or developer context.

## Optional Body

Add a body only when clarification matters.

Cover:

- Why the change was needed
- What changed at a high level
- Any impact or breaking change

If breaking, end with:

```text
BREAKING CHANGE: ...
```

## Forbidden Wording

Do not use vague summaries like:

- `fixed bug`
- `updating various things`
- `made improvements`
- `misc`
- `fix everything`

## Type Heuristics

- Bug fix -> `fix`
- New behavior -> `feat`
- Internal restructure -> `refactor`
- Config or dependency work -> `chore`
- Performance improvement -> `perf`

## Examples

- `[SFSC-1573] refactor(api): update customer mapping`
- `fix(cart): correct rounding error`
- `feat(checkout): add coupon validation`
- `docs(api): update order endpoint documentation`
