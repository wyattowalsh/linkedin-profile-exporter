## ADDED Requirements

### Requirement: Map additive accessible profile fields

Extraction SHALL populate the additive optional schema fields when Voyager entities or
structured DOM fields expose them, and SHALL omit them when they are not accessible.
Extraction SHALL NOT invent contact, open-to, causes, direction, kind, career-break, or
expiration values from unrelated page text.

#### Scenario: Interest kind from LinkedIn URL

- **WHEN** DOM or Voyager interest URLs include `/company/`, `/groups/`, `/newsletter/`,
  `/school/`, or a member `/in/` top-voice path
- **THEN** the extracted interest includes the matching `kind`

#### Scenario: Recommendation direction from given entity

- **WHEN** a Voyager recommendation entity includes a recommendee and no recommender, or
  has a given recommendation type
- **THEN** the extracted recommendation `direction` is `given`

The extension MAY fetch given and received recommendation collections with `q=given` and
`q=received`. Direction mapping SHALL use entity shape and type fields because those
JSON bodies do not include the request query.

#### Scenario: Identity extras from structured keys

- **WHEN** Voyager contact, open-to, or causes keys are present
- **THEN** extraction copies those values onto identity
- **AND** when those keys are absent, identity omits `contact`, `openTo`, and `causes`
