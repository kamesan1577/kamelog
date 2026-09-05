---
name: kamelog-ui-contract
description: Preserve kamelog's approved UI when changing rendering, navigation, or API-connected editor state.
---

Read `spec/invariants/README.md` I02-I07 and `spec/current/development.md`.
Keep `app/globals.css` unchanged for backend work; retain functional icons and the unified composer.
Test both 390px mobile and 1280px desktop. Anonymous users must not see the composer/account controls.
Exercise outside-click and Escape with unsaved text, save/reopen drafts, failed publish, and switching to vlog.
Do not accept a screenshot update as a fix for changed geometry. Record deliberate UI changes with approval.
Run `make check` and `make e2e`; report failures and unrun real-device checks explicitly in HANDOFF.
