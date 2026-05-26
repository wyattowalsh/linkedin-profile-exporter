## ADDED Requirements

### Requirement: Local command surface
The repository SHALL include a Justfile with commands for setup, development, OpenSpec validation, linting, typechecking, testing, extension builds, docs, assets, store checks, and release packaging.

#### Scenario: Just command discovery
- **WHEN** `just --list` runs
- **THEN** the documented local command surface is listed.

### Requirement: CI and hooks
The repository SHALL include GitHub Actions CI/CD and pre-commit configuration for deterministic install, lint, typecheck, tests, extension builds, docs builds, asset checks, store checks, and release package checks.

#### Scenario: CI workflow syntax
- **WHEN** the workflow file is inspected
- **THEN** jobs cover OpenSpec, Node validation, extension packaging, docs/assets/store checks, and artifact upload without store credentials.

### Requirement: Release readiness validation
Done SHALL mean OpenSpec validation passes, documented local and CI-equivalent checks pass or have explicit environment blockers, and the repo contains no unrelated staged or hidden cleanup work.

#### Scenario: Final audit
- **WHEN** final validation runs
- **THEN** `git diff --check`, `git status --short`, OpenSpec validation, and the documented verification commands report release status.
