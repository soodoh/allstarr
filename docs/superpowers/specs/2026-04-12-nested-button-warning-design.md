# Nested Button Warning Design

## Summary

Fix client-side DOM nesting warnings caused by interactive controls rendered inside other interactive controls, while preserving the current "click almost anywhere to expand" behavior.

## Confirmed Findings

Two confirmed invalid nesting cases exist today:

1. `src/routes/_authed/authors/$authorId.tsx`
   The author series row is rendered as a `<button>` and contains:
   - a monitor toggle `<button>`
   - a settings `<Button>` that also renders a `<button>`

2. `src/components/tv/season-accordion.tsx`
   `AccordionTrigger` renders a native button, and its children include `ProfileToggleIcons`, which renders one button per profile.

These patterns can trigger React `validateDOMNesting` warnings such as "`<button>` cannot be a descendant of `<button>`".

## Goals

- Remove invalid nested interactive markup.
- Preserve full-row expansion for the affected row and accordion UIs.
- Keep monitor and settings actions independently focusable and clickable.
- Add regression coverage that fails when React emits DOM nesting warnings.

## Non-Goals

- Broad refactors of unrelated card, table, or dialog components.
- Introducing a second lint stack unless there is a clear, low-noise rule that materially helps.
- Reworking the user-facing behavior beyond the minimum needed to preserve existing affordances.

## Recommended Approach

Use a stretched-trigger layout.

The expandable row becomes a non-interactive container. Inside that container:

- one native trigger remains responsible for expand/collapse behavior
- the trigger visually covers the full row hit area
- secondary controls are rendered as siblings, not descendants, of the trigger
- secondary controls sit above the trigger with stacking order so they stay clickable

This preserves the current UX without relying on a clickable `div` or manual keyboard emulation.

## Component Design

### Author Series Row

For `src/routes/_authed/authors/$authorId.tsx`:

- Replace the outer row `<button>` with a `div` wrapper that is `relative`.
- Add one dedicated expand/collapse button stretched across the row background.
- Render the monitor dot button and settings button as sibling foreground controls.
- Keep the chevron within the row layout, but conceptually associate expansion with the stretched trigger rather than with nested action controls.
- Preserve the current monitor toggle and edit-profile handlers.

### Season Accordion

For `src/components/tv/season-accordion.tsx`:

- Keep a single accordion trigger as the expansion control.
- Restructure the header so `ProfileToggleIcons` is no longer a child of `AccordionTrigger`.
- Use a wrapper layout that allows the trigger to fill the row while profile controls remain sibling foreground actions.
- Preserve current keyboard and accordion semantics by keeping Radix in control of expand/collapse behavior.

## Testing Strategy

Add browser-mode regression coverage for this warning class.

- Introduce a small shared browser-test helper that captures `console.error`.
- Fail tests when messages match React DOM nesting warnings such as `validateDOMNesting` or "`<button>` cannot be a descendant of `<button>`".
- Add or update focused browser tests for the affected author-series and season-accordion flows so the helper is exercised against real render trees.

This is the primary guardrail because React emits these problems at runtime, and composition through wrappers like `AccordionTrigger`, `Button`, and `asChild` is difficult to police reliably with static analysis alone.

## Linting Decision

Do not treat stricter Biome configuration as the primary fix.

Current repo configuration enables Biome recommended rules plus a small set of custom rules. Biome clearly covers some JSX and accessibility concerns, but it is not a reliable static detector for nested interactive composition in this codebase, especially when the final DOM is produced through component wrappers.

If this pattern recurs frequently, we can later evaluate:

- an additional static rule from another lint stack
- a custom repo check for interactive-inside-interactive JSX patterns

That follow-up is explicitly out of scope for this fix.

## Implementation Notes

- Keep the fix narrowly scoped to confirmed offenders and any additional real offenders found during implementation.
- Avoid introducing suppression comments.
- Preserve existing user-visible behavior except for the removal of invalid nesting.
- Verify with `bun run test` and any targeted browser tests added for this work.

## Success Criteria

- No affected component renders a button inside another button.
- Full-row expansion still works for the targeted expandable UIs.
- Secondary actions remain clickable and keyboard accessible.
- Browser tests fail if the warning reappears.
