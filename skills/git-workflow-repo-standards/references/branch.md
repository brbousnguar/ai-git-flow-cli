# Branch Naming Rules

Use these rules for this repo's branch names.

## Format

With ticket:

```text
<type>/<TICKET>-<verb>-<target>
```

Without ticket:

```text
<type>/<short-kebab-description>
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

## Allowed Verbs

- `add`
- `fix`
- `remove`
- `update`
- `rename`
- `refactor`
- `simplify`
- `migrate`
- `optimize`
- `enable`
- `disable`

## Construction Rules

- Keep the ticket exactly as provided.
- Everything after `/` must be lowercase kebab-case.
- Use short concrete nouns for the target.
- Prefer 3 explicit words after the ticket.
- Allow 4 words only when clarity requires it.
- Avoid filler words such as `and`, `or`, `to`, `for`, `with`, `by`, `of`, `in`, `on`, `at`, `from`, `via`.
- Only describe one main idea.

## Forbidden Wording

Do not use:

- `various`
- `multiple`
- `stuff`
- `things`
- `changes`
- `update-everything`
- `refactor-and-update`

## Type Heuristics

- Bug fix behavior -> `fix`
- New behavior or endpoint -> `feat`
- Restructure without behavior change -> `refactor`
- Dependencies, config, tooling -> `chore`
- Urgent production issue -> `hotfix`

## Examples

- `fix/SFSC-1591-fix-discount-rule`
- `feat/SFSC-2041-add-cart-validation`
- `refactor/SFSC-330-clean-price-service`
- `chore/SFSC-88-update-node-version`
