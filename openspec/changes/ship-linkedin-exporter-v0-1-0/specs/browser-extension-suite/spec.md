## ADDED Requirements

### Requirement: WXT extension targets
The browser extension SHALL use WXT to produce browser-specific artifacts for Chromium/Chrome, Edge, Firefox, Safari, and documented mobile browser packaging paths.

#### Scenario: Target builds
- **WHEN** target build commands run
- **THEN** browser-specific output directories and manifests are produced or documented platform packaging constraints are surfaced.

### Requirement: Valid extension entrypoints
Each extension artifact SHALL include valid manifest metadata, required permissions, content script registration, popup, options, sidepanel or documented equivalent, background workflow, icons, and store-ready metadata.

#### Scenario: Manifest validation
- **WHEN** a target manifest is generated
- **THEN** it includes only the permissions required for active tab extraction, local storage, downloads, and LinkedIn content-script execution.

### Requirement: Extension extraction workflow
The extension UI SHALL let users run extraction, inspect extracted data, choose export formats, configure automation, download exported files, and clear local extracted state.

#### Scenario: Popup export flow
- **WHEN** the popup receives a ready profile state and extraction succeeds
- **THEN** the user can preview a summary, select formats, and request downloads.

### Requirement: Node-testable entrypoints
Extension entrypoints MUST avoid extension API calls outside entrypoint `main` functions so WXT/Vitest can load modules in Node-backed tests.

#### Scenario: Unit test import
- **WHEN** extension entrypoint modules are imported by tests
- **THEN** import succeeds without a live extension runtime.
