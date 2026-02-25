# Commit Message Best Practices (AI Contract)

This document defines strict rules for generating Git commit messages.
The AI MUST follow these rules exactly.

---

## 1. Format

<type>(<scope>): <short summary>

[optional body]

Example:

fix(cart): correct tax rounding logic  
feat(checkout): add loyalty discount validation  
refactor(price-service): simplify discount calculation  

---

## 2. Allowed Types

The <type> MUST be one of:

feat      → new feature  
fix       → bug fix  
refactor  → internal restructure without behavior change  
chore     → config, dependency, tooling updates  
docs      → documentation only  
test      → tests only  
perf      → performance improvement  
hotfix    → urgent production fix  

No other values are allowed.

---

## 3. Scope Rules

- Scope represents the main module or business area
- lowercase
- kebab-case
- no spaces

Examples:

cart  
checkout  
order-api  
price-service  
case-flow  
opportunity-flow  

If no clear scope exists, omit parentheses:

fix: handle null response in API

---

## 4. Summary Rules

- Imperative mood (present tense)
- Max 72 characters
- No trailing period
- Clear and specific
- One main idea only

Good:

fix(cart): handle null tax response  
feat(order-api): add order validation endpoint  

Bad:

fixed bug in cart  
updating various things  
made some improvements  

---

## 5. Body Rules (Optional)

Add a body only if clarification is needed.

Structure:

- Why the change was made
- What was changed (high level)
- Impact (if relevant)

Example:

fix(cart): handle null tax response

Prevent crash when tax service returns null.
Add fallback value and improve error logging.

Body lines must be <= 100 characters.

---

## 6. Priority Rule

When multiple changes exist:

Select the change with the highest business impact.

Ignore:
- minor refactors
- formatting
- small version bumps

Example:

If commit contains:
- bug fix
- dependency update
- code cleanup

The message MUST describe the bug fix.

---

## 7. Forbidden Words

Commit summary MUST NOT contain:

stuff  
things  
various  
multiple  
update everything  
fix everything  
misc  

Avoid vague wording.

---

## 8. Heuristics for Type Detection

If diff contains bug fix keywords (fix, prevent, handle, null-check):  
→ type = fix  

If diff adds new behavior or endpoint:  
→ type = feat  

If diff restructures without changing behavior:  
→ type = refactor  

If diff updates dependencies or config only:  
→ type = chore  

If diff improves speed or reduces computation:  
→ type = perf  

---

## 9. Breaking Changes

If change is breaking:

Add:

BREAKING CHANGE: <description>

At the end of the body.

Example:

feat(order-api): change response structure

BREAKING CHANGE: remove legacy orderId field

---

## 10. Output Rules

- Return only the commit message
- No explanations
- No markdown
- No surrounding text

---

## 11. Examples

fix(cart): correct rounding error  
feat(checkout): add coupon validation  
refactor(price-service): simplify discount logic  
chore(deps): update node to v20  
docs(api): update order endpoint documentation  

---

End of contract.
