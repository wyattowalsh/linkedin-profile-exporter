## Why

The repository is currently only a placeholder, while the accepted goal defines a full v0.1.0 product release. The change establishes a contract-first implementation for a local-explicit LinkedIn profile exporter that works as a browser extension suite and bookmarklet without relying on live LinkedIn credentials or remote services.

## What Changes

- Add a TypeScript pnpm monorepo with shared core packages, WXT browser extension app, bookmarklet package, docs app, fixtures, assets, web-store materials, CI, hooks, and Justfile commands.
- Add canonical profile extraction, schema validation, export formats, local settings, diagnostics, browser packaging, docs, design, and release validation behavior.
- Add deterministic fixtures and tests so CI validates behavior without a live LinkedIn account.
- Add generated source-managed icon/social assets and store listing material, but do not perform credentialed store submissions.
- Add nested agent instructions for major workspaces and deterministic validation surfaces.

## Capabilities

### New Capabilities

- `profile-extraction`: Detect LinkedIn profile pages, expand accessible sections, extract visible DOM/client-state/metadata content, and attach provenance, confidence, and diagnostics.
- `profile-schema`: Define and validate the versioned canonical profile schema, including JSON Resume, YAML Resume, LinkedIn-specific, provenance, confidence, diagnostics, and export metadata fields.
- `export-formats`: Emit canonical JSON, JSON Resume projection, YAML Resume projection, flat CSV, XLSX workbook, XML, and compact LLM-context Markdown.
- `browser-extension-suite`: Provide WXT extension entrypoints, browser-target manifests/artifacts, popup/options/sidepanel/content/background workflows, and local downloads.
- `bookmarklet-exporter`: Provide a generated bookmarklet and installer path that reuses shared extraction/export behavior where the page environment allows it.
- `settings-privacy`: Provide local-only settings, automation behavior, privacy controls, local delete/clear actions, and diagnostics configuration.
- `docs-design-assets-store`: Provide Fumadocs product docs, `DESIGN.md`, generated icon/social assets, web-store metadata, screenshot plans, and release checklists.
- `release-validation`: Provide CI/CD, pre-commit, Justfile wrappers, OpenSpec validation, target build checks, docs checks, asset checks, and release packaging validation.

### Modified Capabilities

None. The repository has no existing OpenSpec product capabilities.

## Impact

- New public package names and workspace file structure.
- New extension/browser artifact formats and bookmarklet output.
- New canonical export schema and output format contracts.
- New source-managed docs, assets, web-store material, and validation commands.
- New local development dependencies for WXT, React, Tailwind CSS, shadcn-style components, Zod, Zustand, Sonner, Motion, TanStack React Query, Vitest, Playwright, Fumadocs, and release tooling.
