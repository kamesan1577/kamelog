# kamelog Design System

The design system is the executable contract for new UI. It follows the
dependency direction `Feature → Patterns → Primitives/Layout → Tokens`.

The visual baseline is quiet, content-first, and neutral: surfaces are white,
borders and shadows are restrained, and the ink accent is used for primary
actions and selected/focus states. Timeline and composer interactions should
follow familiar X patterns, including reachable mobile actions and predictable
back navigation.

New shared UI belongs under `components/design-system/` and requires a colocated
Storybook story. Feature code should consume variants and layout primitives;
it should not invent visual values or import third-party primitives directly.

`styles/tokens.css` is the token source for the new system. Existing screens
remain on the approved legacy CSS until the staged migration in #99.
