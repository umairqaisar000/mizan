# Code standards

These apply to every line Mizan writes. Reviewers block on any "must".

## Before writing anything

- Must read the code you are changing and the code that calls it.
- Must search for an existing helper, component, hook, type or service before creating one (`grep` for the verb and the noun, for example "format" and "date"). If one almost fits, extend it rather than adding a near copy.
- Must follow the conventions already in the project (`.mizan/project.md`) unless the plan says why not.
- Must make the smallest change that meets the acceptance criteria. No drive-by refactors, no speculative features, no "while I'm here".

## Readability

- No comments. Not inline, not block, not JSDoc, not commented-out code. If code needs a comment, rename or extract until it does not. Reasoning goes in the change note.
- Names say what something is or does, in domain words: `unpaidInvoices`, not `data2`; `isEligibleForRefund`, not `check`. Booleans read as questions (`is`, `has`, `can`, `should`). Functions start with a verb.
- No abbreviations a newcomer would have to guess (`usr`, `cfg`, `tmp`, `cb`), except universally known ones (`id`, `url`, `html`).
- One function does one thing. If you need "and" to describe it, split it. Aim for under 30 lines and at most 3 parameters (use a named options object beyond that).
- Return early instead of nesting. At most 2 levels of indentation inside a function body where possible.
- No magic values. Give numbers and strings that carry meaning a named constant: `const SESSION_TIMEOUT_MINUTES = 30`.
- Keep related code together. A reader should not jump across five files to follow one flow.

## Explicit state, nothing implicit

- No global mutable state and no module-level variables that change at runtime.
- No hidden defaults. If a value has a default, it is a named constant visible at the call site or in one config module.
- Model states explicitly. Use a discriminated union or state machine (`{ status: 'loading' } | { status: 'error', error } | { status: 'ready', data }`) instead of several booleans that can contradict each other.
- No implicit type coercion. Use `===`, parse inputs explicitly, and never rely on truthiness for values where `0` or `''` is valid.
- Functions do not mutate their arguments. Return new values.
- Side effects (network, storage, time, randomness) live at the edges and are passed in or isolated, so the core logic is pure and testable.
- Every async path handles failure. No floating promises. No empty `catch`. Errors carry a message a person can act on.

## TypeScript

- `strict` mode. No `any`; use `unknown` and narrow. No non-null assertions (`!`) without a guard proving it.
- Types for data crossing a boundary (API, storage, URL, form) are validated at runtime (for example with zod) and inferred from the schema, not duplicated by hand.
- Prefer `type` unions and `as const` objects over enums.
- Exported functions have explicit return types.

## Structure

- Dependencies point inward: UI depends on application logic, which depends on domain logic. Domain logic never imports UI or framework code.
- No circular imports.
- No dead code, unused exports, unused dependencies or leftover debug output (`console.log`).
- No duplication. Two copies of the same logic is one too many once the second copy is written.

## Efficiency

- Pick the right data structure first (a `Map` or `Set` for lookups, not repeated `array.find`).
- No work inside loops that could happen once outside. No N+1 queries.
- Fetch only the fields and rows needed. Paginate lists that can grow.
- Measure before optimizing anything that is not obviously wasteful.

## Dependencies

- Do not add a package for something the platform or an existing dependency already does.
- A new dependency needs the user's approval: name, purpose, weekly downloads, last release date, licence, and size.
