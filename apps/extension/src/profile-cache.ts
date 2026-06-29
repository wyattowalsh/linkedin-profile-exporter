import type { Profile } from "@linkedin-profile-exporter/core/schema";

export const INCOMPLETE_CACHE_REFRESH_COOLDOWN_MS = 10 * 60_000;
const KNOWN_SECTION_CAPS: Record<string, number> = {
  courses: 20,
  featured: 20,
  projects: 20,
  skills: 20
};

export function profileUrlsMatch(left: string | undefined, right: string | undefined): boolean {
  const normalizedLeft = normalizeProfileUrl(left);
  const normalizedRight = normalizeProfileUrl(right);
  return Boolean(normalizedLeft && normalizedRight && normalizedLeft === normalizedRight);
}

export function normalizeProfileUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (!/^(.+\.)?linkedin\.com$/i.test(url.hostname)) return undefined;
    const match = url.pathname.match(/^\/in\/([^/]+)/i);
    if (!match?.[1]) return undefined;
    return `https://www.linkedin.com/in/${decodeURIComponent(match[1]).toLowerCase()}`;
  } catch {
    return undefined;
  }
}

export function shouldRefreshIncompleteCachedProfile(
  profile: Profile,
  refreshedAt: number | undefined,
  now = Date.now()
): boolean {
  if (!hasIncompleteCoverageDiagnostics(profile)) return false;
  if (isRecentTimestamp(refreshedAt, now)) return false;
  if (isRecentTimestamp(Date.parse(profile.metadata.capturedAt), now)) return false;
  return true;
}

export function hasIncompleteCoverageDiagnostics(profile: Profile): boolean {
  const diagnosticCodes = new Set(profile.diagnostics.map((diagnostic) => diagnostic.code));
  return (
    Array.from(diagnosticCodes).some((code) => {
      const coverageMatch = /^coverage\.([^.]+)\.(partial|capped)$/.exec(code);
      if (coverageMatch?.[1])
        return !sectionHasResolvedCoverage(profile, diagnosticCodes, coverageMatch[1]);
      const voyagerMatch = /^linkedin-voyager\.([^.]+)\.(partial|possibly-capped)$/.exec(code);
      if (voyagerMatch?.[1])
        return !sectionHasResolvedCoverage(profile, diagnosticCodes, voyagerMatch[1]);
      return false;
    }) || diagnosticCodes.has("coverage.budget.exhausted")
  );
}

function sectionHasResolvedCoverage(
  profile: Profile,
  diagnosticCodes: Set<string>,
  section: string
): boolean {
  if (diagnosticCodes.has(`coverage.${section}.complete`)) return true;
  if (
    !diagnosticCodes.has(`coverage.${section}.recovered`) &&
    !diagnosticCodes.has(`linkedin-voyager.${section}.recovered`)
  ) {
    return false;
  }
  const knownCap = KNOWN_SECTION_CAPS[section];
  return !knownCap || profileSectionCount(profile, section) > knownCap;
}

function profileSectionCount(profile: Profile, section: string): number {
  if (section === "licensesCertifications") return profile.licensesCertifications.length;
  if (section === "honorsAwards") return profile.honorsAwards.length;
  if (section === "testScores") return profile.testScores.length;
  const value = profile[section as keyof Profile];
  return Array.isArray(value) ? value.length : 0;
}

function isRecentTimestamp(value: number | undefined, now: number): boolean {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    now >= value &&
    now - value <= INCOMPLETE_CACHE_REFRESH_COOLDOWN_MS
  );
}
