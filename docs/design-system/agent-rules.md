# UI implementation rules

- Search `components/design-system/` for an existing primitive or layout before adding one.
- Use token-backed variants instead of overriding component padding, color, radius, or typography.
- Add a colocated `.stories.tsx` file for every new shared component.
- Keep feature/page imports flowing toward Patterns, then Primitives/Layout, then Tokens.
- Run `npm run lint`, `npm run check:ui`, `npm run storybook:build`, and the visual/component tests after UI changes.
- Do not update visual snapshots to hide geometry regressions; document intentional visual changes first.
