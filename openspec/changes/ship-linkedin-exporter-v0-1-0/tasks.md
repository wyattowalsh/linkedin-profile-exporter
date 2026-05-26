## 1. Governance And Contracts

- [x] 1.1 Initialize OpenSpec and downstream agent command surfaces.
- [x] 1.2 Add root repository instructions and product-release schema documentation.
- [x] 1.3 Add proposal, capability specs, design, affected surfaces, validation matrix, and tasks.
- [x] 1.4 Validate OpenSpec state.

## 2. Monorepo Scaffold

- [x] 2.1 Add pnpm workspace files, root package metadata, TypeScript, lint, format, Vitest, Playwright, pre-commit, CI, and Justfile configuration.
- [x] 2.2 Add workspace directories and nested `AGENTS.md` files.
- [x] 2.3 Add shared validation scripts for assets, store materials, docs, release artifacts, and manifest checks.

## 3. Core Package

- [x] 3.1 Implement canonical Zod schema, profile helpers, settings validation, diagnostics, and fixtures.
- [x] 3.2 Implement DOM, embedded-state, metadata, automation, provenance, and confidence extraction logic.
- [x] 3.3 Implement JSON, JSON Resume, YAML Resume, CSV, XLSX, XML, and LLM Markdown exporters.
- [x] 3.4 Add core tests for valid/invalid fixtures, extraction, settings, diagnostics, and exporters.

## 4. Apps And Packages

- [x] 4.1 Implement WXT extension background, content, popup, options, sidepanel, icons, storage, downloads, and target config.
- [x] 4.2 Implement bookmarklet build, installer output, and fixture smoke path.
- [x] 4.3 Implement docs site content, metadata, sitemap, and LLM docs output.
- [x] 4.4 Add web-store metadata, screenshot plans, release checklists, and source-managed generated assets.
- [x] 4.5 Add fixture-backed Playwright coverage for docs routes, extension pages/settings/content messaging, and bookmarklet download behavior.

## 5. Release Validation

- [x] 5.1 Run install, OpenSpec validation, lint, typecheck, tests, docs, asset, store, and command-surface checks.
- [x] 5.2 Run extension prepare/build checks where local tooling allows.
- [x] 5.3 Run final `git diff --check` and focused `git status --short` audit.
- [x] 5.4 Record docs-steward availability or result after public surfaces change.
- [x] 5.5 Wire `test:e2e` into local and CI parity.
