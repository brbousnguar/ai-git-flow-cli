# Branch Naming Contract

Generate one Git branch name that follows this contract exactly.

## Format

With ticket:

```text
<type>/<TICKET>-<verb>-<target>
```

Without ticket:

```text
<type>/<verb>-<target>
```

Examples:

```text
fix/SFSC-1591-fix-discount-rule
feat/SFSC-2041-add-loyalty-banner
refactor/SFSC-332-refactor-cart-service
```

## Rules

- Allowed types: `feat`, `fix`, `refactor`, `chore`, `docs`, `test`, `perf`, `hotfix`.
- Allowed verbs: `add`, `fix`, `remove`, `update`, `rename`, `refactor`, `simplify`, `migrate`, `optimize`, `enable`, `disable`.
- Preserve the ticket exactly as provided, including case.
- Use lowercase kebab-case after the slash.
- Prefer 3 explicit words after the ticket; use 4 only when needed for clarity.
- Describe one highest-impact change.
- Prefer developer-provided intent over noisy diff details.
- Ignore secondary refactors, formatting, and small version bumps when a more important change exists.
- Do not use vague or filler words: `and`, `or`, `various`, `multiple`, `stuff`, `things`, `changes`, `update-everything`, `refactor-and-update`.

## Type Heuristics

- `fix`: bug fix, prevention, null handling, error handling.
- `feat`: new behavior, endpoint, integration, capability.
- `refactor`: restructure without behavior change.
- `chore`: dependency, config, tooling, maintenance only.
- `docs`: documentation only.
- `test`: tests only.
- `perf`: performance improvement.
- `hotfix`: urgent production fix.

## Output

Return only the branch name. No markdown, explanation, list, or surrounding text.
