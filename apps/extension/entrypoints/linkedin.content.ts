import {
  detectLinkedInProfileReadiness,
  extractProfileFromDocument
} from "@linkedin-profile-exporter/core/extraction";
import { extractProfileFromVoyagerPayload } from "@linkedin-profile-exporter/core/linkedin-voyager";
import type { Profile } from "@linkedin-profile-exporter/core/schema";
import {
  applyProfileSettings,
  shouldIncludeVerboseDiagnostics,
  type Settings
} from "@linkedin-profile-exporter/core/settings";
import { browser } from "wxt/browser";
import { defineContentScript } from "wxt/utils/define-content-script";
import type {
  ExtractionPhase,
  ExtractionStatus,
  RuntimeMessage,
  RuntimeResponse
} from "../src/messaging";

interface VoyagerEndpoint {
  source: string;
  path: string;
  supplementalPaths?: string[];
}

interface VoyagerAttempt {
  source: string;
  status?: number;
  reason?: string;
}

interface VoyagerResource {
  order: number;
  size: number;
  url: URL;
}

interface RankedVoyagerEndpoint extends VoyagerEndpoint {
  order: number;
  priority: number;
  size: number;
}

interface VoyagerCandidateEvaluation {
  profile: Profile | null;
  reason?: string;
}

const DASH_FULL_PROFILE_DECORATION =
  "com.linkedin.voyager.dash.deco.identity.profile.FullProfileWithEntities-93";
const IDENTITY_DASH_PROFILES_QUERY_PREFIX = "voyagerIdentityDashProfiles.";
const PROFILE_READINESS_TIMEOUT_MS = 800;
const VOYAGER_ENDPOINT_LIMIT = 6;
const VOYAGER_FETCH_TIMEOUT_MS = 2_500;
const VOYAGER_TOTAL_TIMEOUT_MS = 5_500;

export default defineContentScript({
  matches: ["https://www.linkedin.com/in/*"],
  runAt: "document_idle",
  main() {
    browser.runtime.onMessage.addListener(
      (message: RuntimeMessage): Promise<RuntimeResponse> | undefined => {
        if (message.type === "profile-readiness") {
          return waitForProfileContent(PROFILE_READINESS_TIMEOUT_MS).then(() => ({
            ok: true as const,
            readiness: detectLinkedInProfileReadiness(document)
          }));
        }
        if (message.type === "extract-profile") {
          const requestId = message.requestId ?? createExtractionRequestId();
          reportExtractionStatus(
            requestId,
            "checking-readiness",
            "Checking profile",
            "Confirming the active LinkedIn tab."
          );
          return waitForProfileContent()
            .then(assertProfileReady)
            .then(() => {
              reportExtractionStatus(
                requestId,
                "preparing-page",
                "Preparing profile page",
                "Opening accessible profile sections."
              );
              return prepareAccessibleSections(message.settings);
            })
            .then(assertProfileReady)
            .then(() => extractProfile(message.settings, requestId))
            .then((profile) => {
              reportExtractionStatus(requestId, "complete", "Extraction complete");
              return {
                ok: true as const,
                profile: applyProfileSettings(profile, message.settings)
              };
            })
            .catch((error: unknown) => {
              const message = error instanceof Error ? error.message : String(error);
              reportExtractionStatus(requestId, "failed", "Extraction failed", message);
              return {
                ok: false,
                error: message
              };
            });
        }
        return undefined;
      }
    );
  }
});

async function extractProfile(settings: Settings, requestId: string): Promise<Profile> {
  const attempts: VoyagerAttempt[] = [];
  const verboseDiagnostics = shouldIncludeVerboseDiagnostics(settings);
  reportExtractionStatus(
    requestId,
    "reading-embedded-data",
    "Reading page data",
    "Checking embedded LinkedIn profile state."
  );
  const embedded = extractViaEmbeddedVoyagerState(attempts, verboseDiagnostics);
  if (embedded) return embedded;

  reportExtractionStatus(
    requestId,
    "reading-linkedin-data",
    "Reading LinkedIn data",
    "Trying same-page internal profile JSON."
  );
  const voyager = await extractViaVoyagerApi(attempts, verboseDiagnostics);
  if (voyager) return voyager;
  reportExtractionStatus(
    requestId,
    "using-page-fallback",
    "Using page fallback",
    "Reading accessible profile text from the page."
  );
  const profile = extractProfileFromDocument(document, { settings });
  profile.diagnostics.push({
    code: "linkedin-voyager.unavailable",
    level: "warning",
    message: `LinkedIn internal profile JSON was unavailable, so DOM extraction was used.${voyagerAttemptSummary(attempts)}`,
    source: "linkedin-voyager"
  });
  return profile;
}

function extractViaEmbeddedVoyagerState(
  attempts: VoyagerAttempt[],
  verboseDiagnostics: boolean
): Profile | null {
  const profileId = profileIdFromLocation();
  if (!profileId) return null;

  const candidates = Array.from(document.querySelectorAll<HTMLElement>('code[id^="bpr-guid-"]'))
    .map((element) => element.textContent)
    .filter((text): text is string =>
      Boolean(text && /included|positionView|educationView|profilePositionGroups/i.test(text))
    );

  for (const candidate of candidates) {
    try {
      const payload = JSON.parse(candidate) as unknown;
      const evaluation = evaluateVoyagerCandidate(payload, {
        profileId,
        source: "linkedin-voyager.embedded",
        verboseDiagnostics
      });
      if (evaluation.profile) return evaluation.profile;
      attempts.push({
        source: "linkedin-voyager.embedded",
        reason: evaluation.reason ?? "candidate was rejected"
      });
    } catch (error) {
      attempts.push({ source: "linkedin-voyager.embedded", reason: errorMessage(error) });
    }
  }

  return null;
}

async function extractViaVoyagerApi(
  attempts: VoyagerAttempt[],
  verboseDiagnostics: boolean
): Promise<Profile | null> {
  const profileId = profileIdFromLocation();
  if (!profileId) return null;
  const deadline = Date.now() + VOYAGER_TOTAL_TIMEOUT_MS;

  for (const endpoint of voyagerEndpoints(profileId)) {
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      attempts.push({
        source: "linkedin-voyager.api",
        reason: "same-page internal API budget elapsed"
      });
      break;
    }
    try {
      const profilePayload = await voyagerFetch(endpoint.path, remainingMs);
      const supplementalTimeoutMs = Math.max(250, deadline - Date.now());
      const supplementalPayloads = await Promise.all(
        (endpoint.supplementalPaths ?? []).map((path) =>
          voyagerFetchOptional(path, supplementalTimeoutMs)
        )
      );
      const evaluation = evaluateVoyagerCandidate(profilePayload, {
        profileId,
        source: endpoint.source,
        supplementalPayloads: supplementalPayloads.filter((payload): payload is unknown =>
          Boolean(payload)
        ),
        verboseDiagnostics
      });
      if (evaluation.profile) return evaluation.profile;
      attempts.push({
        source: endpoint.source,
        reason: evaluation.reason ?? "candidate was rejected"
      });
    } catch (error) {
      attempts.push({ source: endpoint.source, ...voyagerFailure(error) });
    }
  }

  return null;
}

async function voyagerFetchOptional(path: string, timeoutMs: number): Promise<unknown | null> {
  try {
    return await voyagerFetch(path, timeoutMs);
  } catch {
    return null;
  }
}

async function voyagerFetch(path: string, timeoutMs = VOYAGER_FETCH_TIMEOUT_MS): Promise<unknown> {
  const csrfToken = csrfTokenFromCookie();
  if (!csrfToken) throw new Error("LinkedIn session CSRF token is unavailable.");

  const url = path.startsWith("https://") ? path : `https://www.linkedin.com/voyager/api${path}`;
  const controller = new AbortController();
  const timeout = window.setTimeout(
    () => controller.abort(),
    Math.min(timeoutMs, VOYAGER_FETCH_TIMEOUT_MS)
  );
  let response: Response;
  try {
    response = await fetch(url, {
      credentials: "include",
      headers: {
        accept: "application/vnd.linkedin.normalized+json+2.1",
        "csrf-token": csrfToken,
        "x-restli-protocol-version": "2.0.0"
      },
      method: "GET",
      mode: "cors",
      referrer: document.location.href,
      signal: controller.signal
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error("LinkedIn internal API timed out.");
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
  if (!response.ok) {
    const error = new Error(`LinkedIn internal API returned ${response.status}.`) as Error & {
      status?: number;
    };
    error.status = response.status;
    throw error;
  }
  return response.json();
}

function reportExtractionStatus(
  requestId: string,
  phase: ExtractionPhase,
  label: string,
  detail?: string
): void {
  const status: ExtractionStatus = detail
    ? { detail, label, phase, requestId }
    : { label, phase, requestId };
  void browser.runtime
    .sendMessage({
      type: "extraction-status",
      status
    } satisfies RuntimeMessage)
    .catch(() => undefined);
}

function createExtractionRequestId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `extract-${Date.now()}-${Math.random()}`;
}

function voyagerEndpoints(profileId: string): VoyagerEndpoint[] {
  const encodedProfileId = encodeURIComponent(profileId);
  return uniqueEndpoints([
    ...voyagerEndpointsFromPerformance(profileId).slice(0, VOYAGER_ENDPOINT_LIMIT),
    {
      source: "linkedin-voyager.dashFullProfileWithEntities",
      path: `/identity/dash/profiles?q=memberIdentity&memberIdentity=${encodedProfileId}&decorationId=${DASH_FULL_PROFILE_DECORATION}`
    },
    {
      source: "linkedin-voyager.profileView",
      path: `/identity/profiles/${encodedProfileId}/profileView`,
      supplementalPaths: [
        `/identity/profiles/${encodedProfileId}/skillCategory`,
        `/identity/profiles/${encodedProfileId}/recommendations?q=received&recommendationStatuses=List(VISIBLE)`
      ]
    }
  ]);
}

function voyagerEndpointsFromPerformance(profileId: string): VoyagerEndpoint[] {
  const resources = performance
    .getEntriesByType("resource")
    .map((entry, order) => {
      const resource = entry as PerformanceResourceTiming;
      const url = safeUrl(entry.name);
      if (!url) return null;
      return {
        order,
        size: resource.decodedBodySize || resource.encodedBodySize || resource.transferSize || 0,
        url
      };
    })
    .filter((resource): resource is VoyagerResource =>
      Boolean(
        resource &&
        resource.url.origin === "https://www.linkedin.com" &&
        resource.url.pathname.startsWith("/voyager/api/")
      )
    );

  const hasMatchingProfileGraphql = resources.some((resource) =>
    isIdentityDashProfilesGraphqlUrl(resource.url)
  );

  return resources
    .flatMap((resource): RankedVoyagerEndpoint[] => {
      const { order, size, url } = resource;
      if (isIdentityDashProfilesGraphqlUrl(url)) {
        return [
          {
            source: "linkedin-voyager.network.identityDashProfiles",
            path: url.toString(),
            priority: 100,
            size,
            order
          }
        ];
      }
      if (hasMatchingProfileGraphql && isDashProfileUrnUrl(url)) {
        return [
          {
            source: "linkedin-voyager.network.dashProfileUrn",
            path: url.toString(),
            priority: 90,
            size,
            order
          }
        ];
      }
      if (isDashProfileQueryUrl(url, profileId)) {
        return [
          {
            source: "linkedin-voyager.network.dashProfile",
            path: url.toString(),
            priority: 80,
            size,
            order
          }
        ];
      }
      if (isLegacyProfileViewUrl(url, profileId)) {
        return [
          {
            source: "linkedin-voyager.network.profileView",
            path: url.toString(),
            supplementalPaths: legacySupplementalPaths(profileId),
            priority: 70,
            size,
            order
          }
        ];
      }
      return [];
    })
    .sort(
      (left, right) =>
        right.priority - left.priority || right.size - left.size || left.order - right.order
    )
    .map((endpoint) => {
      const projected: VoyagerEndpoint = { source: endpoint.source, path: endpoint.path };
      if (endpoint.supplementalPaths) projected.supplementalPaths = endpoint.supplementalPaths;
      return projected;
    });
}

function isIdentityDashProfilesGraphqlUrl(url: URL): boolean {
  if (url.pathname !== "/voyager/api/graphql") return false;
  return Boolean(url.searchParams.get("queryId")?.startsWith(IDENTITY_DASH_PROFILES_QUERY_PREFIX));
}

function isDashProfileUrnUrl(url: URL): boolean {
  return (
    safeDecode(url.pathname).startsWith(
      "/voyager/api/identity/dash/profiles/urn:li:fsd_profile:"
    ) && Boolean(url.searchParams.get("decorationId"))
  );
}

function isDashProfileQueryUrl(url: URL, profileId: string): boolean {
  return (
    url.pathname === "/voyager/api/identity/dash/profiles" &&
    url.searchParams.get("q") === "memberIdentity" &&
    (url.searchParams.get("memberIdentity") === profileId ||
      isProfileUrnValue(url.searchParams.get("memberIdentity"))) &&
    Boolean(url.searchParams.get("decorationId"))
  );
}

function hasStructuredProfileSections(profile: Profile): boolean {
  return [
    profile.work,
    profile.education,
    profile.skills,
    profile.licensesCertifications,
    profile.projects,
    profile.publications,
    profile.volunteering,
    profile.honorsAwards,
    profile.testScores,
    profile.patents,
    profile.languages,
    profile.courses,
    profile.recommendations,
    profile.featured,
    profile.organizations,
    profile.interests
  ].some((section) => section.length > 0);
}

function evaluateVoyagerCandidate(
  payload: unknown,
  options: {
    profileId: string;
    source: string;
    supplementalPayloads?: unknown[];
    verboseDiagnostics: boolean;
  }
): VoyagerCandidateEvaluation {
  const payloadProfileIds = profileIdsFromPayload(payload);
  if (!payloadProfileIds.length) {
    return { profile: null, reason: "payload profile identity was unavailable" };
  }
  if (
    !payloadProfileIds.some((payloadProfileId) =>
      profileIdsMatch(payloadProfileId, options.profileId)
    )
  ) {
    return { profile: null, reason: "payload profile did not match current profile" };
  }

  const extractionOptions: {
    source: string;
    supplementalPayloads?: unknown[];
    url: string;
    verboseDiagnostics?: boolean;
  } = {
    source: options.source,
    url: document.location.href
  };
  if (options.supplementalPayloads) {
    extractionOptions.supplementalPayloads = options.supplementalPayloads;
  }
  if (options.verboseDiagnostics) {
    extractionOptions.verboseDiagnostics = true;
  }

  const profile = extractProfileFromVoyagerPayload(
    payloadWithPreferredProfileEntity(payload, options.profileId),
    extractionOptions
  );
  if (!hasStructuredProfileSections(profile)) {
    return {
      profile: null,
      reason: "parsed but did not include structured profile sections"
    };
  }
  return { profile };
}

function isLegacyProfileViewUrl(url: URL, profileId: string): boolean {
  return (
    safeDecode(url.pathname) ===
    `/voyager/api/identity/profiles/${safeDecode(profileId)}/profileView`
  );
}

function legacySupplementalPaths(profileId: string): string[] {
  const encodedProfileId = encodeURIComponent(profileId);
  return [
    `/identity/profiles/${encodedProfileId}/skillCategory`,
    `/identity/profiles/${encodedProfileId}/recommendations?q=received&recommendationStatuses=List(VISIBLE)`
  ];
}

function uniqueEndpoints(endpoints: VoyagerEndpoint[]): VoyagerEndpoint[] {
  const seen = new Set<string>();
  return endpoints.filter((endpoint) => {
    const marker = endpoint.path;
    if (seen.has(marker)) return false;
    seen.add(marker);
    return true;
  });
}

async function prepareAccessibleSections(settings: Settings): Promise<void> {
  if (settings.automationMode === "manual") return;
  if (settings.autoScroll) {
    for (let pass = 0; pass < 3; pass += 1) {
      window.scrollTo(0, document.documentElement.scrollHeight);
      await yieldToDom();
    }
    window.scrollTo(0, 0);
  }
  if (!settings.expandShowMore) return;

  const controls = Array.from(document.querySelectorAll<HTMLButtonElement>("button"))
    .filter(isSafeExpansionButton)
    .slice(0, 20);

  for (const control of controls) {
    control.click();
    await yieldToDom();
  }
}

function csrfTokenFromCookie(): string | undefined {
  return document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("JSESSIONID="))
    ?.slice("JSESSIONID=".length)
    .replace(/^"|"$/g, "");
}

function profileIdFromLocation(): string | undefined {
  return document.location.href.match(/linkedin\.com\/in\/([^/?#]+)/i)?.[1];
}

function profileIdsFromPayload(payload: unknown): string[] {
  const root = objectRecord(payload);
  const data = objectRecord(root?.data);
  const included = Array.isArray(root?.included) ? root.included : [];
  const entitiesByUrn: Record<string, Record<string, unknown>> = {};
  for (const item of included) {
    const record = objectRecord(item);
    const urn = stringValue(record?.entityUrn) ?? stringValue(record?.key);
    if (record && urn) entitiesByUrn[urn] = record;
  }

  const referencedIds: string[] = [];
  collectPayloadProfileIds(data, entitiesByUrn, referencedIds);
  const dataProfileId = stringValue(data?.publicIdentifier);
  if (dataProfileId) referencedIds.unshift(dataProfileId);
  const uniqueReferencedIds = uniqueStrings(referencedIds);
  if (uniqueReferencedIds.length) return uniqueReferencedIds;

  const fallbackIds = included.flatMap((item) => {
    const record = objectRecord(item);
    if (!record || !isProfileEntity(record)) return [];
    const publicIdentifier = stringValue(record.publicIdentifier);
    if (publicIdentifier) return [publicIdentifier];
    const urnId = profileIdFromUrn(stringValue(record.entityUrn));
    return urnId ? [urnId] : [];
  });
  return uniqueStrings(fallbackIds);
}

function payloadWithPreferredProfileEntity(payload: unknown, profileId: string): unknown {
  const root = objectRecord(payload);
  if (!root || !Array.isArray(root.included)) return payload;

  const preferred = root.included.filter((item) => {
    const record = objectRecord(item);
    return record ? profileEntityMatches(record, profileId) : false;
  });
  if (!preferred.length) return payload;

  return {
    ...root,
    included: [...preferred, ...root.included.filter((item) => !preferred.includes(item))]
  };
}

function collectPayloadProfileIds(
  value: unknown,
  entitiesByUrn: Record<string, Record<string, unknown>>,
  ids: string[],
  depth = 0
): void {
  if (depth > 8) return;

  if (typeof value === "string") {
    collectProfileIdFromReference(value, entitiesByUrn, ids, depth);
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) collectPayloadProfileIds(item, entitiesByUrn, ids, depth + 1);
    return;
  }

  const record = objectRecord(value);
  if (!record) return;

  collectProfileIdFromReference(stringValue(record["*profile"]), entitiesByUrn, ids, depth);
  collectProfileIdFromReference(stringValue(record.profileUrn), entitiesByUrn, ids, depth);
  collectProfileIdFromReference(stringValue(record.profile), entitiesByUrn, ids, depth);

  for (const [key, nested] of Object.entries(record)) {
    if (key === "*elements" || key === "elements" || /profile/i.test(key)) {
      collectPayloadProfileIds(nested, entitiesByUrn, ids, depth + 1);
    } else if (objectRecord(nested)) {
      collectPayloadProfileIds(nested, entitiesByUrn, ids, depth + 1);
    }
  }
}

function collectProfileIdFromReference(
  value: string | undefined,
  entitiesByUrn: Record<string, Record<string, unknown>>,
  ids: string[],
  depth: number
): void {
  if (!value) return;
  const urnId = profileIdFromUrn(value);
  if (urnId) ids.push(urnId);

  const entity = entitiesByUrn[value];
  if (!entity) return;
  if (isProfileEntity(entity)) {
    const publicIdentifier = stringValue(entity.publicIdentifier);
    if (publicIdentifier) ids.push(publicIdentifier);
    const entityUrnId = profileIdFromUrn(stringValue(entity.entityUrn));
    if (entityUrnId) ids.push(entityUrnId);
    return;
  }
  collectPayloadProfileIds(entity, entitiesByUrn, ids, depth + 1);
}

function profileEntityMatches(value: Record<string, unknown>, profileId: string): boolean {
  if (!isProfileEntity(value)) return false;
  return [
    stringValue(value.publicIdentifier),
    profileIdFromUrn(stringValue(value.entityUrn)),
    profileIdFromUrn(stringValue(value.key))
  ].some((candidate) => Boolean(candidate && profileIdsMatch(candidate, profileId)));
}

function isProfileEntity(value: Record<string, unknown>): boolean {
  const type = stringValue(value.$type);
  if (type && /identity\.profile\.Profile$/.test(type)) return true;
  return Boolean(profileIdFromUrn(stringValue(value.entityUrn)));
}

function profileIdFromUrn(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const decoded = safeDecode(value);
  const match = /^urn:li:fsd_profile:([^?#]+)/i.exec(decoded);
  return match?.[1];
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const marker = safeDecode(value).toLowerCase();
    if (seen.has(marker)) return false;
    seen.add(marker);
    return true;
  });
}

function profileIdsMatch(left: string, right: string): boolean {
  return safeDecode(left) === safeDecode(right);
}

function voyagerAttemptSummary(attempts: VoyagerAttempt[]): string {
  if (!attempts.length)
    return " No embedded Voyager state or same-page Voyager profile requests were found.";
  const details = attempts
    .map(
      (attempt) =>
        `${attempt.source}${attempt.status ? ` ${attempt.status}` : ""}${attempt.reason ? ` (${attempt.reason})` : ""}`
    )
    .join("; ");
  return ` Attempts: ${details}.`;
}

function voyagerFailure(error: unknown): Pick<VoyagerAttempt, "status" | "reason"> {
  const status =
    typeof error === "object" && error !== null && "status" in error
      ? Number((error as { status?: unknown }).status)
      : undefined;
  const failure: Pick<VoyagerAttempt, "status" | "reason"> = { reason: errorMessage(error) };
  if (typeof status === "number" && Number.isFinite(status)) failure.status = status;
  return failure;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function safeUrl(value: string): URL | undefined {
  try {
    return new URL(value);
  } catch {
    return undefined;
  }
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function isProfileUrnValue(value: string | null): boolean {
  return Boolean(value && safeDecode(value).startsWith("urn:li:fsd_profile:"));
}

function objectRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function yieldToDom(): Promise<void> {
  await Promise.resolve();
}

function assertProfileReady(): void {
  const readiness = detectLinkedInProfileReadiness(document);
  if (readiness.state !== "ready") throw new Error(readiness.reason);
}

function isSafeExpansionButton(control: HTMLButtonElement): boolean {
  if (control.disabled || control.getAttribute("aria-disabled") === "true") return false;
  if (control.closest("form")) return false;
  if (!/show more|see more|more results|show all/i.test(control.textContent ?? "")) return false;
  return control.getClientRects().length > 0;
}

async function waitForProfileContent(timeoutMs = 2000): Promise<void> {
  if (detectLinkedInProfileReadiness(document).state === "ready") return;
  if (!document.body) await delay(50);
  if (detectLinkedInProfileReadiness(document).state === "ready") return;

  await new Promise<void>((resolve) => {
    const observer = new MutationObserver(() => {
      if (detectLinkedInProfileReadiness(document).state === "ready") {
        window.clearTimeout(timeout);
        observer.disconnect();
        resolve();
      }
    });
    const timeout = window.setTimeout(() => {
      observer.disconnect();
      resolve();
    }, timeoutMs);
    observer.observe(document.documentElement, { childList: true, subtree: true });
  });
}
