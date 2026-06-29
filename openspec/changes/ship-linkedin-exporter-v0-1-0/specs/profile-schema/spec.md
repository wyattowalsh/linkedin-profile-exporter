## ADDED Requirements

### Requirement: Versioned canonical schema

The project SHALL define a versioned canonical profile export schema implemented with
Zod.

#### Scenario: Valid profile accepted

- **WHEN** a valid canonical profile fixture is parsed
- **THEN** schema validation succeeds and preserves the schema version.

#### Scenario: Invalid profile rejected

- **WHEN** an invalid profile fixture omits required identity data or uses invalid field
  types
- **THEN** schema validation fails with structured Zod issues.

### Requirement: Resume-compatible synthesis

The canonical schema SHALL synthesize JSON Resume, YAML Resume, LinkedIn-specific
fields, and additional useful profile fields without making any external format the
internal source of truth.

#### Scenario: LinkedIn-specific fields coexist with resume fields

- **WHEN** a profile contains LinkedIn recommendations, test scores, patents, featured
  item media metadata, course numbers, work-history company metadata, nested role
  location/employment metadata, education school metadata, project contributors,
  publication authors, volunteer causes, organization detail fields, interest URLs,
  imagery, and JSON Resume work history
- **THEN** all supported LinkedIn-specific profile sections are represented in the
  canonical schema without loss.

### Requirement: Field metadata

The canonical schema SHALL support field-level provenance, confidence, diagnostics,
source URLs, capture metadata, and export metadata.

#### Scenario: Confidence metadata validates

- **WHEN** a field includes provenance and confidence metadata within the accepted range
- **THEN** schema validation succeeds.

#### Scenario: Clean export view

- **WHEN** default settings are applied before canonical JSON export
- **THEN** field provenance, confidence, diagnostics, and verbose inventory details are
  omitted.
- **AND** Include all fields restores provenance, confidence, and normal diagnostics,
  while verbose inventory details require the separate Verbose diagnostics setting.
