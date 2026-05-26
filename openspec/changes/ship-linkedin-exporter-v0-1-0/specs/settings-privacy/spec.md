## ADDED Requirements

### Requirement: Local-only privacy posture
The product SHALL store settings locally and MUST NOT upload extracted profile data, send analytics, require LinkedIn credentials, persist secrets, or use a remote service by default.

#### Scenario: Default settings
- **WHEN** default settings are loaded
- **THEN** analytics, remote upload, credential storage, and automatic export are disabled.

### Requirement: Automation controls
Settings SHALL include controls for data scope, review-before-export, automatic download, manual extraction, output formats, filename templates, privacy behavior, auto-download behavior, and diagnostics.

#### Scenario: Settings validation
- **WHEN** settings are updated
- **THEN** invalid automation modes, invalid filename templates, and empty output format selections are rejected.

### Requirement: Local delete and review controls
The product SHALL include controls to preview extracted data, delete extracted data from local state, and avoid exporting until the user confirms or enables auto-download.

#### Scenario: Review before export
- **WHEN** review-before-export mode is enabled
- **THEN** extraction does not download files until the user confirms export.
