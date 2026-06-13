## ADDED Requirements

### Requirement: Product documentation site

The repository SHALL include a Fumadocs documentation site with SEO metadata, OpenGraph
metadata, sitemap support, LLM-facing docs output, and product documentation for
install, usage, privacy, export formats, browser targets, bookmarklet, development, and
release packaging.

#### Scenario: Docs build

- **WHEN** the docs build command runs
- **THEN** docs pages, metadata, sitemap, and LLM docs artifacts are generated or
  validated.

### Requirement: Design system documentation

The repository SHALL include `DESIGN.md` describing typography, color, iconography,
motion, accessibility, UI patterns, and product tone.

#### Scenario: Design system check

- **WHEN** design docs are checked
- **THEN** required design sections are present.

### Requirement: Generated assets

The project SHALL include a simple, modern, generated PNG profile-export icon with
transparent background and no text, letters, font, or words, plus matching social
preview imagery with prompt provenance, extension-ready PNG variants, docs metadata
usage, web-store metadata usage, and dimension checks.

#### Scenario: Asset validation

- **WHEN** asset checks run
- **THEN** icon dimensions, generated PNG variant dimensions, transparency metadata,
  social preview dimensions, docs public asset copies, store asset references, and
  no-text manual review notes are present.

### Requirement: Web-store materials

The repository SHALL include source-managed web-store listing copy, metadata, screenshot
plans, image assets, and release checklists for each target web store.

#### Scenario: Store material validation

- **WHEN** store checks run
- **THEN** every target store has metadata, screenshot plan, and checklist entries
  without credentials.
