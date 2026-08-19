## 1. Schema

- [x] 1.1 Add optional `identity.contact`, `identity.openTo`, and `identity.causes`
- [x] 1.2 Add optional recommendation `direction`
- [x] 1.3 Add optional interest `kind`
- [x] 1.4 Add optional work `careerBreak` and certification `expirationDate`

## 2. Mapping

- [x] 2.1 Set recommendation `direction` from given/received entities
- [x] 2.2 Set interest `kind` from LinkedIn URL paths
- [x] 2.3 Map certification expiration when an end date exists
- [x] 2.4 Map career-break type when Voyager marks the role

## 3. Tests and docs

- [x] 3.1 Schema and mapper tests for omitted and populated additive fields
- [x] 3.2 Keep host permissions unchanged; document country-host readiness vs scripting
