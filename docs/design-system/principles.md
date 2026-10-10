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

`styles/tokens.css` is the shared token source. ADR 0021 records the authorized
publication redesign: a 216px navigation column, 56px header, fine dividers,
and a paper background of #fbfbfa. Below 1240px, search and tag filtering stay
reachable inside the timeline; from 641px to 900px, content has 24px side padding.

Use typography, whitespace, and restrained rules to distinguish content rather
than enclosing every section in a rounded panel. Japanese headings retain normal
letter spacing. Preserve familiar timeline, composer, media, and navigation
behavior, and use only supported facts in profile copy.
