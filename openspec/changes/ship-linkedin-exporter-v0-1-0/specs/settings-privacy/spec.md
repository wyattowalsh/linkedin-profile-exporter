## ADDED Requirements

### Requirement: Local-only privacy posture

The product SHALL store settings locally and MUST NOT upload extracted profile data,
send analytics, require LinkedIn credentials, persist secrets, or use a remote service
by default.

#### Scenario: Default settings

- **WHEN** default settings are loaded
- **THEN** analytics, remote upload, credential storage, automatic export, verbose
  diagnostics, provenance export, confidence export, and full field metadata export are
  disabled.

### Requirement: Automation controls

Settings SHALL include controls for data scope, review-before-export, automatic
download, manual extraction, output formats, filename templates, privacy behavior,
auto-download behavior, diagnostics, and explicit full-field export.

#### Scenario: Settings validation

- **WHEN** settings are updated
- **THEN** invalid automation modes, invalid filename templates, and empty output format
  selections are rejected.

#### Scenario: Include all fields export is explicit

- **WHEN** the user enables the Include all fields setting
- **THEN** exports include field provenance, confidence, and normal diagnostics that are
  omitted by default without persisting raw LinkedIn payloads.
- **AND** Markdown exports include aggregate Coverage Diagnostics only when those
  troubleshooting fields are retained.

#### Scenario: Verbose diagnostics is independent

- **WHEN** the user enables Include all fields without enabling Verbose diagnostics
- **THEN** exports retain rich field metadata and normal diagnostics but omit
  `linkedin-voyager.inventory.*` diagnostics.
- **AND** enabling Verbose diagnostics separately emits Voyager inventory diagnostics
  without coupling the setting to Include all fields.
- **AND** Include all fields visually implies provenance and confidence, while the
  explicit provenance and confidence toggles remain editable and keep their stored
  values for when Include all fields is turned off.

### Requirement: Local delete and review controls

The product SHALL include controls to preview extracted data, delete extracted data from
local state, and avoid exporting until the user confirms or enables auto-download.

#### Scenario: Review before export

- **WHEN** review-before-export mode is enabled
- **THEN** extraction does not download files until the user confirms export.
