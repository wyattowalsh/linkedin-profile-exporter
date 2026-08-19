## ADDED Requirements

### Requirement: Map additive accessible profile fields

Extraction SHALL populate the additive optional schema fields when Voyager entities or
structured DOM fields expose them, and SHALL omit them when they are not accessible.
Extraction SHALL NOT invent contact, open-to, causes, direction, kind, career-break, or
expiration values from unrelated page text.

#### Scenario: Interest kind from LinkedIn URL

- **WHEN** DOM or Voyager interest URLs include `/company/`, `/groups/`, `/newsletter/`,
  `/newsletters/`, `/school/`, or a member `/in/` top-voice path
- **THEN** the extracted interest includes the matching `kind`

#### Scenario: Non-LinkedIn interest hosts omit kind

- **WHEN** an interest URL uses a non-LinkedIn host, including paths that contain
  `/company/` or other tab tokens
- **THEN** the extracted interest omits `kind`

#### Scenario: Recommendation direction from given entity

- **WHEN** a Voyager recommendation entity includes a recommendee and no recommender, or
  has a given recommendation type
- **THEN** the extracted recommendation `direction` is `given`

#### Scenario: Recommendation direction from received entity

- **WHEN** a Voyager recommendation entity includes a recommender and no recommendee, or
  has a received recommendation type
- **THEN** the extracted recommendation `direction` is `received`

#### Scenario: Ambiguous recommendation sides omit direction

- **WHEN** a recommendation entity has both recommender and recommendee sides, or
  neither side, and no given/received type
- **THEN** the extracted recommendation omits `direction`

The extension MAY fetch given and received recommendation collections with `q=given` and
`q=received`. Direction mapping SHALL use entity shape and type fields because those
JSON bodies do not include the request query.

#### Scenario: Identity extras from structured keys

- **WHEN** Voyager contact, open-to, or causes keys are present
- **THEN** extraction copies those values onto identity
- **AND** when those keys are absent, identity omits `contact`, `openTo`, and `causes`

#### Scenario: Contact overlay stays distinct from profile location

- **WHEN** a Voyager profile entity has `address` and a contact overlay also has `address`
- **THEN** identity location still uses the profile entity address or location name
- **AND** `identity.contact.address` uses only the contact overlay or contact entity

#### Scenario: Identity causes stay distinct from volunteering cause

- **WHEN** profile-level `causes`, `supportedCauses`, or `volunteerCauses` are present
- **THEN** those labels populate `identity.causes`
- **AND** volunteering items keep their own `cause` values

#### Scenario: Certification dates never use Present

- **WHEN** a certification start or end value is `Present`, or start and end are the same
  display string
- **THEN** extraction omits `expirationDate` and does not store `Present` on `date`
