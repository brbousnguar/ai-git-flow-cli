# Branch Naming Best Practices (AI Contract)

This document defines strict rules for generating Git branch names.
The AI MUST follow these rules exactly.

---

## 1. Canonical Format

<type>/<ticket>-<verb>-<target>

Example:

fix/SFSC-1591-fix-discount-rule  
feat/SFSC-2041-add-loyalty-banner  
refactor/SFSC-332-clean-cart-service  

---

## 2. Allowed Types

The <type> MUST be one of:

- feat      → new feature
- fix       → bug fix
- refactor  → restructure without behavior change
- chore     → config, dependency, tooling
- docs      → documentation only
- test      → tests only
- perf      → performance improvement
- hotfix    → urgent production fix

No other values are allowed.

---

## 3. Allowed Verbs (imperative form)

The <verb> MUST be one of:

add  
fix  
remove  
update  
rename  
refactor  
simplify  
migrate  
optimize  
enable  
disable  

Verb must always be lowercase.

---

## 4. Target Naming Rules

- Use short, meaningful nouns
- lowercase
- kebab-case
- no filler words

Good:

cart  
checkout  
discount-rule  
order-api  
price-service  
case-flow  

Bad:

stuff  
things  
various-changes  
multiple-updates  

---

## 5. Length Constraint

- Maximum 6 words after the ticket
- Prefer 3–5 words

Good:

fix/SFSC-1591-fix-cart-tax  

Bad:

feat/SFSC-1591-update-versions-and-refactor-discount-calculations  

---

## 6. Priority Rule

When multiple changes exist:

Select the change with the HIGHEST business or user impact.

Ignore secondary refactors or version bumps.

Example:

If diff contains:
- refactor
- dependency update
- bug fix

Branch name must describe the bug fix.

---

## 7. Forbidden Words

The branch name MUST NOT contain:

and  
various  
multiple  
stuff  
things  
changes  
update-everything  
refactor-and-update  

Only ONE main idea is allowed.

---

## 8. Type Selection Heuristics

If diff shows bug fix keywords (fix, prevent, handle, null-check):  
→ type = fix  

If diff adds new behavior or endpoint:  
→ type = feat  

If diff moves or restructures code only:  
→ type = refactor  

If diff only updates versions or configs:  
→ type = chore  

---

## 9. Ticket Formatting

- Keep ticket exactly as provided
- Preserve case (e.g., SFSC-1591)

---

## 10. Output Rules

- Return ONLY one branch name
- No explanations
- No lists
- No surrounding text

---

## 11. Examples

fix/SFSC-1591-fix-discount-rule  
feat/SFSC-2041-add-cart-validation  
refactor/SFSC-330-clean-price-service  
chore/SFSC-88-update-node-version  

---

End of contract.
