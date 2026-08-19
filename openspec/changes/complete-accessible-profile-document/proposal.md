## Why

Paged recovery already completes visible profile sections. The canonical schema still
cannot represent contact overlay fields, recommendation direction, interest tab kind,
open-to status, career-break type, or certification expiration, so those accessible
profile facts are dropped even when Voyager or the details page exposes them.

## What Changes

- Add optional canonical fields: `identity.contact`, `identity.openTo`,
  `identity.causes`, recommendation `direction`, interest `kind`, work `careerBreak`,
  certification `expirationDate`.
- Map given vs received recommendations onto `direction` from recommendee vs recommender
  entities and recommendation type fields. `q=given` / `q=received` remain the extension
  fetch already performed for those collections.
- Map interest URLs onto `kind` (`topVoice`, `company`, `group`, `newsletter`, `school`)
  when the path is unambiguous.
- **Do not** widen `host_permissions` in this change. Country-host readiness remains
  detection-only until a later store-review change.

No activity feed, connection lists, messaging, analytics, Recruiter, or Sales Navigator.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `profile-schema`: Additive optional fields for contact, open-to, causes,
  recommendation direction, interest kind, career-break, and certification expiration.
- `profile-extraction`: Map those fields from Voyager and structured DOM when present;
  omit them when absent.

## Impact

- `packages/core` schema, Voyager mapper, DOM extractor, tests.
- Existing fixtures remain valid because every new field is optional.
- Extension host permissions stay `https://www.linkedin.com/in/*`.
