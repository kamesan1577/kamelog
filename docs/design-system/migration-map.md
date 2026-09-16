# UI migration map

Updated: 2026-09-17

This is the Phase 0 inventory for Issue #99. It records the current
presentation boundaries before feature-by-feature migration. The current
screen remains on the approved legacy CSS until a phase has a replacement,
behavior coverage, and visual approval.

## Current stack

| Area                 | Current implementation                  | Migration destination                      | Decision                        |
| -------------------- | --------------------------------------- | ------------------------------------------ | ------------------------------- |
| Tokens               | `styles/tokens.css`                     | Token source of truth                      | keep                            |
| Shared primitives    | `components/design-system/primitives/*` | Feature-facing primitives                  | keep/adapt                      |
| Layout               | `components/design-system/layout/*`     | Shared shell and page layout               | keep/adapt                      |
| Feature rendering    | `app/notebook.tsx`                      | Patterns, then feature components          | replace incrementally           |
| Global presentation  | `app/globals.css`                       | Token-backed layout/pattern CSS            | adapt, then delete legacy rules |
| Feature presentation | `app/*.css`                             | Pattern styles or colocated feature styles | replace incrementally           |
| Behavior integration | `components/*-bridge.tsx`, `lib/*`      | Keep outside the visual layer              | keep                            |

## CSS responsibility inventory

The legacy allowlist currently contains 18 CSS files. Their primary
responsibilities are:

| File                                         | Responsibility                                                  | Target pattern/primitive                                       | Decision          |
| -------------------------------------------- | --------------------------------------------------------------- | -------------------------------------------------------------- | ----------------- |
| `app/globals.css`                            | shell, navigation, timeline, composer, editor and shared states | `AppShell`, `Navigation`, `TimelineItem`, `Composer`, `Dialog` | split and replace |
| `app/landing.css`                            | top/about/projects landing presentation                         | `PageHeader`, `ContentIndex`, `ProjectList`                    | replace           |
| `app/engineering.css`                        | profile, works, career and skills sections                      | `ProfileSection`, `ProjectList`                                | adapt             |
| `app/composer-layout.css`                    | desktop composer geometry                                       | `Composer`                                                     | replace           |
| `app/mobile-composer.css`                    | mobile composer geometry and keyboard-safe actions              | `Composer`                                                     | replace           |
| `app/mobile-blog-editor.css`                 | mobile Markdown editor controls                                 | `BlogEditor`                                                   | replace           |
| `app/full-page-blog-editor.css`              | full-page/split editor layout                                   | `BlogEditor`                                                   | replace           |
| `app/blog-toc.css`                           | blog TOC and reading rail                                       | `BlogReadingTools`, `TableOfContents`                          | replace           |
| `app/detail-actions.css`                     | detail-page action rail/floating bar                            | `PostActions`                                                  | replace           |
| `app/tweet-link-preview.css`                 | link preview card                                               | `LinkPreview`                                                  | replace           |
| `app/tweet-thread-bridge.module.css`         | thread detail presentation                                      | `ThreadView`                                                   | adapt             |
| `app/mobile-nav-layout.css`                  | mobile navigation and FAB                                       | `MobileNavigation`, `CreateButton`                             | replace           |
| `app/brand-theme.css`                        | brand colors and page surfaces                                  | tokens                                                         | absorb            |
| `app/federation.css`                         | owner federation settings/timeline                              | `FederationSettings`, `FederationTimeline`                     | replace           |
| `app/federation/federation-guide.module.css` | public federation guide                                         | `Guide`, `Matrix`                                              | adapt             |
| `app/project-social-links.css`               | project external links                                          | `ExternalLinkList`                                             | replace           |
| `app/x-share-logo.css`                       | X share mark                                                    | shared icon primitive                                          | replace           |
| `app/not-found.module.css`                   | 404 page                                                        | `EmptyState`                                                   | adapt             |

## `globals.css` visual responsibilities to extract

The following selectors are the first extraction boundaries; selectors are
grouped by behavior rather than by their current file position.

| Responsibility      | Selectors                                                                                                                        |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| App shell           | `.notebook`, `.site-layout`, `.workspace`, `.public-header`, `.content-grid`, `.main-content`                                    |
| Desktop navigation  | `.public-sidebar`, `.site-name`, `.public-sidebar nav`, `.sidebar-section`, `.side-link`, `.admin-nav`, `.sidebar-foot`          |
| Mobile navigation   | `.mobile-nav`, `.mobile-name`, `.mobile-login`, `.mobile-account`, `.mobile-create`                                              |
| Page heading/search | `.page-heading`, `.heading-line`, `.page-heading-icon`, `.page-subtitle`, `.home-search`, `.main-search`                         |
| Timeline            | `.timeline-toolbar`, `.feed-tabs`, `.feed`, `.post`, `.post-meta`, `.post-focus`, `.post-actions`, `.empty-state`, `.feed-count` |
| Composer            | `.composer`, `.composer-start`, `.composer-kinds`, `.inline-tweet`, `.composer-images`, `.draft-button`                          |
| Reading/detail      | `.detail-page`, `.back-button`, `.markdown`, `.tags`, `.vlog-frame`, `.vlog-overlay`                                             |
| Editor              | `.editor-dialog`, `.mobile-editor-header`, `.editor-tools`, `.editor-view-modes`, `.blog-editor-workspace`, `.editor-footer`     |
| Owner/settings      | `.settings-page`, `.setting-avatar`, `.field`, `.federation-settings`                                                            |
| Side content        | `.right-sidebar`, `.profile-card`, `.side-search`, `.aside-section`, `.topic-list`                                               |

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

Behavior selectors already use roles and labels for most user-facing actions.
The following implementation selectors remain and need migration or explicit
test-id justification:

| Selector family                                             | Current tests                               | Destination                                     |
| ----------------------------------------------------------- | ------------------------------------------- | ----------------------------------------------- |
| `.desktop-composer`                                         | `journeys.spec.ts`                          | region/name or composer pattern test id         |
| `.mobile-create`                                            | `journeys.spec.ts`                          | button role/name `投稿を作成`                   |
| `.mobile-nav`                                               | `mobile-nav-layout.spec.ts`                 | navigation role/name                            |
| `.public-sidebar`, `.side-search`                           | `journeys.spec.ts`                          | navigation/label semantics                      |
| `.landing-page`, `.landing-profile`, `.content-cards`       | `notion-polish.spec.ts`, `journeys.spec.ts` | semantic sections and visual regression fixture |
| `.post-focus`, `.tweet-body`                                | journey/detail/thread tests                 | article/body semantics                          |
| `.editor-dialog`, `.mobile-editor-header`, `.editor-footer` | `journeys.spec.ts`                          | dialog/action regions                           |
| `[data-ds="owner-federation"]`                              | `journeys.spec.ts`                          | owner federation settings semantic region       |

Geometry assertions in `notion-polish.spec.ts` and
`mobile-nav-layout.spec.ts` are visual-regression candidates. User actions in
those tests must remain as behavior coverage after the selector migration.

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
