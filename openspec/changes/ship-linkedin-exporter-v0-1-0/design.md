## Context

The repository starts as a placeholder with a README and gitignore. The v0.1.0 goal requires a complete product release: shared extraction/export logic, WXT extension, bookmarklet, docs, design/assets, store material, CI, hooks, and OpenSpec validation. LinkedIn page structure is unstable and CI cannot rely on authenticated LinkedIn state, so the implementation must be fixture-first and diagnostic-rich.

## Goals / Non-Goals

**Goals:**

- Build a pnpm TypeScript monorepo with stable package names and deterministic local commands.
- Keep the canonical profile schema in `packages/core` and make every app consume that contract.
- Implement layered extraction from DOM, embedded state, metadata, automation signals, and fixtures.
- Export JSON, JSON Resume, YAML Resume, CSV, XLSX, XML, and LLM Markdown from the canonical schema.
- Build a WXT browser extension and generated bookmarklet around shared core behavior.
- Keep privacy local-explicit: no analytics, remote upload, credentials, secrets, or live LinkedIn dependency by default.
- Source-manage docs, design guidance, generated assets, store material, CI, hooks, and validation scripts.

**Non-Goals:**

- Credentialed web-store submission.
- Authenticated LinkedIn private API extraction.
- PDF export.
- Live LinkedIn account tests in CI.
- Legacy Manifest V2 architecture from the reference extension.

## Decisions

### Contract-first monorepo

Use pnpm workspaces with `apps/extension`, `apps/docs`, `packages/core`, `packages/bookmarklet`, `packages/fixtures`, `packages/web-store`, `assets`, and `scripts`. This keeps public package boundaries clear and lets CI validate each surface directly.

Alternative rejected: a single extension-only app. That would make bookmarklet/docs/store validation harder and blur the canonical schema boundary.

### Canonical schema owns all projections

The core package owns the versioned Zod schema and projects into JSON Resume, YAML Resume, CSV/XLSX, XML, and Markdown. External formats are outputs, not internal state.

Alternative rejected: using JSON Resume as the internal source of truth. It cannot represent all LinkedIn-specific sections, provenance, diagnostics, and automation metadata without lossy extensions.

### Fixture-first extraction

Extraction uses selectors and embedded-state parsing against local fixtures, with provenance and confidence on extracted values. Tests cover dense, sparse, multilingual, nested-role, and hidden-section pages.

Alternative rejected: depending on live LinkedIn pages or authenticated Voyager requests. That would make CI nondeterministic and conflict with the local-explicit privacy posture.

### WXT target-specific builds

WXT owns browser builds and manifests. The implementation validates target manifests and documents Safari/mobile packaging constraints instead of assuming one manifest works everywhere.

Alternative rejected: porting the old Manifest V2 reference extension. It does not match modern target-browser requirements and carries the prior manifest issue forward.

### Docs and assets are source-managed

Docs, design, prompts, generated SVG/PNG-like assets, store metadata, screenshot plans, and release checklists live in the repo and are validated by scripts. Generated runtime build folders remain ignored.

Alternative rejected: keeping store/docs/assets as manual external state. That would make release readiness unverifiable.

## Risks / Trade-offs

- LinkedIn DOM drift -> Use layered parsers, fixtures, provenance, confidence, and diagnostics.
- WXT target differences -> Build each target separately and inspect manifests.
- Bookmarklet CSP limits -> Treat the extension as primary and document bookmarklet fallback behavior.
- Broad v0.1.0 scope -> Keep shared schema/package names stable before parallel implementation lanes.
- Browser build dependencies may be unavailable locally -> Record explicit blockers instead of claiming green.

## Migration Plan

This is a new product scaffold, so there is no persisted user data migration. Rollback is standard version-control rollback of new files. No credentialed production or store state is modified.

## Open Questions

- Safari App Store submission remains outside v0.1.0 until explicitly requested.
- Any authenticated or network-assisted LinkedIn mode requires a separate OpenSpec change.
