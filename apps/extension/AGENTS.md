# Extension Instructions

- WXT entrypoints must avoid browser-extension API calls at module top level.
- Keep browser API usage inside WXT `main` functions, command handlers, or injectable adapters.
- Use target-specific WXT build output for manifest validation instead of assuming one manifest fits every browser.
- Do not request broad host permissions beyond LinkedIn profile pages without an OpenSpec update.
- Do not persist extracted profile data longer than local review/export workflows require.
