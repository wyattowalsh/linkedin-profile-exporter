# Core Package Instructions

- `packages/core` owns the canonical profile schema, extraction behavior, settings validation, diagnostics, and export projections.
- Do not make JSON Resume, YAML Resume, LinkedIn DOM selectors, or web-store metadata the internal source of truth.
- Preserve field provenance and confidence when transforming extracted data.
