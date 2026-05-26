## ADDED Requirements

### Requirement: Generated bookmarklet
The project SHALL provide a generated bookmarklet that can run from a LinkedIn profile page and use shared extraction/export logic where the browser environment permits it.

#### Scenario: Bookmarklet generation
- **WHEN** the bookmarklet build command runs
- **THEN** a source-managed generated bookmarklet artifact is emitted and validated.

### Requirement: Low-friction fallback path
The bookmarklet SHALL provide a low-friction export path and SHALL document CSP or browser limitations honestly.

#### Scenario: Fixture bookmarklet flow
- **WHEN** Playwright runs the bookmarklet against a local LinkedIn-like fixture page
- **THEN** the generated bookmarklet exports canonical JSON or reports a visible needs-action diagnostic.
