---
name: kamelog-data-safety
description: Validate kamelog authentication, persistence, media handling, migrations, and backup restoration changes.
---

Read `spec/invariants/README.md` I01-I02/I08-I11, the relevant ADR, and `docs/security/threat-model.md`.
Use fictional data in isolated temporary directories. Never run restore or migration tests against owner data.
For auth changes test invalid signatures, expired/reused challenges, cross-Origin requests and logout invalidation.
For storage changes verify reopen, transaction rollback, revision conflict and draft/public separation.
For media changes test invalid input and actual FFmpeg output, not only the CSS aspect ratio.
For backups use a fresh empty target, validate hashes and references, and prove tampered archives are rejected.
Run `make check`; changing format or schema also requires updated fixtures and restore tests.
Do not print cookies, tokens, private markers or request bodies in errors. Never claim unrun tests passed.
