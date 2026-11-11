# UI and UX standards

Browser QA checks these. Any "must" that fails is a QA failure.

## Every screen has every state

- Must design and build loading, empty, error, success, and partial or slow states. The empty state says what to do next. The error state says what happened and how to recover, in plain words, with a retry where it makes sense.
- Must keep the user's input when something fails. Never clear a form on error.
- Must show progress for anything over about 400ms, and disable or debounce actions that must not run twice.
- Destructive actions ask for confirmation or offer undo.

## Consistency

- Must reuse the project's existing components, spacing, colours and typography (see `.mizan/project.md`). No one-off styles when a design token or component exists.
- The same action looks and is named the same way everywhere.
- Copy is short, specific and human. Buttons say what they do ("Save changes", not "Submit"). No em dashes in UI text.

## Accessibility (WCAG 2.2 AA)

- Must be fully usable with a keyboard: logical tab order, visible focus, no keyboard traps, Escape closes dialogs.
- Must use semantic HTML first (`button`, `a`, `label`, `nav`, `main`, headings in order) and ARIA only to fill gaps.
- Every input has a visible label; errors are linked to their field and announced.
- Text contrast at least 4.5:1 (3:1 for large text and UI controls). Never rely on colour alone.
- Touch targets at least 24 by 24 CSS pixels; 44 by 44 preferred on mobile.
- Images have meaningful `alt` text or `alt=""` if decorative. Respect `prefers-reduced-motion`.
- Lighthouse accessibility score at least 90 on changed pages.

## Layout

- Must work at 375px wide (mobile) and 1280px (desktop) with no horizontal scrolling, overlapping or cut-off text.
- Content reflows; it does not just shrink. Long words, names and numbers do not break the layout.
- Right-to-left languages: use logical CSS properties (`margin-inline-start`) when the product supports RTL.

## Performance as UX

- No layout shift when content loads (reserve space for images and async content).
- Largest contentful paint under 2.5s on the changed page in a normal dev build check; investigate anything far worse.
- Lists that can grow are paginated or virtualized.

## Forms

- Validate as the user goes, but only show an error after they leave the field or submit.
- Put the error next to the field and say how to fix it.
- Use the right input types (`email`, `tel`, `number`, `date`) and `autocomplete` attributes.
