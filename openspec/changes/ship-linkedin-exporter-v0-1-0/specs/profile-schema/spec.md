## ADDED Requirements

### Requirement: Versioned canonical schema
The project SHALL define a versioned canonical profile export schema implemented with Zod.

#### Scenario: Valid profile accepted
- **WHEN** a valid canonical profile fixture is parsed
- **THEN** schema validation succeeds and preserves the schema version.

#### Scenario: Invalid profile rejected
- **WHEN** an invalid profile fixture omits required identity data or uses invalid field types
- **THEN** schema validation fails with structured Zod issues.

### Requirement: Resume-compatible synthesis
The canonical schema SHALL synthesize JSON Resume, YAML Resume, LinkedIn-specific fields, and additional useful profile fields without making any external format the internal source of truth.

#### Scenario: LinkedIn-specific fields coexist with resume fields
- **WHEN** a profile contains LinkedIn recommendations and JSON Resume work history
- **THEN** both are represented in the canonical schema without loss.

### Requirement: Field metadata
The canonical schema SHALL support field-level provenance, confidence, diagnostics, source URLs, capture metadata, and export metadata.

#### Scenario: Confidence metadata validates
- **WHEN** a field includes provenance and confidence metadata within the accepted range
- **THEN** schema validation succeeds.
