# UI migration map

Updated: 2026-09-17

This is the Phase 0 inventory for Issue #99. It records the current
presentation boundaries before feature-by-feature migration. The current
screen remains on the approved legacy CSS until a phase has a replacement,
behavior coverage, and visual approval.

## Current stack

| Area                 | Current implementation                  | Migration destination                      | Decision                |
| -------------------- | --------------------------------------- | ------------------------------------------ | ----------------------- |
| Tokens               | `styles/tokens.css`                     | Token source of truth                      | keep                    |
| Shared primitives    | `components/design-system/primitives/*` | Feature-facing primitives                  | keep/adapt              |
| Layout               | `components/design-system/layout/*`     | Shared shell and page layout               | keep/adapt              |
| Feature rendering    | `app/notebook.tsx`                      | Patterns, then feature components          | replace incrementally   |
| Global presentation  | `styles/globals.css`                    | Token-backed reset/focus/avatar foundation | keep and audit          |
| Feature presentation | Design System `patterns/*.css`          | Semantic pattern boundaries                | complete/continue audit |
| Behavior integration | `components/*-bridge.tsx`, `lib/*`      | Keep outside the visual layer              | keep                    |

## CSS responsibility inventory

The legacy allowlist is now empty. Feature visual ownership has moved into the Design System pattern layer, including MediaGallery, Markdown help/embeds, ProjectList, Vlog, preview shell, app shell, public navigation, mobile navigation/create controls, search, editor/media, detail/reader, sidebar, composer, timeline/post patterns, dialog states, owner settings, and theme feature overrides. The remaining audit is limited to intentional global foundations (tokens, reset, focus, avatar primitive) and verification of duplicate/orphan selectors.

| File                                             | Responsibility                                | Decision       |
| ------------------------------------------------ | --------------------------------------------- | -------------- |
| `styles/globals.css`                             | reset, focus, avatar, reduced-motion          | keep and audit |
| `styles/brand-theme.css`                         | token-backed theme overrides                  | keep and audit |
| `components/design-system/patterns/*.css`        | feature presentation and responsive ownership | complete/audit |
| `components/design-system/patterns/*.module.css` | isolated feature presentation                 | keep/adapt     |

## `globals.css` visual responsibilities to extract

The feature-specific rules previously listed here have been extracted. The
remaining file contains only reset, focus, avatar primitive, and reduced-motion
foundation rules; these are intentionally global and are not feature escape
hatches.

## Native controls

The implementation currently contains native controls in these responsibility
groups:

- Buttons: navigation, post focus, timeline actions, editor tools, media
  actions, confirmation actions, and owner controls in `app/notebook.tsx`.
- Inputs: search, profile fields, federation setup/following, editor title and
  body, captions, and file/video upload controls in `app/notebook.tsx`.
- Dialog/menu primitives: `components/ui/dialog.tsx`,
  `components/ui/alert-dialog.tsx`, and `components/ui/dropdown-menu.tsx`.
- Tabs: `components/ui/tabs.tsx` is already the shared behavior primitive;
  feature-specific geometry belongs in the replacement patterns.

The migration must preserve accessible names and keyboard behavior while
moving visual styling to the Design System. Native controls are not to be
replaced merely to change their appearance.

## E2E selector audit

The current Playwright journeys use roles, labels, semantic text, and `data-ds`
contracts for UI behavior. A repository search found no E2E locator that targets
a CSS class; CSS strings remaining in server tests are static contract checks for
pattern ownership, not browser selectors. Visual-only geometry checks are kept in
Storybook visual regression tests.

## Migration order

1. App shell/navigation/layout: introduce the common coordinate system and
   semantic navigation regions.
2. Top/about/projects: move low-risk static sections to layout primitives.
3. Timeline/post/detail: extract the common post pattern and preserve history,
   action, thread, and federation behavior.
4. Composer/media: migrate desktop and keyboard-open mobile states together.
5. Blog editor/reader: migrate editor modes, TOC, Markdown and media behavior.
6. Owner/account/remaining UI: migrate settings, menus, dialogs and states.
7. Remove legacy selectors and reduce the allowlist to zero where practical.

Each phase requires a colocated Storybook story for new shared components,
behavior coverage, visual baselines at 390/768/1440px, `check:ui`, lint,
typecheck, build, and the existing E2E suite before the next phase starts.
