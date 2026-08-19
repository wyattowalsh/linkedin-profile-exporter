## ADDED Requirements

### Requirement: Optional contact overlay fields

The canonical identity object MAY include a `contact` object with optional `email`,
`phone`, `im`, `birthday`, and `address` strings when those values are accessible from
the signed-in profile overlay or Voyager contact entities. Absent values SHALL be
omitted. Profile-entity location `address` SHALL NOT be copied into `identity.contact`.

#### Scenario: Missing contact stays omitted

- **WHEN** a profile fixture has no contact overlay and no Voyager contact entities
- **THEN** the canonical identity has no `contact` object

### Requirement: Optional open-to chips

Identity MAY include `openTo` as an array of short labels when Open-to chips are visible
on the current profile. `openTo` SHALL be omitted when those chips are not exposed.

#### Scenario: No open-to chips

- **WHEN** the profile document does not expose Open-to labels
- **THEN** `identity.openTo` is omitted

### Requirement: Optional identity causes

Identity MAY include `causes` as an array of short labels when profile-level supported
causes are exposed as structured fields. Identity causes SHALL remain distinct from
volunteering item `cause` values.

#### Scenario: No identity causes

- **WHEN** the profile document does not expose profile-level causes
- **THEN** `identity.causes` is omitted

#### Scenario: Structured identity causes are retained

- **WHEN** Voyager or structured DOM fields expose profile-level causes
- **THEN** `identity.causes` contains those labels and volunteering items still keep
  their own `cause` values

### Requirement: Recommendation direction

Each recommendation MAY include `direction` of `received` or `given`. Extraction SHALL
set `given` when the entity is a recommendee-side item or has a given recommendation
type, and `received` when it is a recommender-side item or has a received recommendation
type. Direction SHALL be omitted when both sides are present, neither side is present,
and no given/received type is available.

#### Scenario: Given and received recommendations coexist

- **WHEN** supplemental Voyager payloads include both received-side and given-side
  recommendation entities
- **THEN** the canonical recommendations array retains both items with distinct
  `direction` values

### Requirement: Interest kind

Each interest MAY include `kind` of `topVoice`, `company`, `group`, `newsletter`, or
`school` when the interest URL path identifies that tab on a LinkedIn host, including
`/newsletter/` and `/newsletters/`. Non-LinkedIn hosts SHALL omit `kind`.

#### Scenario: Company interest URL

- **WHEN** an interest URL is `https://www.linkedin.com/company/example/`
- **THEN** the interest `kind` is `company`

### Requirement: Career-break type

A work item MAY include `careerBreak` as a short type label when Voyager or the details
page marks the role as a career break via structured keys (`careerBreak`,
`careerBreakType`, or `$type` / `$recipeType` / `$recipeTypes` matching career-break).
Ordinary roles SHALL omit `careerBreak`. Description text SHALL NOT mark a career break.

#### Scenario: Ordinary roles omit careerBreak

- **WHEN** a work item is a normal position
- **THEN** `careerBreak` is omitted

### Requirement: Certification expiration

A certification MAY include `expirationDate` as a display date string when Voyager or
the details page exposes an end or expiration date distinct from the issue date.
`Present` SHALL NOT appear on certification `date` or `expirationDate`. End-only values
remain on `date`. Same start and end strings omit `expirationDate`.

#### Scenario: Start-only certifications omit expirationDate

- **WHEN** a certification has only an issue year
- **THEN** `expirationDate` is omitted
