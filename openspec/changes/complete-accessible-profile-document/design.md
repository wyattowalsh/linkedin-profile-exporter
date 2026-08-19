## Context

Paged recovery is handled separately. This follow-up only adds optional canonical fields
so accessible profile facts are not dropped. Host-permission expansion for country
LinkedIn hosts is deferred; URL readiness may recognize those hosts.

## Goals / Non-Goals

**Goals:**

- Additive optional schema fields with fixture tests.
- Map recommendation `direction` and interest `kind` from existing Voyager/DOM data.
- Map contact, open-to, causes, career-break, and certification expiration from
  structured keys only.

**Non-Goals:**

- Widening `host_permissions`.
- Activity, messaging, analytics, Recruiter, Sales Navigator.
- Contact overlay automation that requires live LinkedIn.
- Wrapping Voyager payloads with request URLs so the mapper can see `q=`.

## Decisions

1. Every new field is optional so existing fixtures and exports stay valid.
2. `direction` and `kind` are enums. Unknown values are omitted rather than stored as
   free text.
3. Recommendation direction uses entity shape (`recommendee` vs `recommender`, or
   `recommendationType` / `type`). Collection query `q=` is fetch-only.
4. Contact overlay scraping waits for a deterministic fixture; the schema and
   structured-key mapper are in place first.
5. Host permissions stay `www.linkedin.com/in/*` until a store-review change.
6. Certification dates filter `/present/i` and omit expiration when start and end match.
   End-only values stay on `date`. Work `dateRange` may still synthesize `Present`.
7. Contact IM prefers `imAccountName` / `username`, then a non-URN `id`. Birthdays keep
   month-day when year is absent. Identity causes also read `volunteerCauses`.

## Risks / Trade-offs

- Given recommendations may lack a recommender name; keep the existing display name
  fallback.
- Interest URL heuristics can mis-label unusual paths; omit `kind` when ambiguous.
- DOM-only interest recovery in the content script may omit `kind` until Voyager URLs
  are present.

## Migration Plan

None. Optional fields only.

## Open Questions

None.
