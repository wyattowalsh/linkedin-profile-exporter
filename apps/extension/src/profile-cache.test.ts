import { describe, expect, it } from "vitest";
import type { Diagnostic, Profile } from "@linkedin-profile-exporter/core/schema";
import {
  hasIncompleteCoverageDiagnostics,
  normalizeProfileUrl,
  profileUrlsMatch,
  shouldRefreshIncompleteCachedProfile
} from "./profile-cache";

const NOW = Date.parse("2026-06-25T12:00:00.000Z");
const OLD_CAPTURED_AT = "2026-06-25T11:00:00.000Z";
const RECENT_CAPTURED_AT = "2026-06-25T11:55:00.000Z";

describe("profile cache freshness", () => {
  it("normalizes LinkedIn profile URLs for same-page cache checks", () => {
    expect(normalizeProfileUrl("https://www.linkedin.com/in/Alex-Rivera/?miniProfileUrn=abc")).toBe(
      "https://www.linkedin.com/in/alex-rivera"
    );
    expect(
      profileUrlsMatch(
        "https://www.linkedin.com/in/alex-rivera/",
        "https://www.linkedin.com/in/Alex-Rivera?trk=profile"
      )
    ).toBe(true);
    expect(
      profileUrlsMatch("https://www.linkedin.com/feed/", "https://www.linkedin.com/in/a/")
    ).toBe(false);
    expect(
      profileUrlsMatch(
        "https://example.com/in/alex-rivera/",
        "https://www.linkedin.com/in/alex-rivera/"
      )
    ).toBe(false);
  });

  it("refreshes an old unresolved capped priority-section cache", () => {
    const profile = profileWithDiagnostics([
      diagnostic("coverage.skills.capped"),
      diagnostic("coverage.budget.exhausted")
    ]);

    expect(hasIncompleteCoverageDiagnostics(profile)).toBe(true);
    expect(shouldRefreshIncompleteCachedProfile(profile, undefined, NOW)).toBe(true);
  });

  it("does not let recovered mask unresolved capped priority sections", () => {
    const profile = profileWithDiagnostics([
      diagnostic("coverage.skills.capped"),
      diagnostic("coverage.skills.recovered"),
      diagnostic("coverage.courses.partial"),
      diagnostic("coverage.courses.complete")
    ]);

    expect(hasIncompleteCoverageDiagnostics(profile)).toBe(true);
    expect(shouldRefreshIncompleteCachedProfile(profile, undefined, NOW)).toBe(true);
  });

  it("treats recovered priority sections beyond the default cap as resolved", () => {
    const profile = profileWithDiagnostics(
      [
        diagnostic("coverage.skills.capped"),
        diagnostic("coverage.skills.recovered"),
        diagnostic("coverage.courses.partial"),
        diagnostic("coverage.courses.complete")
      ],
      {
        skills: Array.from({ length: 21 }, (_, index) => ({ name: `Skill ${index + 1}` }))
      }
    );

    expect(hasIncompleteCoverageDiagnostics(profile)).toBe(false);
    expect(shouldRefreshIncompleteCachedProfile(profile, undefined, NOW)).toBe(false);
  });

  it("uses capturedAt as a persistent cooldown after popup unload", () => {
    const profile = profileWithDiagnostics([diagnostic("coverage.budget.exhausted")], {
      capturedAt: RECENT_CAPTURED_AT
    });

    expect(hasIncompleteCoverageDiagnostics(profile)).toBe(true);
    expect(shouldRefreshIncompleteCachedProfile(profile, undefined, NOW)).toBe(false);
  });

  it("does not treat future capturedAt values as a freshness cooldown", () => {
    const profile = profileWithDiagnostics([diagnostic("coverage.budget.exhausted")], {
      capturedAt: "2026-06-25T12:05:00.000Z"
    });

    expect(shouldRefreshIncompleteCachedProfile(profile, undefined, NOW)).toBe(true);
  });

  it("uses the in-memory cooldown while a popup session is alive", () => {
    const profile = profileWithDiagnostics([diagnostic("coverage.budget.exhausted")], {
      capturedAt: OLD_CAPTURED_AT
    });

    expect(shouldRefreshIncompleteCachedProfile(profile, NOW - 5 * 60_000, NOW)).toBe(false);
    expect(shouldRefreshIncompleteCachedProfile(profile, NOW - 11 * 60_000, NOW)).toBe(true);
  });

  it("treats unresolved capped or partial diagnostics from any section as incomplete", () => {
    expect(
      hasIncompleteCoverageDiagnostics(
        profileWithDiagnostics([diagnostic("coverage.featured.capped")])
      )
    ).toBe(true);
    expect(
      hasIncompleteCoverageDiagnostics(
        profileWithDiagnostics([diagnostic("coverage.work.partial")])
      )
    ).toBe(true);
    expect(
      hasIncompleteCoverageDiagnostics(
        profileWithDiagnostics([
          diagnostic("coverage.featured.capped"),
          diagnostic("coverage.featured.recovered")
        ])
      )
    ).toBe(true);
  });
});

function profileWithDiagnostics(
  diagnostics: Diagnostic[],
  overrides: { capturedAt?: string; skills?: Profile["skills"] } = {}
): Profile {
  return {
    schemaVersion: "linkedin-profile-exporter.profile.v1",
    identity: {
      name: "Alex Rivera",
      profileUrl: "https://www.linkedin.com/in/alex-rivera/",
      links: []
    },
    work: [],
    education: [],
    skills: overrides.skills ?? [],
    licensesCertifications: [],
    projects: [],
    publications: [],
    volunteering: [],
    honorsAwards: [],
    testScores: [],
    patents: [],
    languages: [],
    courses: [],
    recommendations: [],
    featured: [],
    organizations: [],
    interests: [],
    metadata: {
      capturedAt: overrides.capturedAt ?? OLD_CAPTURED_AT,
      sourceUrl: "https://www.linkedin.com/in/alex-rivera/",
      generator: "linkedin-profile-exporter"
    },
    diagnostics,
    exportMetadata: {
      formats: ["json", "markdown"],
      filenameTemplate: "{name}-{date}-{format}"
    }
  };
}

function diagnostic(code: string): Diagnostic {
  return {
    code,
    level: code.includes("complete") || code.includes("recovered") ? "info" : "warning",
    message: code,
    source: "linkedin-voyager"
  };
}
