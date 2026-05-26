# Affected Surfaces

## Source Packages

- `package.json`
- `pnpm-workspace.yaml`
- `pnpm-lock.yaml`
- `tsconfig.base.json`
- `eslint.config.mjs`
- `prettier.config.mjs`
- `vitest.config.ts`
- `playwright.config.ts`
- `apps/extension/`
- `apps/docs/`
- `packages/core/`
- `packages/bookmarklet/`
- `packages/fixtures/`
- `packages/web-store/`
- `assets/`

## Contracts And Governance

- `AGENTS.md`
- nested `AGENTS.md` files
- `README.md`
- `DESIGN.md`
- `openspec/changes/ship-linkedin-exporter-v0-1-0/`
- `openspec/schemas/product-release-change/schema.yaml`

## Generated Or Packaged Surfaces

- WXT `.output/` browser builds and ZIPs.
- bookmarklet generated artifact.
- docs build output and LLM docs output.
- generated icon and social preview assets.
- web-store metadata, screenshot plans, and release checklists.

## Automation And CI

- `.github/workflows/ci.yml`
- `.pre-commit-config.yaml`
- `Justfile`
- validation scripts in `scripts/`

## Boundaries

- CI must not require a live LinkedIn login.
- Web-store submissions are not performed in v0.1.0.
- LinkedIn credentials, cookies, extracted private data, analytics identifiers, and store credentials are never committed.
