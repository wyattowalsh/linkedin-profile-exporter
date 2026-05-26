## ADDED Requirements

### Requirement: LinkedIn profile readiness
The product SHALL determine whether the active document or active tab is a LinkedIn profile page and expose ready, unavailable, and needs-action states.

#### Scenario: Profile URL is ready
- **WHEN** the current URL matches a LinkedIn member profile path and the document has profile content
- **THEN** the product reports a ready state with the detected profile URL.

#### Scenario: Non-profile URL is unavailable
- **WHEN** the current URL is not a LinkedIn profile path
- **THEN** the product reports an unavailable state without attempting profile export.

### Requirement: Accessible profile data extraction
The extraction engine SHALL collect accessible profile data from visible DOM content, rendered client state, page metadata, and lazy-loaded sections exposed by the page.

#### Scenario: Dense fixture extraction
- **WHEN** extraction runs against a dense local profile fixture
- **THEN** identity, about, work, education, skills, certifications, projects, publications, volunteering, honors, languages, courses, recommendations, featured items, organizations, interests, links, and accessible imagery metadata are returned.

#### Scenario: Sparse fixture extraction
- **WHEN** extraction runs against a sparse local profile fixture with missing optional sections
- **THEN** required identity fields are returned and missing optional sections are represented as empty arrays or omitted optional fields according to the canonical schema.

### Requirement: Expansion and rescan automation
The extraction workflow SHALL support configurable scrolling, show-more expansion, and rescanning until completion criteria are met.

#### Scenario: Hidden section becomes visible
- **WHEN** the page contains expandable section controls and automation is enabled
- **THEN** the extractor clicks available controls, rescans content, and records automation diagnostics.

### Requirement: Provenance and confidence
Every extracted field that is synthesized from the page SHALL be able to carry source provenance and confidence metadata.

#### Scenario: Field source is recorded
- **WHEN** a work-history title is extracted from a fixture section
- **THEN** the title value includes source type, selector or source key when available, confidence, and capture timestamp.

### Requirement: Deterministic fixture-first behavior
Automated tests SHALL validate extraction against local fixtures or recorded pages and MUST NOT require a live LinkedIn account.

#### Scenario: CI extraction tests
- **WHEN** CI runs extraction tests
- **THEN** all extraction assertions use local fixtures or local harness pages.
