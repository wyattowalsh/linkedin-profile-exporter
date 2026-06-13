## ADDED Requirements

### Requirement: JSON exports

The exporter SHALL emit canonical JSON and an improved JSON Resume-compatible projection
from the canonical profile schema.

#### Scenario: Canonical JSON export

- **WHEN** a canonical profile fixture is exported as JSON
- **THEN** the output parses as JSON, validates against the canonical schema, and omits
  provenance, confidence, and diagnostics unless the Include all fields setting is
  enabled before export.

#### Scenario: JSON Resume export

- **WHEN** a canonical profile fixture is exported as JSON Resume
- **THEN** the output contains basics, work, education, skills, projects, publications,
  volunteer, awards, languages, interests, certificates, references, and
  LinkedIn-specific metadata such as courses, featured items, organizations, test
  scores, and patents where present, plus a canonical profile copy under exporter
  metadata so LinkedIn-specific fields are not lost in the compatibility projection.

### Requirement: YAML Resume export

The exporter SHALL emit an improved YAML Resume-compatible projection from the canonical
schema.

#### Scenario: YAML export parses

- **WHEN** a profile is exported as YAML
- **THEN** the output parses as YAML and includes resume-compatible top-level sections.

### Requirement: Tabular exports

The exporter SHALL emit simple flat CSV and SHALL emit multi-section tabular data as an
XLSX workbook rather than separate CSV table files.

#### Scenario: CSV export is flat

- **WHEN** a profile is exported as CSV
- **THEN** the output contains a single flat table with section, index, field, value,
  source, and confidence columns.

#### Scenario: XLSX export contains worksheets

- **WHEN** a profile is exported as XLSX
- **THEN** the workbook contains separate worksheets for identity and repeated sections,
  including LinkedIn-specific test scores and patents.

### Requirement: Markdown and XML exports

The exporter SHALL emit compact LLM-context Markdown with structured frontmatter and
separators, and schema-valid XML from the canonical profile schema.

#### Scenario: Markdown frontmatter exists

- **WHEN** a profile is exported as Markdown
- **THEN** the output starts with frontmatter metadata and includes a readable
  resume/profile body with every populated canonical repeat section.

#### Scenario: XML parses

- **WHEN** a profile is exported as XML
- **THEN** the output parses as XML and contains the canonical schema version.

### Requirement: PDF out of scope

The v0.1.0 exporter MUST NOT add PDF export unless a later accepted scope change adds
it.

#### Scenario: Export format registry

- **WHEN** the export format registry is inspected
- **THEN** PDF is absent.
