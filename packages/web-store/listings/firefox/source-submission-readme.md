# Firefox Source Review Build Notes

This source-review package is intended to accompany the Firefox add-on ZIP in the
GitHub Release packet and AMO submission.

## Environment

- Node.js 24
- pnpm 10.13.1
- Ubuntu, macOS, or another local environment capable of running WXT builds

## Build

```bash
pnpm install --frozen-lockfile
pnpm --filter @linkedin-profile-exporter/extension build:firefox
```

The Firefox extension output is written to:

```text
apps/extension/.output/firefox-mv2
```

## Review Notes

- The extension does not load remote executable code.
- The extension defaults to local settings and local review/export workflows.
- The LinkedIn host match is limited to `https://www.linkedin.com/in/*`.
- The Firefox manifest declares no required data collection through
  `browser_specific_settings.gecko.data_collection_permissions.required`.
