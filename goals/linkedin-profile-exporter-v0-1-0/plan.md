# Plan

## Solution Approach

Build `linkedin-profile-exporter` as a contract-first TypeScript monorepo. OpenSpec defines the public behavior and asset formats first, then implementation lands in parallel lanes: shared extraction/export packages, WXT browser extensions, bookmarklet exporter, settings UI, docs/design/assets, store listing management, and validation infrastructure.

The current repo is effectively empty, so implementation should create the project structure rather than refactor an existing app. The old `joshuatz/linkedin-to-jsonresume` build and source should be used as a behavioral reference for extraction coverage, LinkedIn embedded state parsing, schema mapping, multilingual behavior, and the Manifest V2 bug lineage. Do not port its Manifest V2 extension architecture directly.

## Research-Backed Constraints

- WXT builds separate targets with `-b`, defaults to Chrome, supports browser-aware entrypoints, and defaults to MV2 for Safari/Firefox and MV3 for other browsers. The extension plan must test target-specific manifests rather than assume one manifest works everywhere.
- WXT’s unified `browser` API works across Chromium, Firefox, and Safari, but extension APIs can be absent depending on browser and manifest version. Entrypoints must avoid extension API calls outside their `main` functions so WXT/Vitest can load them in Node-backed test environments.
- WXT publishing supports Chrome, Firefox, and Edge ZIP/submission flows. Safari publishing is not automated by WXT; Safari requires the Xcode `safari-web-extension-packager` path from WXT’s Safari output.
- WXT’s first-class unit-test path is Vitest with `WxtVitest()`, and WXT’s E2E recommendation is Playwright against the built Chrome MV3 output directory.
- Firefox Add-ons expects source ZIP review material. The plan must include source ZIP rebuilding instructions and source ZIP inspection, not just browser ZIP artifacts.
- Fumadocs has explicit docs support for local MDX/content, page trees, generated OpenGraph images, link validation, search, and LLM-facing docs output. The docs site should treat `llms.txt`/LLM docs as a first-class docs artifact.
- shadcn-ui’s current model is open code plus `components.json`, monorepo support, React 19 support, Tailwind v4 support, and registry-aware component distribution. Extension UI and docs UI should share tokens but keep browser-extension runtime code separate from Next/Fumadocs code.
- YAMLResume is a plain-text YAML resume format with validation and downstream renderers. The exporter should project from the canonical schema into YAMLResume-compatible YAML without making YAMLResume the internal source of truth.
- The current OpenSpec tooling exposes `spec-driven` and local `agent-asset-change`-style schemas. This plan should use spec-driven capability deltas for product behavior and an affected-surfaces/validation-matrix/tasks layer for repo workflow surfaces.

## Plan Critique And Corrections

- The first plan correctly identified the main systems, but it was too linear for the size of v0.1.0. The revised plan locks OpenSpec, package names, and shared schema first, then dispatches independent lanes in waves.
- The first plan did not make enough room for target-browser incompatibilities. The revised plan separates browser artifact generation, Safari wrapper work, mobile support documentation, and store submission boundaries.
- The first plan treated the old exporter as one research item. The revised task graph gives reference audit its own lane because old extraction behavior, multilingual support, work-ordering fixes, and Manifest V2 limitations are core risk controls.
- The first plan under-specified agent instructions. The revised graph includes root and nested `AGENTS.md` ownership for extension, core, docs, assets, store materials, and tests.
- The first plan listed verification commands but did not connect them tightly enough to subagent ownership. The revised graph assigns each lane a validation contract and reserves a final integration wave for cross-lane checks.
- The first plan did not explicitly handle the fact-review change from multi-table CSV to XLSX. The revised plan treats CSV as a simple flat export and XLSX as the canonical multi-section tabular workbook.
- The first plan mentioned generated assets but did not control quality. The revised graph includes prompt provenance, dimension/transparency checks, social preview checks, and manual no-text review for the icon.

## Parallel Subagent Task Graph

Use this graph after Step 1 locks OpenSpec change IDs, package names, and shared file ownership. `[P]` marks tasks that can run in parallel once dependencies are satisfied. Same-file edits stay sequential with the listed owner.

### Wave 0: Baseline And Contracts

| ID | Owner | Dependencies | Files/Systems | Verification |
| --- | --- | --- | --- | --- |
| W0.1 | `repo_baseline` | none | `README.md`, `.gitignore`, dirty-state notes | `git status --short`, current branch is `main` |
| W0.2 | `openspec_lead` | W0.1 | `openspec/config.yaml`, `openspec/schemas/product-release-change/schema.yaml` | `npx -y @fission-ai/openspec@latest validate --all --json` |
| W0.3 | `openspec_lead` | W0.2 | `openspec/changes/ship-linkedin-exporter-v0-1-0/proposal.md`, `affected-surfaces.md`, `design.md`, `validation-matrix.md`, `tasks.md` | OpenSpec validation and reviewer-readable affected surfaces |
| W0.4 | `agent_instructions` | W0.3 | root `AGENTS.md`, nested instruction plan | instruction files mention destructive-action, secrets, generated files, and validation boundaries |
| W0.5 | `architecture_lead` | W0.3 | `docs/architecture/project-structure.md`, package naming decisions | plan references stable workspace/package names |

### Wave 1: Independent Research And Test Fixtures

| ID | Owner | Dependencies | Files/Systems | Verification |
| --- | --- | --- | --- | --- |
| W1.1 [P] | `reference_audit` | W0.3 | `docs/research/reference-exporter.md`, old build/source notes | maps old fields/functions to new schema requirements |
| W1.2 [P] | `browser_matrix` | W0.3 | `docs/research/browser-targets.md` | matrix covers Chrome, Edge, Firefox, Safari, mobile Safari, mobile Chrome constraints |
| W1.3 [P] | `schema_research` | W0.3 | `docs/research/schema-targets.md` | JSON Resume, YAMLResume, LinkedIn-specific, provenance fields documented |
| W1.4 [P] | `fixture_curator` | W0.3 | `packages/fixtures/linkedin/`, `packages/fixtures/reference/` | fixture inventory covers dense, sparse, multilingual, nested-role, missing-section profiles |
| W1.5 [P] | `store_research` | W0.3 | `packages/web-store/research/` | store requirements and screenshot dimensions recorded |
| W1.6 [P] | `privacy_review` | W0.3 | `docs/privacy/local-explicit.md` | no default analytics/upload/secrets path documented |

### Wave 2: Product Specs

| ID | Owner | Dependencies | Files/Systems | Verification |
| --- | --- | --- | --- | --- |
| W2.1 [P] | `spec_extraction` | W1.1, W1.2 | `openspec/changes/.../specs/profile-extraction/spec.md` | requirements include scenarios for DOM, client state, lazy sections, provenance, diagnostics |
| W2.2 [P] | `spec_schema` | W1.3, W1.4 | `openspec/changes/.../specs/profile-schema/spec.md` | requirements include schema versioning and invalid fixture rejection |
| W2.3 [P] | `spec_exports` | W1.3 | `openspec/changes/.../specs/export-formats/spec.md` | requirements include JSON, YAML, CSV flat, XLSX workbook, XML, Markdown, and no PDF |
| W2.4 [P] | `spec_extension` | W1.2 | `openspec/changes/.../specs/browser-extension-suite/spec.md` | requirements include target builds, manifests, popup/options/sidepanel/content/background behavior |
| W2.5 [P] | `spec_bookmarklet` | W1.2 | `openspec/changes/.../specs/bookmarklet-exporter/spec.md` | requirements include CSP fallback behavior |
| W2.6 [P] | `spec_settings_privacy` | W1.6 | `openspec/changes/.../specs/settings-privacy/spec.md` | requirements include local-only storage and configurable automation |
| W2.7 [P] | `spec_docs_assets_store` | W1.5 | `openspec/changes/.../specs/docs-design-assets-store/spec.md` | requirements include Fumadocs, `DESIGN.md`, icon/social assets, listings |
| W2.8 | `openspec_lead` | W2.1-W2.7 | all specs | `npx -y @fission-ai/openspec@latest validate --all --json` |

### Wave 3: Monorepo Scaffold

| ID | Owner | Dependencies | Files/Systems | Verification |
| --- | --- | --- | --- | --- |
| W3.1 | `repo_scaffold` | W2.8 | `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, lockfile | `pnpm install`, workspace package discovery |
| W3.2 [P] | `quality_scaffold` | W3.1 | ESLint/Prettier/Vitest/Playwright configs | `pnpm lint --help`, `pnpm test --help` or equivalent scripts |
| W3.3 [P] | `extension_scaffold` | W3.1 | `apps/extension/`, `apps/extension/wxt.config.ts`, entrypoint shells | `pnpm --filter @linkedin-profile-exporter/extension wxt prepare` |
| W3.4 [P] | `docs_scaffold` | W3.1 | `apps/docs/`, Fumadocs config, content source | docs dev/build script starts or compiles |
| W3.5 [P] | `core_scaffold` | W3.1 | `packages/core/` | package typecheck succeeds with empty exports |
| W3.6 [P] | `bookmarklet_scaffold` | W3.1 | `packages/bookmarklet/` | bookmarklet build script emits placeholder artifact |
| W3.7 [P] | `webstore_scaffold` | W3.1 | `packages/web-store/` | metadata schema check runs |
| W3.8 [P] | `agent_instructions` | W3.3-W3.7 | nested `AGENTS.md` files | nested instructions exist for each major workspace |
| W3.9 | `repo_scaffold` | W3.2-W3.8 | `Justfile`, `.pre-commit-config.yaml` | `just --list`, `pre-commit run --all-files` |

### Wave 4: Core Data And Export Implementation

| ID | Owner | Dependencies | Files/Systems | Verification |
| --- | --- | --- | --- | --- |
| W4.1 [P] | `schema_core` | W3.5, W2.2 | `packages/core/src/schema/` | Zod valid/invalid fixture tests |
| W4.2 [P] | `profile_model` | W4.1 | `packages/core/src/profile/` | model tests cover provenance/confidence |
| W4.3 [P] | `extract_dom` | W1.4, W4.1 | `packages/core/src/extraction/dom/` | fixture DOM extraction tests |
| W4.4 [P] | `extract_state` | W1.4, W4.1 | `packages/core/src/extraction/state/` | embedded-state fixture tests |
| W4.5 [P] | `extract_automation` | W4.3 | `packages/core/src/extraction/automation/` | scroll/show-more state-machine tests |
| W4.6 [P] | `diagnostics` | W4.2-W4.5 | `packages/core/src/diagnostics/` | diagnostics fixture snapshots |
| W4.7 [P] | `export_json_yaml` | W4.1 | `packages/core/src/exporters/json.ts`, `yaml.ts` | golden JSON/YAML tests |
| W4.8 [P] | `export_markdown` | W4.1 | `packages/core/src/exporters/markdown.ts` | frontmatter and compact LLM-context tests |
| W4.9 [P] | `export_tabular_xml` | W4.1 | `packages/core/src/exporters/csv.ts`, `xlsx.ts`, `xml.ts` | CSV/XLSX/XML parse and golden tests |
| W4.10 | `core_integrator` | W4.2-W4.9 | `packages/core/src/index.ts` | full core test suite and typecheck |

### Wave 5: Extension, Bookmarklet, And UI Implementation

| ID | Owner | Dependencies | Files/Systems | Verification |
| --- | --- | --- | --- | --- |
| W5.1 [P] | `extension_background` | W3.3, W4.10 | background messaging/download/storage | WXT Vitest fake-browser tests |
| W5.2 [P] | `extension_content` | W3.3, W4.10 | LinkedIn content script, readiness detection, extraction orchestration | fixture page Playwright smoke |
| W5.3 [P] | `extension_popup` | W3.3, W4.10 | popup extraction/export controls | component tests and Playwright popup flow |
| W5.4 [P] | `extension_options` | W3.3, W4.10 | full settings panel | component tests, accessibility checks |
| W5.5 [P] | `extension_sidepanel` | W3.3, W4.10 | optional richer review/diagnostics UI | Playwright visual smoke |
| W5.6 [P] | `ui_system` | W3.3, W3.4 | shared tokens/components, Monaspice font setup, shadcn components | UI import/typecheck, no duplicate card nesting patterns |
| W5.7 [P] | `bookmarklet_impl` | W3.6, W4.10 | generated bookmarklet, installer page, CSP fallback docs | bookmarklet fixture Playwright flow |
| W5.8 | `extension_integrator` | W5.1-W5.7 | app-level extension flows | `wxt build -b chrome`, local Playwright E2E |

### Wave 6: Browser Targets, Docs, Assets, Store Materials

| ID | Owner | Dependencies | Files/Systems | Verification |
| --- | --- | --- | --- | --- |
| W6.1 [P] | `browser_chrome_edge` | W5.8 | Chrome/Edge manifests, zips, listing metadata | `wxt build -b chrome`, `wxt zip`, `wxt zip -b edge` |
| W6.2 [P] | `browser_firefox` | W5.8 | Firefox build, source ZIP, review docs | `wxt build -b firefox`, `wxt zip -b firefox`, source ZIP rebuild check |
| W6.3 [P] | `browser_safari` | W5.8 | Safari build and Xcode wrapper guide | `wxt build -b safari`, documented `xcrun safari-web-extension-packager` command |
| W6.4 [P] | `mobile_paths` | W6.1-W6.3 | mobile Safari/mobile Chrome docs and QA checklist | platform constraint checklist completed |
| W6.5 [P] | `docs_product` | W3.4, W4.10, W5.8 | Fumadocs user/admin/dev docs | docs build and link validation |
| W6.6 [P] | `docs_llms` | W6.5 | docs LLM output, `llms.txt`/LLM context docs | generated LLM docs check |
| W6.7 [P] | `design_system` | W5.6 | `DESIGN.md`, design tokens, UI screenshots | design review checklist |
| W6.8 [P] | `asset_generation` | W6.7 | icon, social preview, prompts, source assets | dimension/transparency checks and manual no-text review |
| W6.9 [P] | `store_materials` | W6.1-W6.8 | per-store listing copy, screenshots, metadata, checklists | metadata schema and screenshot inventory checks |

### Wave 7: CI, Release, And Cross-Lane Validation

| ID | Owner | Dependencies | Files/Systems | Verification |
| --- | --- | --- | --- | --- |
| W7.1 [P] | `ci_openspec` | W2.8, W3.9 | `.github/workflows/ci.yml` OpenSpec job | local equivalent command passes |
| W7.2 [P] | `ci_node` | W4.10, W5.8 | lint/typecheck/test jobs | `pnpm lint`, `pnpm typecheck`, `pnpm test` |
| W7.3 [P] | `ci_extension` | W6.1-W6.3 | extension build/package jobs | all target build/zip commands pass |
| W7.4 [P] | `ci_docs_assets_store` | W6.5-W6.9 | docs/assets/store jobs | docs build and asset/store checks pass |
| W7.5 | `qa_integrator` | W7.1-W7.4 | `just quick`, `just ci`, release artifacts | full local parity succeeds |
| W7.6 | `docs_steward_runner` | W7.5 | docs/generated public surfaces | `/docs-steward` invoked if available or unavailable status documented |
| W7.7 | `release_auditor` | W7.6 | final diff, generated artifacts, risks | `git diff --check`, `git status --short`, no unrelated `.DS_Store` staged |

## Dispatch Rules

- Start only W0 in a single session because it establishes shared names and contracts.
- After W2.8 passes, dispatch W3.2-W3.8 in parallel; only `repo_scaffold` edits root package/workspace files.
- After W4.1 defines schema exports, dispatch extraction and exporter lanes in parallel; nobody except `core_integrator` edits `packages/core/src/index.ts`.
- UI lanes can run in parallel only after `ui_system` creates shared tokens/components; otherwise they will conflict in component primitives.
- Browser packaging lanes run after one integrated extension build passes; they should not edit core extraction or schema files.
- CI lanes run after their target surfaces exist; one final owner composes workflow job dependencies to avoid workflow-file conflicts.
- Any lane that changes public formats, docs generation, agent instructions, or validation behavior must update the relevant OpenSpec affected-surface and validation-matrix entries in the same lane.

## Ordered Steps

1. Establish repository and OpenSpec governance.
   - Touches: `README.md`, `AGENTS.md`, nested `AGENTS.md` files, `openspec/config.yaml`, `openspec/schemas/product-release-change/schema.yaml`, `openspec/changes/ship-linkedin-exporter-v0-1-0/`.
   - Initialize OpenSpec artifacts with the current toolchain: `uv run --project /Users/ww/dev/projects/agents wagents openspec init --path /Users/ww/dev/projects/linkedin-profile-exporter --agent codex --agent claude-code --agent cursor --agent opencode --agent gemini-cli --dry-run --format json`, then apply when ready.
   - Create a change package with `proposal.md`, `affected-surfaces.md`, `design.md`, `validation-matrix.md`, `tasks.md`, and capability specs for extraction, canonical schema, export formats, browser extensions, bookmarklet, settings/privacy, docs/design/assets, release packaging, and web-store materials.
   - Verification: `npx -y @fission-ai/openspec@latest validate --all --json`, `jq empty` for JSON config, and a documented `just openspec` wrapper.

2. Scaffold the monorepo and command surface.
   - Touches: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `eslint.config.*`, `prettier.config.*`, `.pre-commit-config.yaml`, `.github/workflows/ci.yml`, `Justfile`.
   - Use current package versions discovered during setup: WXT `0.20.26`, React `19.2.6`, Tailwind CSS `4.3.0`, Zod `4.4.3`, Zustand `5.0.13`, Sonner `2.0.7`, Motion `12.40.0`, TanStack React Query `5.100.14`, Vitest `4.1.7`, Playwright `1.60.0`, Fumadocs UI `16.9.1`, Fumadocs MDX `15.0.8`, and shadcn `4.8.0`.
   - Create workspaces: `apps/extension/`, `apps/docs/`, `packages/core/`, `packages/bookmarklet/`, `packages/fixtures/`, `packages/web-store/`, `assets/`.
   - Verification: `pnpm install`, `pnpm lint`, `pnpm typecheck`, `pre-commit run --all-files`, `just --list`.

3. Define the canonical profile schema and fixtures.
   - Touches: `packages/core/src/schema/`, `packages/core/src/profile/`, `packages/fixtures/linkedin/`, `openspec/changes/ship-linkedin-exporter-v0-1-0/specs/profile-schema/spec.md`.
   - Create a versioned Zod schema that synthesizes JSON Resume, YAML Resume, LinkedIn-specific fields, provenance, confidence, diagnostics, source URLs, and export metadata.
   - Add valid and invalid profile fixtures, including multilingual data, nested roles, sparse profiles, private/missing sections, and repeated sections.
   - Verification: Vitest schema acceptance/rejection tests and schema snapshot tests.

4. Audit the old reference implementation for extraction coverage.
   - Touches: `docs/research/reference-exporter.md`, `packages/fixtures/reference/`.
   - Inspect `/Users/ww/Downloads/build_3.2.3/` and the current `joshuatz/linkedin-to-jsonresume` source for covered sections, old JSON Resume mappings, multilingual behavior, vCard/contact handling, work-history ordering fixes, and Manifest V2 limitations.
   - Record what is reused conceptually and what is rejected.
   - Verification: reference audit document cites exact files/functions and maps old coverage to new schema fields.

5. Implement extraction core.
   - Touches: `packages/core/src/extraction/`, `packages/core/src/linkedin/`, `packages/core/src/settings/`, `packages/core/src/diagnostics/`.
   - Build deterministic page-and-state extraction from visible DOM, accessible embedded client state, metadata, and lazy-loaded sections. Include configurable scrolling, show-more expansion, rescan completion criteria, field provenance, confidence, and diagnostics.
   - Keep network/private API behavior behind explicit spec review. The default product must not require LinkedIn credentials, persist secrets, upload data, or depend on a remote service.
   - Verification: Vitest fixture tests for identity, work, education, skills, certifications, projects, publications, volunteering, honors, awards, languages, courses, recommendations, featured items, organizations, and interests.

6. Implement export core.
   - Touches: `packages/core/src/exporters/`, `packages/core/src/formats/`, `openspec/changes/ship-linkedin-exporter-v0-1-0/specs/export-formats/spec.md`.
   - Add canonical JSON, improved JSON Resume projection, improved YAML Resume projection, compact LLM-context Markdown with frontmatter and separators, XML, flat CSV, and XLSX workbook output for multi-section tabular data.
   - PDF is out of scope because the reviewed fact was removed.
   - Verification: exporter golden tests, XML schema/parse tests, YAML parse tests, JSON Schema/Zod tests, Markdown frontmatter tests, CSV/XLSX content tests.

7. Build the WXT extension app.
   - Touches: `apps/extension/wxt.config.ts`, `apps/extension/entrypoints/background.ts`, `apps/extension/entrypoints/content.linkedin.ts`, `apps/extension/entrypoints/popup/`, `apps/extension/entrypoints/options/`, `apps/extension/entrypoints/sidepanel/`, `apps/extension/public/`.
   - Use WXT browser targeting and entrypoint filtering for Chromium/Chrome, Edge, Firefox, Safari, mobile Safari packaging paths, and mobile Chrome documented constraints.
   - Implement active-tab detection, LinkedIn profile readiness states, extraction orchestration, preview, export selection, download handling, local settings storage, and local delete/clear controls.
   - Verification: `pnpm --filter @linkedin-profile-exporter/extension wxt prepare`, `wxt build -b chrome`, `wxt build -b firefox`, `wxt build -b edge`, `wxt build -b safari`, manifest validation, and target artifact checks.

8. Build the settings and product UI.
   - Touches: `apps/extension/entrypoints/options/`, `apps/extension/entrypoints/popup/`, `apps/extension/src/components/`, `apps/extension/src/styles/`.
   - Configure React, TypeScript, shadcn-ui, Tailwind CSS v4, Zustand, Sonner, Motion, TanStack Query, and Monaspice font variants.
   - Include controls for data scope, automation mode, auto-download, output formats, filename templates, privacy, diagnostics, and browser-target status.
   - Verification: Vitest component/state tests, Playwright UI flows, responsive screenshots, accessibility checks, no overlapping text, and visual review.

9. Build the bookmarklet exporter.
   - Touches: `packages/bookmarklet/`, `apps/docs/content/bookmarklet/`, `packages/core/src/bookmarklet-adapter/`.
   - Share extraction/export logic where the browser environment permits. Provide a generated bookmarklet, installer page, and fallback guidance for LinkedIn CSP limitations.
   - Verification: Playwright bookmarklet tests on local LinkedIn-like fixtures and generated installer output checks.

10. Add browser packaging and release workflows.
    - Touches: `apps/extension/package.json`, `apps/extension/wxt.config.ts`, `.github/workflows/ci.yml`, `packages/web-store/`, `release/`.
    - Add zip/build scripts for Chrome, Firefox, Edge, and Safari. For Safari, use WXT’s `-b safari` output plus documented `xcrun safari-web-extension-packager` wrapper flow. For Firefox, include source ZIP review instructions. Do not perform credentialed store submissions.
    - Verification: `wxt zip`, `wxt zip -b firefox`, `wxt zip -b edge`, source ZIP inspection, package manifest checks, and dry-run store metadata validation.

11. Build docs, design system, assets, and store materials.
    - Touches: `apps/docs/`, `DESIGN.md`, `assets/icon/`, `assets/social/`, `packages/web-store/listings/`, `packages/web-store/screenshots/`.
    - Configure Fumadocs with shadcn-ui and Tailwind CSS, SEO metadata, OpenGraph/social card metadata, sitemap support, docs for install/use/settings/privacy/export formats, and release/store guides.
    - Generate the icon with transparent background and no text/letters/words, plus social preview imagery. Keep source prompts and generated artifacts documented.
    - Verification: `pnpm --filter @linkedin-profile-exporter/docs build`, link checks, SEO metadata checks, asset dimension checks, transparency checks, and manual visual review for no text in the icon.

12. Add CI/CD, hooks, and full validation parity.
    - Touches: `.github/workflows/ci.yml`, `.pre-commit-config.yaml`, `Justfile`, `package.json`.
    - CI jobs should cover OpenSpec, install, lint, typecheck, Vitest, Playwright, extension builds/zips, docs build, asset checks, web-store checks, and artifact upload. Use least-privilege permissions and concurrency cancellation.
    - `just ci` should be the local parity command; `just quick` should cover the fast inner loop.
    - Verification: `just quick`, `just ci`, `git diff --check`, and final `git status --short`.

13. Run docs and agent-surface follow-through.
    - Touches: generated docs, root and nested `AGENTS.md`, README, OpenSpec status artifacts.
    - Invoke `/docs-steward` if available after public APIs, file structure, agent definitions, skill-like instructions, docs generation, or public asset formats are changed.
    - Verification: docs-steward result or documented unavailable status, OpenSpec validation, docs build, and no untracked generated drift except intentionally tracked assets.

## Verification Map

| Area | Required Check |
| --- | --- |
| Goal package | `jq empty goals/linkedin-profile-exporter-v0-1-0/*.json` |
| OpenSpec | `npx -y @fission-ai/openspec@latest validate --all --json` |
| Toolchain | `pnpm install`, `pnpm lint`, `pnpm typecheck` |
| Core schema/exporters | `pnpm --filter @linkedin-profile-exporter/core test` |
| Extension unit tests | `pnpm --filter @linkedin-profile-exporter/extension test` |
| Extension builds | `wxt build -b chrome`, `wxt build -b firefox`, `wxt build -b edge`, `wxt build -b safari` |
| Extension packages | `wxt zip`, `wxt zip -b firefox`, `wxt zip -b edge` |
| E2E | Playwright with `.output/chrome-mv3` and local fixture pages |
| Bookmarklet | Generated bookmarklet fixture test and installer page smoke test |
| Docs | Fumadocs build, sitemap/metadata checks, link checks |
| Assets | icon transparency/dimension checks, social preview dimension checks, manual no-text review |
| Store materials | metadata schema checks, screenshot inventory checks, release checklist checks |
| Local parity | `pre-commit run --all-files`, `just quick`, `just ci` |

## Risks And Open Questions

- LinkedIn page structure and embedded state are unstable. The implementation should rely on fixtures, provenance, diagnostics, and layered parsers instead of brittle selectors alone.
- The old exporter used authenticated Voyager requests and cookies. The accepted privacy posture keeps the default local-explicit and non-secret-persisting; any deeper network-assisted mode needs separate OpenSpec review.
- WXT supports Safari builds, but Safari publishing requires an Xcode wrapper path and WXT does not automate Safari store submission. Mobile Safari and mobile Chrome support should be validated against platform constraints during implementation and documented honestly.
- Bookmarklets have a history of LinkedIn CSP breakage. The bookmarklet should be useful where possible, but the extension is the primary robust path.
- The reviewed fact set removed PDF export. Do not add PDF back into v0.1.0 unless the user explicitly changes the scope.
- The v0.1.0 scope is broad enough to require parallel implementation lanes after OpenSpec contracts are approved; shared schema and package names should be locked first to reduce same-file conflicts.

## Sources Consulted

- WXT `llms.txt`, target-browser, publishing, Vitest, and Playwright docs from `https://wxt.dev/`.
- Fumadocs `llms.txt` from `https://fumadocs.dev/llms.txt`.
- shadcn-ui `llms.txt` from `https://ui.shadcn.com/llms.txt`.
- React `llms.txt` from `https://react.dev/llms.txt`.
- Tailwind CSS Vite installation docs from `https://tailwindcss.com/docs/installation/using-vite`.
- YAMLResume README and package metadata from `https://github.com/yamlresume/yamlresume`.
- Local OpenSpec workflow guidance and `wagents openspec` commands from `/Users/ww/dev/projects/agents`.
- Old reference build at `/Users/ww/Downloads/build_3.2.3/` and current `joshuatz/linkedin-to-jsonresume` source cloned to a temporary directory for inspection.
