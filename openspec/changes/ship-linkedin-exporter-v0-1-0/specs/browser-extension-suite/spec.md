## ADDED Requirements

### Requirement: WXT extension targets

The browser extension SHALL use WXT to produce browser-specific artifacts for
Chromium/Chrome, Edge, Firefox, Safari, and documented mobile browser packaging paths.

#### Scenario: Target builds

- **WHEN** target build commands run
- **THEN** browser-specific output directories and manifests are produced or documented
  platform packaging constraints are surfaced.

### Requirement: Valid extension entrypoints

Each extension artifact SHALL include valid manifest metadata, required permissions,
content script registration, popup, options, sidepanel or documented equivalent,
background workflow, icons, and store-ready metadata.

#### Scenario: Manifest validation

- **WHEN** a target manifest is generated
- **THEN** it includes only the permissions required for active tab extraction, local
  storage, downloads, LinkedIn content-script execution, and target-supported
  content-script recovery.

#### Scenario: Target-specific recovery permissions

- **WHEN** Chrome or Edge MV3 manifests are generated
- **THEN** they include `scripting`, `tabs`, and the LinkedIn profile host permission so
  existing profile tabs can be recovered without a page reload and capped detail
  sections can be read in temporary same-profile detail tabs. Detail tabs are opened
  inactive first and may be briefly activated only when Chromium does not load the
  inactive tab, after which the original profile tab is restored.
- **AND** Firefox and Safari MV2 manifests do not request unsupported `scripting` or
  detail-tab recovery permissions.

### Requirement: Extension extraction workflow

The extension UI SHALL let users run extraction, inspect extracted data, choose export
formats, configure automation, download exported files, and clear local extracted state.

#### Scenario: Popup export flow

- **WHEN** the popup receives a ready profile state and extraction succeeds
- **THEN** the user can preview a summary, select formats, and request downloads.

#### Scenario: Fast popup bootstrap

- **WHEN** the popup opens
- **THEN** it paints a lightweight connecting shell before loading extraction and export
  workflow code.

#### Scenario: Ready profile auto-extraction

- **WHEN** the popup opens on a ready LinkedIn profile tab
- **THEN** it automatically starts one review extraction after first paint without
  requiring the user to reload or click Extract.

#### Scenario: Same-profile cache and explicit refresh

- **WHEN** the popup or side panel already has a cached profile matching the ready
  LinkedIn profile URL
- **THEN** opening the surface or clicking the primary Extract action reuses that cached
  review without starting detail-tab or Voyager recovery again.
- **AND** an explicit refresh action bypasses the same-profile cache and may run the
  bounded LinkedIn recovery pipeline.
- **AND** when the caller is an extension page and multiple profile tabs are open, the
  same browser window's profile tab is selected before an active profile tab in a
  different window.

#### Scenario: Extraction progress and fallback

- **WHEN** profile extraction is requested
- **THEN** the popup or side panel reports request-scoped extraction phases for
  readiness, page preparation, embedded data, LinkedIn internal data, fallback
  extraction, section recovery, detail reads, pagination, deduplication, completion, and
  failures.
- **AND** compact section statuses distinguish complete, recovered, partial, capped,
  unavailable, duplicate-normalized, and budget-limited coverage.
- **AND** unavailable is a final section state only when no accessible items were
  recovered for an advertised or explicitly requested section.

#### Scenario: Bounded internal API reads

- **WHEN** LinkedIn internal profile JSON requests are unavailable, blocked, or slow
- **THEN** the extension bounds each internal fetch, records the attempt reason, and
  falls back to deterministic page extraction instead of waiting indefinitely.
- **AND** for same-profile capped sections, the extension may use bounded temporary
  detail renders after same-page recovery fails, and it removes those temporary surfaces
  after section extraction succeeds or fails.
- **AND** RSC pagination replay state, request bodies, headers, and CSRF material are
  kept out of page-global variables; only sanitized section/count/label recovery events
  are exposed to the extension recovery bridge.
- **AND** bridge requests and responses are bounded by single-use request identifiers,
  random bridge tokens, timeout cleanup, and response validation. Because browser MAIN
  world execution is shared with the host page, this hardening reduces reusable bridge
  exposure but does not treat host-page JavaScript as a secret boundary.

#### Scenario: Current-profile observed endpoint reuse

- **WHEN** the page performance timeline contains observed LinkedIn Voyager profile
  requests
- **THEN** the content script retries only observed GraphQL, Dash URN, Dash
  memberIdentity, or legacy profileView URLs that match the current profile.
- **AND** unrelated observed profile requests are skipped so static fallback endpoints
  are reached without burning the observed-endpoint fetch budget.

#### Scenario: Toolbar action active state

- **WHEN** the active tab is a LinkedIn profile page
- **THEN** the extension action is enabled and visibly marked for profile export; when
  the active tab is not a profile page the action remains clickable but is unbadged and
  opens an unavailable/needs-profile state.

#### Scenario: Runtime content-script recovery

- **WHEN** a LinkedIn profile tab was opened before the extension content script became
  available
- **THEN** the popup or side panel injects the manifest-listed LinkedIn content script
  once, retries the request, and reports a concise unsupported-target error only when
  the browser has no runtime injection API.

### Requirement: Node-testable entrypoints

Extension entrypoints MUST avoid extension API calls outside entrypoint `main` functions
so WXT/Vitest can load modules in Node-backed tests.

#### Scenario: Unit test import

- **WHEN** extension entrypoint modules are imported by tests
- **THEN** import succeeds without a live extension runtime.
