# LinkedIn Profile Exporter

<img src="assets/icon/linkedin-profile-exporter-icon.png" alt="LinkedIn Profile Exporter icon" width="96" height="96" />

Contract-first browser extension and bookmarklet suite for exporting accessible LinkedIn
profile data to structured local files.

The v0.1.0 release is governed by OpenSpec in
`openspec/changes/ship-linkedin-exporter-v0-1-0/`. The implementation is local-explicit:
settings and extracted data stay in the browser by default, no analytics or remote
service is used, and tests run against deterministic fixtures rather than live LinkedIn
accounts.

## Targets

- WXT extension for Chrome/Chromium, Edge, Firefox, Safari, and documented mobile
  packaging paths.
- Bookmarklet exporter for low-friction local page export where browser/content-security
  policy allows it.
- Canonical profile schema with LinkedIn-specific sections such as courses, featured
  items, organizations, interests, test scores, and patents, plus JSON, JSON Resume,
  YAML Resume, CSV, XLSX, XML, and compact LLM Markdown exporters. Provenance,
  confidence, and diagnostics are available through the opt-in Include all fields
  setting.
- Fumadocs product documentation, generated assets, web-store materials, CI, hooks, and
  Justfile validation.

## Local Commands

After the workspace is installed:

```bash
pnpm install
just quick
just ci
pnpm test:e2e
```

Package GitHub Release assets after a clean release gate:

```bash
mise exec node@24 -- pnpm release:github:package
```

The package command creates a credential-free draft-release packet under
`.release/github/v0.1.0/` with browser extension ZIPs, bookmarklet assets, Firefox
source-review material, checksums, release notes, and a generated
`gh release create --draft --verify-tag` command.

Use `just openspec` after public behavior, docs-generation, file-structure,
asset-format, validation, or agent-instruction changes.
