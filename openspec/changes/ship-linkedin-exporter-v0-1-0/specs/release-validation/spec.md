## ADDED Requirements

### Requirement: Local command surface

The repository SHALL include a Justfile with commands for setup, development, OpenSpec
validation, linting, typechecking, testing, extension builds, docs, assets, store
checks, GitHub Release packaging, and release validation.

#### Scenario: Just command discovery

- **WHEN** `just --list` runs
- **THEN** the documented local command surface is listed.

### Requirement: CI and hooks

The repository SHALL include GitHub Actions CI/CD and pre-commit configuration for
deterministic install, lint, typecheck, tests, extension builds, docs builds, asset
checks, store checks, release package checks, and credential-free GitHub Release
artifact handoff.

#### Scenario: CI workflow syntax

- **WHEN** the workflow file is inspected
- **THEN** jobs cover OpenSpec, Node validation, extension packaging, docs/assets/store
  checks, and artifact upload without store credentials or credentialed release
  publication.

### Requirement: GitHub Release artifact handoff

The repository SHALL include a credential-free command that packages browser extension
ZIPs, bookmarklet artifacts, Firefox source-review material, checksums, release notes,
and a draft `gh release create` handoff command.

#### Scenario: Draft release packet

- **WHEN** GitHub Release packaging runs after release builds
- **THEN** a local `.release/github/<tag>/` packet is generated with uploadable assets
  and a draft `gh release create --verify-tag` command, without creating or mutating a
  GitHub Release.

### Requirement: Release readiness validation

Done SHALL mean OpenSpec validation passes, documented local and CI-equivalent checks
pass or have explicit environment blockers, and the repo contains no unrelated staged or
hidden cleanup work.

#### Scenario: Final audit

- **WHEN** final validation runs
- **THEN** `git diff --check`, `git status --short`, OpenSpec validation, and the
  documented verification commands report release status.

#### Scenario: Profile output assurance

- **WHEN** profile-output assurance runs against the deterministic fixture or a supplied
  canonical JSON, XML, pasted XML text, or pasted Markdown text export
- **THEN** schema validation, default diagnostics/provenance/confidence stripping,
  Include all fields retention, verbose diagnostics gating, section counts, warning
  categories, Markdown coverage diagnostics, and JSON, JSON Resume, YAML, CSV, XLSX,
  XML, and Markdown exports are checked without printing raw profile field values.
