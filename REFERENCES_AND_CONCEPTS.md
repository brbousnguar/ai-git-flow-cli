# References and Conceptual Foundations

This document lists the main standards, methodologies, and theoretical concepts
that informed the branch naming and commit message rules used in this project.

These references provide the intellectual and practical foundation behind the AI
contracts.

---

## 1. Conventional Commits

Specification:
https://www.conventionalcommits.org/

Key Concepts:

- Standardized commit format:
  <type>(<scope>): <description>
- Enables automated changelogs
- Enables semantic versioning
- Improves readability and consistency

Used For:

- Commit message structure
- Allowed commit types (feat, fix, refactor, etc.)
- Scope usage

---

## 2. Semantic Versioning (SemVer)

Specification:
https://semver.org/

Key Concepts:

- MAJOR.MINOR.PATCH versioning
- Breaking changes trigger MAJOR bump
- New features trigger MINOR bump
- Bug fixes trigger PATCH bump

Used For:

- Mapping commit types to release impact
- BREAKING CHANGE rule

---

## 3. Git Official Documentation

Reference:
https://git-scm.com/book/en/v2

Key Concepts:

- Imperative mood for commit messages
- Short summary line (50–72 characters)
- Separate summary and body
- Explain why, not only what

Used For:

- Commit summary rules
- Body formatting rules

---

## 4. Trunk-Based Development

Reference:
https://trunkbaseddevelopment.com/

Key Concepts:

- Short-lived branches
- Small, focused changes
- One logical unit of work per branch

Used For:

- One-main-idea rule
- Branch priority rules

---

## 5. Clean Code (Robert C. Martin)

Book:
Clean Code – A Handbook of Agile Software Craftsmanship

Key Concepts:

- Single Responsibility Principle
- Expressive naming
- One reason to change

Used For:

- One concern per branch
- One concern per commit
- Forbidden vague wording

---

## 6. Commitlint

Project:
https://github.com/conventional-changelog/commitlint

Key Concepts:

- Linting commit messages
- Enforcing Conventional Commits
- Preventing invalid types

Used For:

- Allowed types list
- Structural validation

---

## 7. semantic-release

Project:
https://github.com/semantic-release/semantic-release

Key Concepts:

- Fully automated releases
- Version bump based on commits
- Changelog generation

Used For:

- Type → version mapping
- Breaking change conventions

---

## 8. Google Engineering Practices

Reference:
https://google.github.io/eng-practices/

Key Concepts:

- Clear, minimal, descriptive changes
- Small, focused commits
- Readable history

Used For:

- Priority rule
- Clarity over cleverness

---

## 9. Cognitive Load Theory

Overview:
https://en.wikipedia.org/wiki/Cognitive_load

Key Concepts:

- Humans process patterns faster than novelty
- Reduce unnecessary complexity

Used For:

- Predictable grammar
- Short summaries
- Limited vocabulary

---

## 10. Information Theory (Claude Shannon)

Overview:
https://en.wikipedia.org/wiki/Information_theory

Key Concepts:

- Maximize signal-to-noise ratio
- Compress meaning efficiently

Used For:

- Short high-signal branch names
- Short high-signal commit summaries

---

## 11. AI Alignment Principles

General Reference:
https://en.wikipedia.org/wiki/AI_alignment

Key Concepts:

- Constraining output space
- Reducing ambiguity
- Deterministic rules for reliability

Used For:

- Allowed vocabulary
- Forbidden words
- Strict templates

---

End of document.
