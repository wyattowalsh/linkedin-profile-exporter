# Validation Matrix

| Area | Command | Expected |
| --- | --- | --- |
| Goal package | `jq empty goals/linkedin-profile-exporter-v0-1-0/*.json` | JSON goal files parse when present. |
| OpenSpec | `npx -y @fission-ai/openspec@latest validate --all --json` | Change specs validate. |
| Install | `pnpm install` | Workspace dependencies install and lockfile is current. |
| Command surface | `just --list` | Local commands are discoverable. |
| Lint | `pnpm lint` | Source, docs metadata, assets, and store material lint checks pass. |
| Typecheck | `pnpm typecheck` | TypeScript projects compile without emit. |
| Core tests | `pnpm --filter @linkedin-profile-exporter/core test` | Schema, extraction, exporter, settings, and diagnostics tests pass. |
| Extension tests | `pnpm --filter @linkedin-profile-exporter/extension test` | Extension state and entrypoint tests pass. |
| Extension prepare | `pnpm --filter @linkedin-profile-exporter/extension wxt prepare` | WXT types and output scaffolding are generated. |
| Extension builds | `pnpm build:extension` | Chrome, Edge, Firefox, and Safari target builds run or report explicit local blockers. |
| Playwright E2E | `pnpm test:e2e` | Fixture-backed docs, extension, and bookmarklet browser flows pass without live LinkedIn credentials. |
| Bookmarklet | `pnpm --filter @linkedin-profile-exporter/bookmarklet build` | Generated bookmarklet artifact validates. |
| Docs | `pnpm --filter @linkedin-profile-exporter/docs build` | Docs build and LLM docs checks pass. |
| Assets | `pnpm check:assets` | Icon/social dimensions, transparency metadata, and prompt provenance validate. |
| Store materials | `pnpm check:store` | Store metadata, screenshot plans, and release checklists validate. |
| Local parity | `just quick` | OpenSpec, lint, typecheck, tests, docs, assets, and store checks pass. |
| CI parity | `pnpm run ci` or `just ci` | Full local release parity passes where local browser tooling is available. |
| Hooks | `uvx pre-commit run --all-files` | Hook configuration passes even when `pre-commit` is not installed globally. |
| Final audit | `git diff --check` and `git status --short` | No whitespace errors and no unrelated staged/hidden cleanup work. |

Docs steward status: the `docs-steward` skill is available from `/Users/ww/dev/projects/agents/skills/docs-steward/SKILL.md`; its Fumadocs sync/maintain guidance was applied through the local docs build, route checks, and Playwright docs E2E coverage.
