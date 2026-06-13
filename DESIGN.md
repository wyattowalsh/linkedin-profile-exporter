# Design

## Product Tone

The product is utilitarian, local-first, and review-focused. It should feel like a
precise browser tool for people who need structured profile data, not a marketing site.

## Typography

- Prefer Monaspice or Monaspace variants where available, with system UI fallbacks.
- Use compact headings inside extension surfaces.
- Do not scale font sizes with viewport width.

## Color

- Use a balanced neutral base with green and blue accents for trust, readiness, and
  export actions.
- Avoid one-note palettes dominated by a single hue family.
- Reserve warning and error colors for diagnostics.

## Layout

- Popup and settings surfaces prioritize scanning, comparison, and repeated action.
- Use tabs for major views, segmented controls for modes, checkboxes/toggles for binary
  settings, and icon buttons for familiar actions.
- Keep cards for repeated profile/export items only. Do not nest cards.

## Iconography

- Use lucide icons in extension controls where available.
- The project mark is a generated, text-free transparent PNG of a LinkedIn-blue profile
  card producing a compact exported spreadsheet grid. Use the canonical PNG for
  docs/README/social contexts and generated PNG sizes for extension manifests and
  toolbar surfaces.

## Motion

- Use short, purposeful motion for extraction progress and diagnostics reveal.
- Avoid decorative motion that obscures data or changes layout.

## Accessibility

- Controls must have accessible labels.
- Color cannot be the only state indicator.
- Text must not overlap or overflow fixed controls.
- Fixture pages and extension UI should remain keyboard navigable.
