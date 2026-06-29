import {
  detectLinkedInProfileReadiness,
  extractProfileFromDocument
} from "@linkedin-profile-exporter/core/extraction";
import { extractProfileFromVoyagerPayload } from "@linkedin-profile-exporter/core/linkedin-voyager";
import type { Diagnostic, Profile } from "@linkedin-profile-exporter/core/schema";
import {
  applyProfileSettings,
  shouldIncludeVerboseDiagnostics,
  type Settings
} from "@linkedin-profile-exporter/core/settings";
import { browser } from "wxt/browser";
import { defineContentScript } from "wxt/utils/define-content-script";
import type {
  DetailSectionResult,
  DetailSectionItems,
  ExtractionPhase,
  ExtractionStatus,
  RecoverableSection,
  RuntimeMessage,
  RuntimeResponse
} from "../src/messaging";
import { createExtractionRequestId } from "../src/extraction-request-id";

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

interface SupplementalPayloadResult {
  domSections?: DetailSectionItems | undefined;
  diagnostics: Diagnostic[];
  payloads: unknown[];
}

interface RscPaginationCapture {
  labels: string[];
  responseBytes?: number;
  sections: Array<"skills" | "courses">;
  status: number;
  type: "pagination";
}

interface SectionRecoveryDescriptor {
  advertisedTerms: string[];
  collectionPattern: RegExp;
  detailPath?: string;
  entityUrnPattern: RegExp;
  htmlPattern: RegExp;
  keys: string[];
  knownCap?: number;
  label: string;
  legacyPath?: (profileId: string) => string;
  section: RecoverableSection;
  supportsPagination?: boolean;
}

interface SupplementalRequest {
  allowDetailTab?: boolean;
  descriptor: SectionRecoveryDescriptor;
  kind: "detail" | "legacy" | "observed" | "pagination";
  path: string;
}

interface RecoveryControl {
  cancelled: boolean;
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

type DetailCourse = Profile["courses"][number];
type DetailCertification = Profile["licensesCertifications"][number];
type DetailEducation = Profile["education"][number];
type DetailFeatured = Profile["featured"][number];
type DetailHonorAward = Profile["honorsAwards"][number];
type DetailInterest = Profile["interests"][number];
type DetailLanguage = Profile["languages"][number];
type DetailOrganization = Profile["organizations"][number];
type DetailPatent = Profile["patents"][number];
type DetailProject = Profile["projects"][number];
type DetailPublication = Profile["publications"][number];
type DetailRecommendation = Profile["recommendations"][number];
type DetailSkill = Profile["skills"][number];
type DetailTestScore = Profile["testScores"][number];
type DetailVolunteering = Profile["volunteering"][number];
type DetailWork = Profile["work"][number];
type DetailDomSection = Extract<
  RecoverableSection,
  | "courses"
  | "education"
  | "featured"
  | "honorsAwards"
  | "interests"
  | "languages"
  | "licensesCertifications"
  | "organizations"
  | "patents"
  | "projects"
  | "publications"
  | "recommendations"
  | "skills"
  | "testScores"
  | "volunteering"
  | "work"
>;

const DASH_FULL_PROFILE_DECORATION =
  "com.linkedin.voyager.dash.deco.identity.profile.FullProfileWithEntities-93";
const IDENTITY_DASH_PROFILES_QUERY_PREFIX = "voyagerIdentityDashProfiles.";
const PROFILE_READINESS_TIMEOUT_MS = 800;
const VOYAGER_ENDPOINT_LIMIT = 6;
const VOYAGER_DETAIL_RENDER_TIMEOUT_MS = 6_000;
const VOYAGER_DETAIL_FRAME_TIMEOUT_MS = 2_500;
const VOYAGER_DETAIL_TAB_RECOVERY_TIMEOUT_MS = 20_000;
const VOYAGER_FETCH_TIMEOUT_MS = 2_500;
const VOYAGER_DETAIL_FETCH_TIMEOUT_MS = 1_500;
const VOYAGER_SECTION_RECOVERY_CONCURRENCY = 2;
const VOYAGER_SECTION_RECOVERY_LIMIT = 32;
const VOYAGER_SECTION_RECOVERY_TOTAL_TIMEOUT_MS = 20_000;
const VOYAGER_TOTAL_TIMEOUT_MS = 5_500;
const CONTENT_SCRIPT_SENTINEL = "__linkedinProfileExporterContentScriptReady";
const RSC_PAGINATION_EVENT = "linkedin-profile-exporter:rsc-pagination";
const RSC_PAGINATION_PATH = "/flagship-web/rsc-action/actions/pagination";
const RSC_MESSAGE_SOURCE = "linkedin-profile-exporter";
const RSC_MESSAGE_TYPE = "rsc-pagination";
const rscPaginationCaptures: RscPaginationCapture[] = [];

const SECTION_RECOVERY_DESCRIPTORS: SectionRecoveryDescriptor[] = [
  sectionDescriptor("work", "Experience", {
    detailPath: "details/experience/",
    keys: ["*positionView", "*profilePositions", "*positionGroupView", "*profilePositionGroups"],
    pattern: /Position|PositionGroup|Experience/i,
    terms: ["experiences", "experience", "positions", "roles"]
  }),
  sectionDescriptor("education", "Education", {
    detailPath: "details/education/",
    keys: ["*educationView", "*profileEducations"],
    pattern: /Education/i,
    terms: ["education", "schools"]
  }),
  sectionDescriptor("skills", "Skills", {
    detailPath: "details/skills/",
    knownCap: 20,
    keys: ["*profileSkills", "*skillView", "*skills"],
    legacyPath: skillSupplementalPath,
    pattern:
      /FullProfileSkillsInjection|ProfileSkills|SkillCategory|SkillView|ProfileSkill|SkillEntity/i,
    terms: ["skills", "skill"]
  }),
  sectionDescriptor("licensesCertifications", "Licenses and certifications", {
    detailPath: "details/certifications/",
    keys: ["*certificationView", "*profileCertifications"],
    pattern: /Certification|License/i,
    terms: ["licenses", "certifications", "licenses & certifications"]
  }),
  sectionDescriptor("projects", "Projects", {
    detailPath: "details/projects/",
    knownCap: 20,
    keys: ["*projectView", "*profileProjects"],
    pattern: /Project/i,
    terms: ["projects", "project"]
  }),
  sectionDescriptor("publications", "Publications", {
    detailPath: "details/publications/",
    keys: ["*publicationView", "*profilePublications"],
    pattern: /Publication/i,
    terms: ["publications", "publication"]
  }),
  sectionDescriptor("volunteering", "Volunteering", {
    detailPath: "details/volunteering-experiences/",
    keys: ["*volunteerExperienceView", "*profileVolunteerExperiences"],
    pattern: /Volunteer/i,
    terms: ["volunteering", "volunteer experiences"]
  }),
  sectionDescriptor("honorsAwards", "Honors", {
    detailPath: "details/honors/",
    keys: ["*honorView", "*profileHonors"],
    pattern: /Honor|Award/i,
    terms: ["honors", "awards", "honors & awards"]
  }),
  sectionDescriptor("testScores", "Test scores", {
    detailPath: "details/test-scores/",
    keys: ["*testScoreView", "*profileTestScores"],
    pattern: /TestScore/i,
    terms: ["test scores", "scores"]
  }),
  sectionDescriptor("patents", "Patents", {
    detailPath: "details/patents/",
    keys: ["*patentView", "*profilePatents"],
    pattern: /Patent/i,
    terms: ["patents", "patent"]
  }),
  sectionDescriptor("languages", "Languages", {
    detailPath: "details/languages/",
    keys: ["*languageView", "*profileLanguages"],
    pattern: /Language/i,
    terms: ["languages", "language"]
  }),
  sectionDescriptor("courses", "Courses", {
    detailPath: "details/courses/",
    knownCap: 20,
    keys: ["*profileCourses", "*courseView"],
    legacyPath: courseSupplementalPath,
    pattern: /FullProfileCoursesInjection|ProfileCourses|Course/i,
    terms: ["courses", "course"]
  }),
  sectionDescriptor("recommendations", "Recommendations", {
    detailPath: "details/recommendations/",
    keys: ["*recommendationView", "*profileRecommendations"],
    legacyPath: recommendationsSupplementalPath,
    pattern: /Recommendation/i,
    terms: ["recommendations", "recommendation"]
  }),
  sectionDescriptor("featured", "Featured", {
    detailPath: "details/featured/",
    knownCap: 20,
    keys: [
      "*summaryTreasuryMedias",
      "*profileTreasuryMediaPosition",
      "*profileTreasuryMediaItems",
      "*treasuryMediaItems",
      "*treasuryMedias"
    ],
    pattern: /Treasury|Featured/i,
    terms: ["featured", "featured items"]
  }),
  sectionDescriptor("organizations", "Organizations", {
    detailPath: "details/organizations/",
    keys: ["*organizationView", "*profileOrganizations"],
    pattern: /Organization/i,
    terms: ["organizations", "organization"]
  }),
  sectionDescriptor("interests", "Interests", {
    detailPath: "details/interests/",
    keys: ["*interestView", "*profileInterests"],
    pattern: /Interest/i,
    terms: ["interests", "interest"]
  })
];

export default defineContentScript({
  matches: ["https://www.linkedin.com/in/*"],
  runAt: "document_start",
  main() {
    const runtime = globalThis as typeof globalThis & {
      [CONTENT_SCRIPT_SENTINEL]?: {
        messageListener?: (message: RuntimeMessage) => Promise<RuntimeResponse> | undefined;
        rscEventListener?: EventListener;
        rscMessageListener?: (event: MessageEvent) => void;
      };
    };
    const previous = runtime[CONTENT_SCRIPT_SENTINEL];
    if (previous?.messageListener) {
      try {
        browser.runtime.onMessage.removeListener(previous.messageListener);
      } catch {
        // A previous listener can belong to an invalidated extension runtime after reload.
      }
    }
    if (previous?.rscEventListener) {
      window.removeEventListener(RSC_PAGINATION_EVENT, previous.rscEventListener);
    }
    if (previous?.rscMessageListener) {
      window.removeEventListener("message", previous.rscMessageListener);
    }

    const rscEventListener = captureRscPaginationEvent;
    const rscMessageListener = captureRscPaginationMessage;
    const messageListener = (message: RuntimeMessage): Promise<RuntimeResponse> | undefined => {
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
              ok: false as const,
              error: message
            };
          });
      }
      if (message.type === "extract-detail-section") {
        const descriptor = descriptorBySection(message.section);
        const requestId = message.requestId ?? createExtractionRequestId();
        reportExtractionStatus(
          requestId,
          "reading-details",
          "Reading details",
          `Reading ${descriptor.label} detail page.`
        );
        return currentDetailSupplementalPayloads(
          descriptor,
          VOYAGER_DETAIL_RENDER_TIMEOUT_MS,
          message.targetCount ?? 0
        )
          .then((detail): RuntimeResponse => ({ ok: true as const, detail }))
          .catch(
            (error: unknown): RuntimeResponse => ({
              ok: false as const,
              error: errorMessage(error)
            })
          );
      }
      return undefined;
    };

    runtime[CONTENT_SCRIPT_SENTINEL] = {
      messageListener,
      rscEventListener,
      rscMessageListener
    };
    window.addEventListener(RSC_PAGINATION_EVENT, rscEventListener);
    window.addEventListener("message", rscMessageListener);
    browser.runtime.onMessage.addListener(messageListener);
  }
});

function captureRscPaginationEvent(event: Event): void {
  captureRscPaginationDetail((event as CustomEvent<Partial<RscPaginationCapture>>).detail);
}

function captureRscPaginationMessage(event: MessageEvent): void {
  const data = objectRecord(event.data);
  if (
    data?.source !== RSC_MESSAGE_SOURCE ||
    data.type !== RSC_MESSAGE_TYPE ||
    !objectRecord(data.detail)
  ) {
    return;
  }
  captureRscPaginationDetail(data.detail as Partial<RscPaginationCapture>);
}

function captureRscPaginationDetail(detail: Partial<RscPaginationCapture> | undefined): void {
  if (!detail || typeof detail !== "object") return;
  if (
    detail.type !== "pagination" ||
    !Array.isArray(detail.labels) ||
    !Array.isArray(detail.sections)
  ) {
    return;
  }
  rscPaginationCaptures.push({
    labels: detail.labels.filter((label): label is string => typeof label === "string"),
    sections: detail.sections.filter(
      (section): section is "skills" | "courses" => section === "skills" || section === "courses"
    ),
    status: typeof detail.status === "number" ? detail.status : 0,
    type: "pagination",
    ...(typeof detail.responseBytes === "number" ? { responseBytes: detail.responseBytes } : {})
  });
  while (rscPaginationCaptures.length > 12) rscPaginationCaptures.shift();
}

async function extractProfile(settings: Settings, requestId: string): Promise<Profile> {
  const attempts: VoyagerAttempt[] = [];
  const verboseDiagnostics = shouldIncludeVerboseDiagnostics(settings);
  const initialProfile = await extractViaLinkedInData(requestId, attempts, verboseDiagnostics, {
    embeddedDetail: "Checking embedded LinkedIn profile state.",
    voyagerDetail: "Trying same-page internal profile JSON."
  });
  if (initialProfile) return initialProfile;

  reportExtractionStatus(
    requestId,
    "preparing-page",
    "Preparing profile page",
    "Opening accessible profile sections."
  );
  await prepareAccessibleSections(settings);
  assertProfileReady();

  const preparedProfile = await extractViaLinkedInData(requestId, attempts, verboseDiagnostics, {
    embeddedDetail: "Rechecking embedded LinkedIn profile state after page prep.",
    includeVoyagerApi: false
  });
  if (preparedProfile) return preparedProfile;

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

async function extractViaLinkedInData(
  requestId: string,
  attempts: VoyagerAttempt[],
  verboseDiagnostics: boolean,
  details: { embeddedDetail: string; includeVoyagerApi?: boolean; voyagerDetail?: string }
): Promise<Profile | null> {
  reportExtractionStatus(
    requestId,
    "reading-embedded-data",
    "Reading page data",
    details.embeddedDetail
  );
  const embedded = await extractViaEmbeddedVoyagerState(requestId, attempts, verboseDiagnostics);
  if (embedded) return embedded;
  if (details.includeVoyagerApi === false) return null;

  reportExtractionStatus(
    requestId,
    "reading-linkedin-data",
    "Reading LinkedIn data",
    details.voyagerDetail ?? "Trying same-page internal profile JSON."
  );
  const voyager = await extractViaVoyagerApi(requestId, attempts, verboseDiagnostics);
  if (voyager) return voyager;
  return null;
}

async function extractViaEmbeddedVoyagerState(
  requestId: string,
  attempts: VoyagerAttempt[],
  verboseDiagnostics: boolean
): Promise<Profile | null> {
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
      const preliminary = preliminaryVoyagerCandidateProfile(payload, {
        profileId,
        source: "linkedin-voyager.embedded",
        verboseDiagnostics
      });
      if (!preliminary.profile) {
        attempts.push({
          source: "linkedin-voyager.embedded",
          reason: preliminary.reason ?? "candidate was rejected"
        });
        continue;
      }
      const supplemental = await supplementalPayloadsForEndpoint(
        {
          source: "linkedin-voyager.embedded",
          path: "embedded"
        },
        payload,
        VOYAGER_SECTION_RECOVERY_TOTAL_TIMEOUT_MS,
        requestId,
        preliminary.profile
      );
      const evaluation = evaluateVoyagerCandidate(payload, {
        profileId,
        source: "linkedin-voyager.embedded",
        supplementalDomSections: supplemental.domSections,
        supplementalDiagnostics: supplemental.diagnostics,
        supplementalPayloads: supplemental.payloads,
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
  requestId: string,
  attempts: VoyagerAttempt[],
  verboseDiagnostics: boolean
): Promise<Profile | null> {
  const profileId = profileIdFromLocation();
  if (!profileId) return null;
  if (!csrfTokenFromCookie()) {
    attempts.push({
      source: "linkedin-voyager.api",
      reason: "LinkedIn session cookie was unavailable"
    });
    return null;
  }
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
      const preliminary = preliminaryVoyagerCandidateProfile(profilePayload, {
        profileId,
        source: endpoint.source,
        verboseDiagnostics
      });
      if (!preliminary.profile) {
        attempts.push({
          source: endpoint.source,
          reason: preliminary.reason ?? "candidate was rejected"
        });
        continue;
      }
      const supplemental = await supplementalPayloadsForEndpoint(
        endpoint,
        profilePayload,
        VOYAGER_SECTION_RECOVERY_TOTAL_TIMEOUT_MS,
        requestId,
        preliminary.profile
      );
      const evaluation = evaluateVoyagerCandidate(profilePayload, {
        profileId,
        source: endpoint.source,
        supplementalDomSections: supplemental.domSections,
        supplementalDiagnostics: supplemental.diagnostics,
        supplementalPayloads: supplemental.payloads,
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

async function voyagerFetchSupplemental(
  request: SupplementalRequest,
  timeoutMs: number
): Promise<SupplementalPayloadResult> {
  if (request.kind === "detail") {
    return detailPageSupplementalPayloads(request.descriptor, request.path, timeoutMs);
  }
  if (request.kind === "pagination") {
    try {
      const payload = await voyagerFetch(request.path, timeoutMs);
      return {
        diagnostics: [supplementalDiagnostic(request, payload)],
        payloads: [payload]
      };
    } catch (error) {
      return {
        diagnostics: [coverageUnavailableDiagnostic(request.descriptor, voyagerFailure(error))],
        payloads: []
      };
    }
  }

  try {
    const payload = await voyagerFetch(request.path, timeoutMs);
    return {
      diagnostics: [supplementalDiagnostic(request, payload)],
      payloads: [payload]
    };
  } catch (error) {
    const failure = voyagerFailure(error);
    return {
      diagnostics: [coverageUnavailableDiagnostic(request.descriptor, failure)],
      payloads: []
    };
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
        `/identity/profiles/${encodedProfileId}/courses`,
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
      if (!entry.name.startsWith("https://www.linkedin.com/voyager/api/")) return null;
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
    isIdentityDashProfilesGraphqlUrl(resource.url, profileId)
  );

  return resources
    .flatMap((resource): RankedVoyagerEndpoint[] => {
      const { order, size, url } = resource;
      if (isIdentityDashProfilesGraphqlUrl(url, profileId)) {
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
      if (hasMatchingProfileGraphql && isDashProfileUrnUrl(url, profileId)) {
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

function supplementalRequestsForEndpoint(
  endpoint: VoyagerEndpoint,
  payload: unknown,
  profileId: string,
  baselineProfile?: Profile
): SupplementalRequest[] {
  const recoveryDescriptors = SECTION_RECOVERY_DESCRIPTORS.filter((descriptor) =>
    shouldAttemptSectionRecovery(payload, descriptor, baselineProfile)
  );
  const requests: SupplementalRequest[] = observedSupplementalRequestsFromPerformance(
    profileId,
    recoveryDescriptors
  );
  for (const path of endpoint.supplementalPaths ?? []) {
    const descriptor = descriptorForPath(path);
    if (descriptor) requests.push({ descriptor, kind: "legacy", path });
  }

  for (const descriptor of recoveryDescriptors) {
    if (descriptor.legacyPath) {
      const legacyPath = descriptor.legacyPath(profileId);
      requests.push({
        descriptor,
        kind: "legacy",
        path: legacyPath
      });
    }
    if (descriptor.detailPath) {
      requests.push({
        allowDetailTab: true,
        descriptor,
        kind: "detail",
        path: profileDetailUrl(profileId, descriptor.detailPath)
      });
    }
  }

  return uniqueSupplementalRequests(requests);
}

function observedSupplementalRequestsFromPerformance(
  profileId: string,
  recoveryDescriptors: SectionRecoveryDescriptor[]
): SupplementalRequest[] {
  return performance
    .getEntriesByType("resource")
    .flatMap((entry, order): Array<SupplementalRequest & { order: number; size: number }> => {
      const resource = entry as PerformanceResourceTiming;
      if (!entry.name.startsWith("https://www.linkedin.com/voyager/api/")) return [];
      const url = safeUrl(entry.name);
      if (!url || url.origin !== "https://www.linkedin.com") return [];
      const descriptors = descriptorsForObservedVoyagerUrl(url, profileId, recoveryDescriptors);
      return descriptors.map((descriptor) => ({
        descriptor,
        kind: "observed",
        order,
        path: url.toString(),
        size: resource.decodedBodySize || resource.encodedBodySize || resource.transferSize || 0
      }));
    })
    .sort((left, right) => right.size - left.size || left.order - right.order)
    .map(({ descriptor, kind, path }) => ({ descriptor, kind, path }));
}

function descriptorsForObservedVoyagerUrl(
  url: URL,
  profileId: string,
  recoveryDescriptors: SectionRecoveryDescriptor[]
): SectionRecoveryDescriptor[] {
  if (!observedVoyagerUrlMatchesProfile(url, profileId)) return [];
  const decoded = safeDecode(url.toString());
  const directMatches = recoveryDescriptors.filter((descriptor) =>
    observedVoyagerUrlMatchesDescriptor(decoded, descriptor)
  );
  if (!directMatches.length && isIdentityDashProfileComponentsGraphqlUrl(url)) {
    return recoveryDescriptors.filter(
      (descriptor) =>
        hasDetailLinkForSection(descriptor) ||
        Boolean(recoveryAdvertisedSectionCountFromDocument(descriptor))
    );
  }
  return directMatches;
}

function observedVoyagerUrlMatchesDescriptor(
  decodedUrl: string,
  descriptor: SectionRecoveryDescriptor
): boolean {
  if (descriptor.collectionPattern.test(decodedUrl)) return true;
  if (descriptor.entityUrnPattern.test(decodedUrl)) return true;
  return descriptor.keys.some((key) => decodedUrl.includes(key.replace(/^\*/, "")));
}

function observedVoyagerUrlMatchesProfile(url: URL, profileId: string): boolean {
  if (isIdentityDashProfilesGraphqlUrl(url, profileId)) return true;
  if (isDashProfileQueryUrl(url, profileId)) return true;
  if (isLegacyProfileViewUrl(url, profileId)) return true;
  if (profileIdMatchesMemberIdentity(url.searchParams.get("memberIdentity"), profileId)) {
    return true;
  }
  if (graphqlVariablesMatchProfile(url.searchParams.get("variables"), profileId)) return true;

  if (legacyIdentityProfilePathMatches(url, profileId)) return true;
  const decoded = safeDecode(url.toString());
  return [...decoded.matchAll(/profileUrn:([^,)&]+)/g)].some((match) =>
    profileIdMatchesMemberIdentity(match[1], profileId)
  );
}

function legacyIdentityProfilePathMatches(url: URL, profileId: string): boolean {
  const match = /^\/voyager\/api\/identity\/profiles\/([^/]+)\//i.exec(safeDecode(url.pathname));
  return Boolean(match?.[1] && profileIdsMatch(match[1], profileId));
}

function isIdentityDashProfileComponentsGraphqlUrl(url: URL): boolean {
  return (
    url.pathname === "/voyager/api/graphql" &&
    /^voyagerIdentityDashProfileComponents\./.test(url.searchParams.get("queryId") ?? "")
  );
}

async function supplementalPayloadsForEndpoint(
  endpoint: VoyagerEndpoint,
  payload: unknown,
  timeoutMs: number,
  requestId: string,
  baselineProfile?: Profile
): Promise<SupplementalPayloadResult> {
  const profileId = profileIdFromLocation();
  if (!profileId) return { diagnostics: [], payloads: [] };

  const budgetMs = Math.min(timeoutMs, VOYAGER_SECTION_RECOVERY_TOTAL_TIMEOUT_MS);
  const deadline = Date.now() + budgetMs;
  const supplementalRequests = supplementalRequestsForEndpoint(
    endpoint,
    payload,
    profileId,
    baselineProfile
  );
  const supplementalRequestGroups = limitSupplementalRequestGroups(
    groupSupplementalRequestsBySection(supplementalRequests)
  );
  reportSectionRecoveryProgress(
    requestId,
    supplementalRequestGroups.flatMap((requests) => requests)
  );
  const supplementalResults = await mapWithConcurrency(
    supplementalRequestGroups,
    VOYAGER_SECTION_RECOVERY_CONCURRENCY,
    (requests) => recoverSupplementalSectionWithTimeout(requests, profileId, deadline)
  );
  return normalizeSupplementalResults(
    supplementalResults,
    supplementalRequestGroups.map((requests) => requests[0]?.descriptor).filter(isPresent)
  );
}

async function recoverSupplementalSectionWithTimeout(
  requests: SupplementalRequest[],
  profileId: string,
  deadline: number
): Promise<SupplementalPayloadResult> {
  const descriptor = requests[0]?.descriptor;
  const remainingMs = Math.max(0, deadline - Date.now());
  if (!descriptor || remainingMs <= 0) {
    return descriptor
      ? { diagnostics: [coverageBudgetDiagnostic(descriptor)], payloads: [] }
      : { diagnostics: [], payloads: [] };
  }
  const control: RecoveryControl = { cancelled: false };
  try {
    const result = await recoverSupplementalSection(requests, profileId, deadline, control);
    if (
      Date.now() >= deadline &&
      !supplementalResultSatisfiesSection(result, descriptor) &&
      !result.diagnostics.some((diagnostic) => diagnostic.code === "coverage.budget.exhausted")
    ) {
      return {
        ...result,
        diagnostics: [...result.diagnostics, coverageBudgetDiagnostic(descriptor)]
      };
    }
    return result;
  } finally {
    control.cancelled = true;
  }
}

function supplementalResultSatisfiesSection(
  result: SupplementalPayloadResult,
  descriptor: SectionRecoveryDescriptor
): boolean {
  const targetCount = sectionRecoveryTargetCount(descriptor, result.payloads);
  const recoveredCount = Math.max(
    sectionRecoveredCount(result.payloads, descriptor),
    detailSectionItemCount(result.domSections, descriptor.section)
  );
  return isRecoveredCountSufficient(recoveredCount, descriptor, targetCount);
}

async function recoverSupplementalSection(
  requests: SupplementalRequest[],
  profileId: string,
  deadline: number,
  control: RecoveryControl = { cancelled: false }
): Promise<SupplementalPayloadResult> {
  const diagnostics: Diagnostic[] = [];
  const payloads: unknown[] = [];
  let domSections: DetailSectionItems = {};
  const paginationSeen = new Set<string>();
  for (const request of sortSupplementalRequests(requests)) {
    if (control.cancelled) break;
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      diagnostics.push(coverageBudgetDiagnostic(request.descriptor));
      break;
    }
    const result = await voyagerFetchSupplemental(request, remainingMs);
    const pagination = await paginationSupplementalPayloads(
      request.descriptor,
      result.payloads,
      profileId,
      deadline,
      request.path,
      paginationSeen
    );
    diagnostics.push(...result.diagnostics, ...pagination.diagnostics);
    payloads.push(...result.payloads, ...pagination.payloads);
    domSections = mergeDetailSectionItems(domSections, result.domSections);
    const isCurrentSectionSatisfied = () => {
      const targetCount = sectionRecoveryTargetCount(request.descriptor, payloads);
      return (
        isSectionRecoverySufficient(payloads, request.descriptor, request.kind, targetCount) ||
        isDetailSectionItemsSufficient(domSections, request.descriptor, targetCount)
      );
    };
    if (isCurrentSectionSatisfied()) {
      break;
    }
    if (request.kind === "detail" && !isCurrentSectionSatisfied()) {
      if (isCurrentDetailDocument(request.path)) {
        const remainingForDocumentMs = deadline - Date.now();
        if (remainingForDocumentMs > 0) {
          const documentResult = await detailDocumentSupplementalPayloads(
            request.descriptor,
            remainingForDocumentMs,
            detailRecoveryTargetCount(request.descriptor, payloads)
          );
          const documentPagination = await paginationSupplementalPayloads(
            request.descriptor,
            documentResult.payloads,
            profileId,
            deadline,
            undefined,
            paginationSeen
          );
          diagnostics.push(...documentResult.diagnostics, ...documentPagination.diagnostics);
          payloads.push(...documentResult.payloads, ...documentPagination.payloads);
          domSections = mergeDetailSectionItems(domSections, documentResult.domSections);
        }
      }
      const runFrameFallback = async (): Promise<void> => {
        const tabReserveMs = request.allowDetailTab
          ? detailTabReserveTimeoutMs(request.descriptor)
          : 0;
        const remainingForFrameFallbackMs = deadline - Date.now() - tabReserveMs;
        if (control.cancelled || isCurrentSectionSatisfied() || remainingForFrameFallbackMs <= 0)
          return;
        const frameResult = await detailFrameSupplementalPayloads(
          request.descriptor,
          request.path,
          remainingForFrameFallbackMs,
          detailRecoveryTargetCount(request.descriptor, payloads)
        );
        const framePagination = await paginationSupplementalPayloads(
          request.descriptor,
          frameResult.payloads,
          profileId,
          deadline,
          undefined,
          paginationSeen
        );
        diagnostics.push(...frameResult.diagnostics, ...framePagination.diagnostics);
        payloads.push(...frameResult.payloads, ...framePagination.payloads);
        domSections = mergeDetailSectionItems(domSections, frameResult.domSections);
      };
      const runTabFallback = async (): Promise<void> => {
        const remainingForTabMs = deadline - Date.now();
        if (!request.allowDetailTab) return;
        if (control.cancelled || isCurrentSectionSatisfied() || remainingForTabMs <= 0) return;
        const tabResult = await detailTabSupplementalPayloads(
          request.descriptor,
          request.path,
          remainingForTabMs,
          detailRecoveryTargetCount(request.descriptor, payloads)
        );
        const tabPagination = await paginationSupplementalPayloads(
          request.descriptor,
          tabResult.payloads,
          profileId,
          deadline,
          undefined,
          paginationSeen
        );
        diagnostics.push(...tabResult.diagnostics, ...tabPagination.diagnostics);
        payloads.push(...tabResult.payloads, ...tabPagination.payloads);
        domSections = mergeDetailSectionItems(domSections, tabResult.domSections);
      };
      if (request.allowDetailTab) {
        await runTabFallback();
        await runFrameFallback();
      } else {
        await runFrameFallback();
        await runTabFallback();
      }
      const remainingForBudgetMs = deadline - Date.now();
      if (remainingForBudgetMs <= 0 && !isCurrentSectionSatisfied()) {
        diagnostics.push(coverageBudgetDiagnostic(request.descriptor));
      }
    }
    if (isCurrentSectionSatisfied()) {
      break;
    }
  }
  return { diagnostics, domSections, payloads };
}

function normalizeSupplementalResults(
  supplementalResults: SupplementalPayloadResult[],
  attemptedDescriptors: SectionRecoveryDescriptor[]
): SupplementalPayloadResult {
  const payloads = supplementalResults.flatMap((result) => result.payloads);
  const domSections = supplementalResults.reduce<DetailSectionItems>(
    (merged, result) => mergeDetailSectionItems(merged, result.domSections),
    {}
  );
  const diagnostics = supplementalResults.flatMap((result) => result.diagnostics);
  const recoveredSections = new Set(
    attemptedDescriptors
      .filter((descriptor) =>
        diagnostics.some(
          (diagnostic) => diagnostic.code === `coverage.${descriptor.section}.recovered`
        )
      )
      .map((descriptor) => descriptor.section)
  );

  return {
    diagnostics: diagnostics.filter(
      (diagnostic) =>
        !(
          diagnostic.code.endsWith(".unavailable") &&
          attemptedDescriptors.some(
            (descriptor) =>
              recoveredSections.has(descriptor.section) &&
              diagnostic.code === `coverage.${descriptor.section}.unavailable`
          )
        )
    ),
    domSections,
    payloads
  };
}

function shouldAttemptSectionRecovery(
  payload: unknown,
  descriptor: SectionRecoveryDescriptor,
  baselineProfile?: Profile
): boolean {
  const summary = sectionPageSummary(payload, descriptor);
  const advertisedCount = recoveryAdvertisedSectionCountFromDocument(descriptor);
  const hasVisibleDetailLink = hasDetailLinkForSection(descriptor);
  const hasVisibleRecoverySignal = Boolean(advertisedCount || hasVisibleDetailLink);
  const canUseVoyagerTotal =
    hasVisibleRecoverySignal ||
    (Boolean(csrfTokenFromCookie()) && shouldRecoverFromVoyagerTotals(descriptor));
  const currentCount = baselineProfile
    ? profileSectionCount(baselineProfile, descriptor.section)
    : 0;
  const targetCount = shouldRecoverFromVoyagerTotals(descriptor)
    ? Math.max(advertisedCount ?? 0, summary.totalCount)
    : (advertisedCount ?? 0);
  if (targetCount > 0) {
    if (currentCount < targetCount) return canUseVoyagerTotal;
    return false;
  }
  if (currentCount === 0 && hasVisibleDetailLink) return true;
  if (descriptor.knownCap) {
    if (!canUseVoyagerTotal) return false;
    if (currentCount > descriptor.knownCap) return false;
    if (currentCount === descriptor.knownCap) return true;
    return summary.pageSize >= descriptor.knownCap;
  }
  return false;
}

function shouldRecoverFromVoyagerTotals(descriptor: SectionRecoveryDescriptor): boolean {
  return (
    descriptor.section === "skills" ||
    descriptor.section === "courses" ||
    Boolean(descriptor.legacyPath)
  );
}

function reportSectionRecoveryProgress(requestId: string, requests: SupplementalRequest[]): void {
  if (!requests.length) return;
  reportExtractionStatus(
    requestId,
    "recovering-sections",
    "Recovering sections",
    `Checking ${uniqueStrings(requests.map((request) => request.descriptor.label)).join(", ")}.`
  );
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  let index = 0;
  async function runNext(): Promise<void> {
    const currentIndex = index;
    index += 1;
    const item = items[currentIndex];
    if (!item) return;
    results[currentIndex] = await worker(item);
    await runNext();
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => runNext()));
  return results;
}

function uniqueSupplementalRequests(requests: SupplementalRequest[]): SupplementalRequest[] {
  const seen = new Set<string>();
  return requests.filter((request) => {
    const marker = `${request.descriptor.section}:${request.kind}:${safeDecode(request.path).toLowerCase()}`;
    if (seen.has(marker)) return false;
    seen.add(marker);
    return true;
  });
}

function groupSupplementalRequestsBySection(
  requests: SupplementalRequest[]
): SupplementalRequest[][] {
  const groups = new Map<RecoverableSection, SupplementalRequest[]>();
  for (const request of requests) {
    const group = groups.get(request.descriptor.section) ?? [];
    group.push(request);
    groups.set(request.descriptor.section, group);
  }
  return Array.from(groups.values());
}

function limitSupplementalRequestGroups(groups: SupplementalRequest[][]): SupplementalRequest[][] {
  return [...groups]
    .sort(
      (left, right) =>
        sectionRecoveryPriority(right[0]?.descriptor) - sectionRecoveryPriority(left[0]?.descriptor)
    )
    .slice(0, VOYAGER_SECTION_RECOVERY_LIMIT);
}

function sectionRecoveryPriority(descriptor: SectionRecoveryDescriptor | undefined): number {
  if (!descriptor) return 0;
  if (
    recoveryAdvertisedSectionCountFromDocument(descriptor) ||
    hasDetailLinkForSection(descriptor)
  ) {
    if (descriptor.section === "skills") return 130;
    if (descriptor.section === "courses") return 125;
    return 120;
  }
  if (descriptor.section === "skills") return 100;
  if (descriptor.section === "courses") return 95;
  if (descriptor.knownCap) return 80;
  return 20;
}

function sortSupplementalRequests(requests: SupplementalRequest[]): SupplementalRequest[] {
  const order: Record<SupplementalRequest["kind"], number> = {
    observed: 0,
    legacy: 1,
    pagination: 2,
    detail: 3
  };
  return [...requests].sort((left, right) => order[left.kind] - order[right.kind]);
}

function isSectionRecoverySufficient(
  payloads: unknown[],
  descriptor: SectionRecoveryDescriptor,
  lastKind: SupplementalRequest["kind"],
  targetCount = sectionRecoveryTargetCount(descriptor, payloads)
): boolean {
  if (!payloads.length) return false;
  const recoveredCount = sectionRecoveredCount(payloads, descriptor);
  if (isRecoveredCountSufficient(recoveredCount, descriptor, targetCount)) return true;
  return (
    targetCount === 0 && !descriptor.knownCap && (lastKind === "detail" || !descriptor.detailPath)
  );
}

function sectionRecoveryTargetCount(
  descriptor: SectionRecoveryDescriptor,
  payloads: unknown[] = [],
  explicitTargetCount = 0
): number {
  return Math.max(
    explicitTargetCount,
    recoveryAdvertisedSectionCountFromDocument(descriptor) ?? 0,
    payloads.length ? sectionPageSummary(payloads, descriptor).totalCount : 0
  );
}

function detailRecoveryTargetCount(
  descriptor: SectionRecoveryDescriptor,
  payloads: unknown[] = [],
  explicitTargetCount = 0
): number {
  return sectionRecoveryTargetCount(descriptor, payloads, explicitTargetCount);
}

function isRecoveredCountSufficient(
  count: number,
  descriptor: SectionRecoveryDescriptor,
  targetCount: number
): boolean {
  if (!count) return false;
  if (targetCount > 0) return count >= targetCount;
  if (descriptor.knownCap) return count > descriptor.knownCap;
  return true;
}

function sectionRecoveredCount(payloads: unknown[], descriptor: SectionRecoveryDescriptor): number {
  return sectionPayloadItemCount(payloads, descriptor);
}

function sectionPayloadItemCount(
  payloads: unknown[],
  descriptor: SectionRecoveryDescriptor
): number {
  const ids = new Set<string>();
  for (const payload of payloads) collectSectionEntityMarkers(payload, descriptor, ids, 0);
  if (descriptor.section === "skills") {
    return Math.max(ids.size, sectionActualItemCount(payloads, descriptor));
  }
  return Math.max(ids.size, sectionActualItemCount(payloads, descriptor));
}

function sectionActualItemCount(
  value: unknown,
  section: { collectionPattern: RegExp; entityUrnPattern: RegExp; keys: string[] }
): number {
  const summary = { count: 0 };
  collectSectionActualItemCount(value, summary, section, 0);
  return summary.count;
}

function collectSectionActualItemCount(
  value: unknown,
  summary: { count: number },
  section: { collectionPattern: RegExp; entityUrnPattern: RegExp; keys: string[] },
  depth: number
): void {
  if (depth > 8) return;
  if (Array.isArray(value)) {
    for (const item of value) collectSectionActualItemCount(item, summary, section, depth + 1);
    return;
  }

  const record = objectRecord(value);
  if (!record) return;

  for (const key of section.keys) {
    const directItems = record[key];
    if (Array.isArray(directItems)) {
      summary.count = Math.max(summary.count, directItems.length);
    }
  }

  if (
    isSectionCollectionRecord(record, section) ||
    recordHasSectionEntityReferences(record, section)
  ) {
    summary.count = Math.max(summary.count, sectionRecordItemCount(record, section));
  }

  for (const nested of Object.values(record)) {
    collectSectionActualItemCount(nested, summary, section, depth + 1);
  }
}

function collectSectionEntityMarkers(
  value: unknown,
  descriptor: SectionRecoveryDescriptor,
  markers: Set<string>,
  depth: number
): void {
  if (depth > 8) return;
  if (Array.isArray(value)) {
    for (const item of value) collectSectionEntityMarkers(item, descriptor, markers, depth + 1);
    return;
  }

  const record = objectRecord(value);
  if (!record) return;
  const entityUrn = stringValue(record.entityUrn);
  if (entityUrn && isSectionItemEntityMarker(entityUrn, descriptor)) markers.add(entityUrn);
  for (const key of [...descriptor.keys, "*elements", "elements"]) {
    const items = record[key];
    if (!Array.isArray(items)) continue;
    for (const item of items) {
      const marker = stringValue(item);
      if (marker && isSectionItemEntityMarker(marker, descriptor)) markers.add(marker);
    }
  }
  for (const nested of Object.values(record)) {
    collectSectionEntityMarkers(nested, descriptor, markers, depth + 1);
  }
}

function isSectionItemEntityMarker(marker: string, descriptor: SectionRecoveryDescriptor): boolean {
  if (!descriptor.entityUrnPattern.test(marker)) return false;
  if (descriptor.section !== "skills") return true;
  return !/skillcategory/i.test(marker);
}

function descriptorForPath(path: string): SectionRecoveryDescriptor | undefined {
  const lower = safeDecode(path).toLowerCase();
  return (
    SECTION_RECOVERY_DESCRIPTORS.find((descriptor) => {
      if (descriptor.detailPath && lower.includes(descriptor.detailPath.replace(/\/$/, ""))) {
        return true;
      }
      const legacy = descriptor.legacyPath?.("__PROFILE__").toLowerCase();
      if (!legacy) return false;
      return legacy
        .split("__profile__")
        .filter(Boolean)
        .every((part) => lower.includes(part));
    }) ?? fallbackDescriptorForPath(path)
  );
}

function fallbackDescriptorForPath(path: string): SectionRecoveryDescriptor | undefined {
  if (/skillcategory|skills/i.test(path)) return descriptorBySection("skills");
  if (/courses/i.test(path)) return descriptorBySection("courses");
  if (/recommendations/i.test(path)) return descriptorBySection("recommendations");
  return undefined;
}

function descriptorBySection(section: RecoverableSection): SectionRecoveryDescriptor {
  const descriptor = SECTION_RECOVERY_DESCRIPTORS.find(
    (candidate) => candidate.section === section
  );
  if (!descriptor) throw new Error(`Missing section recovery descriptor for ${section}.`);
  return descriptor;
}

function profileDetailUrl(profileId: string, detailPath: string): string {
  return `https://www.linkedin.com/in/${encodeURIComponent(safeDecode(profileId))}/${detailPath}`;
}

function sectionDescriptor(
  section: RecoverableSection,
  label: string,
  options: {
    detailPath?: string;
    keys: string[];
    knownCap?: number;
    legacyPath?: (profileId: string) => string;
    pattern: RegExp;
    terms: string[];
  }
): SectionRecoveryDescriptor {
  const descriptor: SectionRecoveryDescriptor = {
    advertisedTerms: options.terms,
    collectionPattern: options.pattern,
    entityUrnPattern: sectionUrnPattern(section),
    htmlPattern: new RegExp(
      `${options.keys.map(escapeRegExp).join("|")}|${options.pattern.source}`,
      "i"
    ),
    keys: options.keys,
    label,
    section,
    supportsPagination: true
  };
  if (options.detailPath) descriptor.detailPath = options.detailPath;
  if (options.knownCap) descriptor.knownCap = options.knownCap;
  if (options.legacyPath) descriptor.legacyPath = options.legacyPath;
  return descriptor;
}

function sectionUrnPattern(section: RecoverableSection): RegExp {
  const aliases: Record<RecoverableSection, string> = {
    connections: "connection",
    courses: "course|profilecourse",
    education: "education",
    featured: "featured|treasury",
    followers: "follower",
    honorsAwards: "honor|award",
    imagery: "image|photo|picture",
    interests: "interest",
    languages: "language",
    licensesCertifications: "certification|license",
    links: "link|website",
    organizations: "organization",
    patents: "patent",
    projects: "project",
    publications: "publication",
    recommendations: "recommendation",
    skills: "skill|profileskill|skillcategory",
    testScores: "testscore",
    volunteering: "volunteer",
    work: "position|experience|role"
  };
  return new RegExp(aliases[section], "i");
}

function sectionPageSummary(
  value: unknown,
  section: { collectionPattern: RegExp; entityUrnPattern: RegExp; keys: string[] }
): { pageSize: number; totalCount: number } {
  const summary = { pageSize: 0, totalCount: 0 };
  collectSectionPageSummary(value, summary, section, 0);
  return summary;
}

function collectSectionPageSummary(
  value: unknown,
  summary: { pageSize: number; totalCount: number },
  section: { collectionPattern: RegExp; entityUrnPattern: RegExp; keys: string[] },
  depth: number
): void {
  if (depth > 8) return;
  if (Array.isArray(value)) {
    for (const item of value) collectSectionPageSummary(item, summary, section, depth + 1);
    return;
  }

  const record = objectRecord(value);
  if (!record) return;

  for (const key of section.keys) {
    const directItems = record[key];
    if (Array.isArray(directItems)) {
      summary.pageSize = Math.max(summary.pageSize, directItems.length);
    }
  }

  if (
    isSectionCollectionRecord(record, section) ||
    recordHasSectionEntityReferences(record, section)
  ) {
    const elementCount = sectionRecordItemCount(record, section);
    if (elementCount) summary.pageSize = Math.max(summary.pageSize, elementCount);
    const paging = objectRecord(record.paging);
    const count = numericValue(paging?.count ?? record.count);
    const total = numericValue(
      paging?.total ??
        paging?.totalCount ??
        paging?.totalResults ??
        record.total ??
        record.totalCount ??
        record.totalResults
    );
    if (typeof count === "number" && !elementCount) {
      summary.pageSize = Math.max(summary.pageSize, count);
    }
    summary.totalCount = Math.max(summary.totalCount, total ?? count ?? elementCount);
  }

  for (const nested of Object.values(record)) {
    collectSectionPageSummary(nested, summary, section, depth + 1);
  }
}

function isSectionCollectionRecord(
  record: Record<string, unknown>,
  section: { collectionPattern: RegExp; entityUrnPattern: RegExp }
): boolean {
  const entityUrn = stringValue(record.entityUrn);
  if (entityUrn && section.entityUrnPattern.test(entityUrn)) return true;
  const typeNames = [
    stringValue(record.$type),
    stringValue(record.$recipeType),
    ...(Array.isArray(record.$recipeTypes)
      ? record.$recipeTypes.map((item) => stringValue(item))
      : [])
  ].filter(isPresent);
  return typeNames.some((typeName) => section.collectionPattern.test(typeName));
}

function recordHasSectionEntityReferences(
  record: Record<string, unknown>,
  section: { entityUrnPattern: RegExp; keys: string[] }
): boolean {
  for (const key of section.keys) {
    const items = record[key];
    if (!Array.isArray(items)) continue;
    if (
      items.some((item) => {
        const marker = stringValue(item);
        return marker ? section.entityUrnPattern.test(marker) : false;
      })
    ) {
      return true;
    }
  }
  return false;
}

function sectionRecordItemCount(
  record: Record<string, unknown>,
  section: { keys: string[] }
): number {
  let count = 0;
  for (const key of ["*elements", "elements", ...section.keys]) {
    const items = record[key];
    if (Array.isArray(items)) count = Math.max(count, items.length);
  }
  return count;
}

function supplementalDiagnostic(request: SupplementalRequest, payload: unknown): Diagnostic {
  const root = objectRecord(payload);
  const includedCount = Array.isArray(root?.included) ? root.included.length : 0;
  const summary = sectionPageSummary(payload, request.descriptor);
  const recoveredCount = sectionPayloadItemCount([payload], request.descriptor);
  if (recoveredCount <= 0) {
    return {
      code: `linkedin-voyager.supplement.${request.descriptor.section}.fetched`,
      level: "info",
      message: `${request.descriptor.label} recovery fetched ${request.kind} data but found no section-specific items.`,
      source: "linkedin-voyager"
    };
  }
  return {
    code: `coverage.${request.descriptor.section}.recovered`,
    level: "info",
    message: `${request.descriptor.label} recovery used ${request.kind} data with ${includedCount} included entities, ${recoveredCount} section item${recoveredCount === 1 ? "" : "s"}, page size ${summary.pageSize}, and advertised total ${summary.totalCount}.`,
    source: "linkedin-voyager"
  };
}

async function detailFrameSupplementalPayloads(
  descriptor: SectionRecoveryDescriptor,
  url: string,
  timeoutMs: number,
  targetCount = 0
): Promise<SupplementalPayloadResult> {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.tabIndex = -1;
  frame.style.cssText =
    "border:0;height:900px;left:-10000px;opacity:0;pointer-events:none;position:absolute;top:0;width:900px;";

  let result: SupplementalPayloadResult = { diagnostics: [], payloads: [] };
  try {
    result = await new Promise<SupplementalPayloadResult>((resolve) => {
      let settled = false;
      let best: SupplementalPayloadResult = { diagnostics: [], payloads: [] };
      let frameRscSections: DetailSectionItems = {};
      const readFrame = () => {
        try {
          const frameDocument = frame.contentDocument;
          if (!frameDocument) return best;
          best = mergeSupplementalResult(
            best,
            mergeSupplementalResult(supplementalResultFromDocument(frameDocument, descriptor), {
              diagnostics: [],
              domSections: frameRscSections,
              payloads: []
            })
          );
          return best;
        } catch {
          return best;
        }
      };
      const finish = () => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        window.clearInterval(scroller);
        resolve(readFrame());
      };
      const maybeFinish = () => {
        const current = readFrame();
        if (isDetailDocumentResultSettled(current, descriptor, targetCount)) finish();
      };
      const timer = window.setTimeout(
        finish,
        Math.min(timeoutMs, detailFrameRecoveryTimeoutMs(descriptor))
      );
      const scroller = window.setInterval(() => {
        const frameWindow = frame.contentWindow;
        const frameDocument = frame.contentDocument;
        if (!frameWindow || !frameDocument) {
          maybeFinish();
          return;
        }
        installFrameRscCapture(frameWindow, descriptor, targetCount, (items) => {
          frameRscSections = mergeDetailSectionItems(frameRscSections, items);
        });
        scrollDetailContainers(frameWindow, frameDocument);
        maybeFinish();
      }, 250);
      frame.addEventListener(
        "load",
        () => {
          const frameWindow = frame.contentWindow;
          if (frameWindow) {
            installFrameRscCapture(frameWindow, descriptor, targetCount, (items) => {
              frameRscSections = mergeDetailSectionItems(frameRscSections, items);
            });
          }
          window.setTimeout(maybeFinish, 250);
        },
        { once: true }
      );
      frame.src = url;
      document.documentElement.append(frame);
    });
  } finally {
    frame.remove();
  }

  if (!supplementalResultHasData(result, descriptor)) {
    return {
      diagnostics: [
        {
          code: `coverage.${descriptor.section}.unavailable`,
          level: "info",
          message: `${descriptor.label} temporary detail render did not expose supported embedded section data.`,
          source: "linkedin-voyager"
        }
      ],
      payloads: []
    };
  }

  return withSupplementalRecoveryDiagnostic(result, descriptor, "temporary detail render");
}

function installFrameRscCapture(
  frameWindow: Window,
  descriptor: SectionRecoveryDescriptor,
  targetCount: number,
  captureItems: (items: DetailSectionItems) => void
): void {
  const runtime = frameWindow as Window & {
    fetch: typeof fetch & { __linkedinProfileExporterFrameRscWrapped?: boolean };
  };
  if (runtime.fetch.__linkedinProfileExporterFrameRscWrapped) return;
  const originalFetch = runtime.fetch.bind(frameWindow);
  const wrappedFetch = (async (...args: Parameters<typeof fetch>) => {
    const response = await originalFetch(...args);
    try {
      const url = fetchRequestUrl(args);
      if (url.includes(RSC_PAGINATION_PATH)) {
        void response
          .clone()
          .text()
          .then((text) => {
            if (text) captureItems(rscDetailItemsFromText(text, descriptor, targetCount));
          })
          .catch(() => undefined);
      }
    } catch {
      // Best-effort same-origin RSC capture only.
    }
    return response;
  }) as typeof fetch & { __linkedinProfileExporterFrameRscWrapped?: boolean };
  wrappedFetch.__linkedinProfileExporterFrameRscWrapped = true;
  runtime.fetch = wrappedFetch;
}

function fetchRequestUrl(args: Parameters<typeof fetch>): string {
  const input = args[0];
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  if (typeof Request !== "undefined" && input instanceof Request) return input.url;
  const record = objectRecord(input);
  return typeof record?.url === "string" ? record.url : "";
}

async function detailTabSupplementalPayloads(
  descriptor: SectionRecoveryDescriptor,
  url: string,
  timeoutMs: number,
  targetCount = 0
): Promise<SupplementalPayloadResult> {
  try {
    const response = await sendRuntimeMessageWithTimeout(
      {
        type: "recover-detail-section-tab",
        section: descriptor.section,
        targetCount,
        timeoutMs: Math.min(timeoutMs, detailTabRecoveryTimeoutMs(descriptor)),
        url
      } satisfies RuntimeMessage,
      Math.min(timeoutMs, detailTabRecoveryTimeoutMs(descriptor) + 1_000)
    );
    if (!response.ok) {
      return {
        diagnostics: [
          {
            code: `linkedin-voyager.${descriptor.section}.detail-tab.failed`,
            level: "warning",
            message: `${descriptor.label} inactive detail tab recovery failed: ${response.error}.`,
            source: "linkedin-voyager"
          },
          {
            code: `coverage.${descriptor.section}.unavailable`,
            level: "warning",
            message: `${descriptor.label} inactive detail tab recovery failed: ${response.error}.`,
            source: "linkedin-voyager"
          }
        ],
        payloads: []
      };
    }
    const detail = "detail" in response ? response.detail : emptyDetailSectionResult();
    if (!supplementalResultHasData(detail, descriptor)) {
      return {
        diagnostics: [
          ...detail.diagnostics,
          {
            code: `coverage.${descriptor.section}.unavailable`,
            level: "info",
            message: `${descriptor.label} inactive detail tab did not expose supported section data.`,
            source: "linkedin-voyager"
          }
        ],
        payloads: []
      };
    }
    return withSupplementalRecoveryDiagnostic(detail, descriptor, "inactive detail tab");
  } catch (error) {
    return {
      diagnostics: [
        {
          code: `linkedin-voyager.${descriptor.section}.detail-tab.failed`,
          level: "warning",
          message: `${descriptor.label} inactive detail tab recovery was unavailable: ${errorMessage(error)}.`,
          source: "linkedin-voyager"
        },
        {
          code: `coverage.${descriptor.section}.unavailable`,
          level: "warning",
          message: `${descriptor.label} inactive detail tab recovery was unavailable: ${errorMessage(error)}.`,
          source: "linkedin-voyager"
        }
      ],
      payloads: []
    };
  }
}

function sendRuntimeMessageWithTimeout(
  message: RuntimeMessage,
  timeoutMs: number
): Promise<RuntimeResponse> {
  const runtime = ((
    globalThis as typeof globalThis & {
      chrome?: {
        runtime?: {
          lastError?: { message?: string };
          sendMessage?: (
            message: RuntimeMessage,
            callback: (response: RuntimeResponse | undefined) => void
          ) => Promise<RuntimeResponse> | void;
        };
      };
    }
  ).chrome?.runtime ?? browser.runtime) as {
    lastError?: { message?: string };
    sendMessage: (
      message: RuntimeMessage,
      callback?: (response: RuntimeResponse | undefined) => void
    ) => Promise<RuntimeResponse> | void;
  };
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (response: RuntimeResponse | undefined) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      if (response) resolve(response);
      else reject(new Error("Runtime message returned no response."));
    };
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      reject(error instanceof Error ? error : new Error(String(error)));
    };
    const timer = window.setTimeout(
      () => fail(new Error("Runtime detail-tab recovery message timed out.")),
      Math.max(1_000, timeoutMs)
    );
    try {
      const maybePromise = runtime.sendMessage(message, (response) => {
        const message = runtime.lastError?.message;
        if (message) fail(new Error(message));
        else finish(response);
      });
      if (maybePromise && typeof maybePromise.then === "function") {
        maybePromise.then(finish, fail);
      }
    } catch (error) {
      fail(error);
    }
  });
}

function cacheBustedDetailUrl(value: string): string {
  const url = safeUrl(value);
  if (!url) return value;
  url.searchParams.set("linkedin-profile-exporter-recovery", String(Date.now()));
  return url.toString();
}

function isCacheBustedDetailUrl(value: string): boolean {
  return Boolean(safeUrl(value)?.searchParams.has("linkedin-profile-exporter-recovery"));
}

function detailTabRecoveryTimeoutMs(descriptor: SectionRecoveryDescriptor): number {
  if (descriptor.section === "skills") return VOYAGER_DETAIL_TAB_RECOVERY_TIMEOUT_MS;
  if (descriptor.section === "courses") return 4_000;
  return VOYAGER_DETAIL_RENDER_TIMEOUT_MS;
}

function detailTabReserveTimeoutMs(descriptor: SectionRecoveryDescriptor): number {
  if (descriptor.section === "skills") return 8_000;
  if (descriptor.section === "courses") return 3_000;
  return 2_000;
}

function detailFrameRecoveryTimeoutMs(descriptor: SectionRecoveryDescriptor): number {
  return descriptor.section === "skills" || descriptor.section === "courses"
    ? 1_500
    : VOYAGER_DETAIL_FRAME_TIMEOUT_MS;
}

function detailFetchTimeoutMs(descriptor: SectionRecoveryDescriptor): number {
  return descriptor.section === "skills" || descriptor.section === "courses"
    ? VOYAGER_FETCH_TIMEOUT_MS
    : VOYAGER_DETAIL_FETCH_TIMEOUT_MS;
}

function shouldRetryCacheBustedDetailFetch(descriptor: SectionRecoveryDescriptor): boolean {
  void descriptor;
  return false;
}

function emptyDetailSectionResult(): DetailSectionResult {
  return { diagnostics: [], domSections: {}, payloads: [] };
}

async function detailPageSupplementalPayloads(
  descriptor: SectionRecoveryDescriptor,
  url: string,
  timeoutMs: number,
  allowCacheBustRetry = true
): Promise<SupplementalPayloadResult> {
  const controller = new AbortController();
  const timeout = window.setTimeout(
    () => controller.abort(),
    Math.min(timeoutMs, detailFetchTimeoutMs(descriptor))
  );
  let response: Response;
  try {
    response = await fetch(url, {
      cache: "no-store",
      credentials: "include",
      headers: {
        accept: "text/html,application/xhtml+xml"
      },
      method: "GET",
      mode: "cors",
      referrer: document.location.href,
      signal: controller.signal
    });
  } catch (error) {
    return {
      diagnostics: [
        {
          code: `coverage.${descriptor.section}.unavailable`,
          level: "warning",
          message: `${descriptor.label} details recovery failed: ${controller.signal.aborted ? "timed out" : errorMessage(error)}.`,
          source: "linkedin-voyager"
        }
      ],
      payloads: []
    };
  } finally {
    window.clearTimeout(timeout);
  }

  if (!response.ok) {
    if (
      allowCacheBustRetry &&
      shouldRetryCacheBustedDetailFetch(descriptor) &&
      !isCacheBustedDetailUrl(url)
    ) {
      const retry = await detailPageSupplementalPayloads(
        descriptor,
        cacheBustedDetailUrl(url),
        timeoutMs,
        false
      );
      if (supplementalResultHasData(retry, descriptor)) return retry;
    }
    return {
      diagnostics: [
        {
          code: `coverage.${descriptor.section}.unavailable`,
          level: response.status === 404 || response.status === 410 ? "info" : "warning",
          message: `${descriptor.label} details recovery returned ${response.status}.`,
          source: "linkedin-voyager"
        }
      ],
      payloads: []
    };
  }

  const html = await response.text();
  const parsed = new DOMParser().parseFromString(html, "text/html");
  const result = mergeSupplementalResult(supplementalResultFromDocument(parsed, descriptor), {
    diagnostics: [],
    payloads: voyagerPayloadsFromHtmlCodes(html, descriptor.htmlPattern)
  });
  if (!supplementalResultHasData(result, descriptor)) {
    return {
      diagnostics: [
        {
          code: `coverage.${descriptor.section}.unavailable`,
          level: "warning",
          message: `${descriptor.label} details recovery did not include supported embedded section data.`,
          source: "linkedin-voyager"
        }
      ],
      payloads: []
    };
  }

  return withSupplementalRecoveryDiagnostic(result, descriptor, "details recovery");
}

async function detailDocumentSupplementalPayloads(
  descriptor: SectionRecoveryDescriptor,
  timeoutMs: number,
  targetCount = 0
): Promise<SupplementalPayloadResult> {
  const rscPreferred = descriptor.section === "skills" || descriptor.section === "courses";
  const renderedTimeout = Math.min(timeoutMs, VOYAGER_DETAIL_RENDER_TIMEOUT_MS);
  const rscResultPromise = rscPaginationSupplementalPayloads(
    descriptor,
    rscPreferred
      ? Math.max(0, timeoutMs)
      : Math.max(0, timeoutMs - VOYAGER_DETAIL_RENDER_TIMEOUT_MS),
    targetCount
  );
  const renderedResult = await waitForDetailDocumentSupplementalResult(
    descriptor,
    renderedTimeout,
    targetCount
  );
  if (isDetailDocumentResultSettled(renderedResult, descriptor, targetCount)) {
    return withSupplementalRecoveryDiagnostic(renderedResult, descriptor, "current detail page");
  }
  const rscResult = await rscResultPromise;
  const result = mergeSupplementalResult(renderedResult, rscResult);
  if (!supplementalResultHasData(result, descriptor)) {
    return {
      diagnostics: [
        {
          code: `coverage.${descriptor.section}.unavailable`,
          level: "warning",
          message: `${descriptor.label} current detail page did not expose supported embedded section data.`,
          source: "linkedin-voyager"
        }
      ],
      payloads: []
    };
  }

  return withSupplementalRecoveryDiagnostic(result, descriptor, "current detail page");
}

async function currentDetailSupplementalPayloads(
  descriptor: SectionRecoveryDescriptor,
  timeoutMs: number,
  targetCount = 0
): Promise<SupplementalPayloadResult> {
  const documentResult = await detailDocumentSupplementalPayloads(
    descriptor,
    timeoutMs,
    targetCount
  );
  if (isDetailDocumentResultSettled(documentResult, descriptor, targetCount)) return documentResult;

  const fetchResult = await detailPageSupplementalPayloads(
    descriptor,
    document.location.href,
    Math.min(timeoutMs, VOYAGER_FETCH_TIMEOUT_MS)
  );
  const merged = mergeSupplementalResult(documentResult, fetchResult);
  return supplementalResultHasData(merged, descriptor) ? merged : documentResult;
}

async function rscPaginationSupplementalPayloads(
  descriptor: SectionRecoveryDescriptor,
  timeoutMs: number,
  targetCount = 0
): Promise<SupplementalPayloadResult> {
  if (descriptor.section !== "skills" && descriptor.section !== "courses") {
    return { diagnostics: [], payloads: [] };
  }
  const deadline = Date.now() + Math.max(0, timeoutMs);
  let captures = rscPaginationCaptures.filter((capture) =>
    rscCaptureMatchesSection(capture, descriptor)
  );
  while (!captures.length && Date.now() < deadline) {
    await delay(Math.min(250, Math.max(0, deadline - Date.now())));
    captures = rscPaginationCaptures.filter((capture) =>
      rscCaptureMatchesSection(capture, descriptor)
    );
  }
  if (!captures.length) return { diagnostics: [], payloads: [] };

  const domSections = domSectionsFromRscLabels(
    captures.flatMap((capture) => capture.labels),
    descriptor,
    targetCount
  );
  if (!detailSectionItemCount(domSections, descriptor.section)) {
    return { diagnostics: [], payloads: [] };
  }
  return {
    diagnostics: [
      {
        code: `coverage.${descriptor.section}.recovered`,
        level: "info",
        message: `${descriptor.label} recovery used LinkedIn RSC pagination with ${detailSectionItemCount(domSections, descriptor.section)} rendered item labels.`,
        source: "linkedin-rsc-pagination"
      }
    ],
    domSections,
    payloads: []
  };
}

function rscCaptureMatchesSection(
  capture: RscPaginationCapture,
  descriptor: SectionRecoveryDescriptor
): boolean {
  if (descriptor.section !== "skills" && descriptor.section !== "courses") return false;
  if (document.location.pathname.includes(`/${descriptor.detailPath ?? ""}`)) return true;
  return capture.sections.includes(descriptor.section);
}

function domSectionsFromRscLabels(
  labels: string[],
  descriptor: SectionRecoveryDescriptor,
  targetCount: number
): DetailSectionItems {
  const uniqueLabels = uniqueText(labels).slice(0, targetCount > 0 ? targetCount : undefined);
  if (descriptor.section === "skills") {
    return { skills: uniqueLabels.map((name) => ({ name })) };
  }
  if (descriptor.section === "courses") {
    return {
      courses: uniqueLabels.map((label) => {
        const parsed = courseNumberAndNameFromDetailText(label);
        return parsed.number ? parsed : { name: parsed.name };
      })
    };
  }
  return {};
}

function uniqueText(values: string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const value of values) {
    const normalized = value.replace(/\s+/g, " ").trim();
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) continue;
    seen.add(key);
    unique.push(normalized);
  }
  return unique;
}

function rscDetailItemsFromText(
  text: string,
  descriptor: SectionRecoveryDescriptor,
  targetCount = 0
): DetailSectionItems {
  const editLabels =
    descriptor.section === "courses"
      ? editAriaLabelsFromRscFields(text, "course")
      : descriptor.section === "skills"
        ? editAriaLabelsFromRscFields(text, "skill")
        : [];
  const fieldLabels =
    descriptor.section === "skills"
      ? stringFieldValuesFromRscText(text, ["skillName"])
      : descriptor.section === "courses"
        ? stringFieldValuesFromRscText(text, ["courseName", "title"])
        : [];
  const expressionLabels = displayedExpressionsFromRscText(text);
  const labels =
    descriptor.section === "skills"
      ? uniqueStrings([...editLabels, ...fieldLabels, ...expressionLabels]).filter(
          isLikelyRscItemLabel
        )
      : (editLabels.length
          ? editLabels
          : fieldLabels.length
            ? fieldLabels
            : expressionLabels
        ).filter(isLikelyRscItemLabel);
  if (!labels.length) return {};
  const boundedLabels = targetCount > 0 ? labels.slice(0, targetCount) : labels;
  if (descriptor.section === "skills") {
    return { skills: boundedLabels.map((name) => ({ name })) };
  }
  if (descriptor.section === "courses") {
    return { courses: boundedLabels.map((name) => ({ name })) };
  }
  return {};
}

function displayedExpressionsFromRscText(text: string): string[] {
  const labels = displayedExpressionsFromRscFields(text);
  for (const line of text.split(/\n/)) {
    const index = line.indexOf("[");
    if (index < 0) continue;
    try {
      collectDisplayedExpressions(JSON.parse(line.slice(index)), labels, 0);
    } catch {
      // Ignore non-JSON RSC control lines.
    }
  }
  return uniqueStrings(labels);
}

function displayedExpressionsFromRscFields(text: string): string[] {
  return stringFieldValuesFromRscText(text, ["displayedExpression"]);
}

function stringFieldValuesFromRscText(text: string, fields: string[]): string[] {
  const labels: string[] = [];
  for (const field of fields) {
    const pattern = new RegExp(
      `\\\\*"${escapeRegExp(field)}\\\\*"\\s*:\\s*\\\\*"((?:\\\\\\\\.|[^"\\\\])*)\\\\*"`,
      "g"
    );
    for (const match of text.matchAll(pattern)) {
      const raw = match[1];
      if (!raw) continue;
      labels.push(decodeRscStringValue(raw));
    }
  }
  return uniqueStrings(labels);
}

function decodeRscStringValue(raw: string): string {
  try {
    const decoded = JSON.parse(`"${raw}"`) as unknown;
    if (typeof decoded === "string") return decoded;
  } catch {
    // Fall through to a conservative escaped-quote cleanup.
  }
  return raw.replace(/\\"/g, '"');
}

function editAriaLabelsFromRscFields(text: string, kind: "course" | "skill"): string[] {
  const labels: string[] = [];
  const pattern = new RegExp(
    `"aria-label"\\s*:\\s*"Edit\\s+${kind}\\s+((?:\\\\.|[^"\\\\])*)"`,
    "gi"
  );
  for (const match of text.matchAll(pattern)) {
    const raw = match[1];
    if (!raw) continue;
    try {
      const decoded = JSON.parse(`"${raw}"`) as unknown;
      if (typeof decoded === "string") labels.push(decoded);
    } catch {
      labels.push(raw);
    }
  }
  return labels;
}

function collectDisplayedExpressions(value: unknown, labels: string[], depth: number): void {
  if (depth > 14) return;
  if (typeof value === "string") {
    for (const label of stringFieldValuesFromRscText(value, ["displayedExpression"])) {
      labels.push(label);
    }
    const trimmed = value.trim();
    if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
      try {
        collectDisplayedExpressions(JSON.parse(trimmed) as unknown, labels, depth + 1);
      } catch {
        // Ignore non-JSON string leaves.
      }
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectDisplayedExpressions(item, labels, depth + 1);
    return;
  }
  const record = objectRecord(value);
  if (!record) return;
  const displayedExpression = stringValue(record.displayedExpression);
  if (displayedExpression) labels.push(displayedExpression);
  for (const nested of Object.values(record))
    collectDisplayedExpressions(nested, labels, depth + 1);
}

function isLikelyRscItemLabel(value: string): boolean {
  const text = value.trim();
  if (text.length < 2 || text.length > 160) return false;
  if (/^(show all|show more|top skills|skills|courses|licenses|projects)$/i.test(text))
    return false;
  if (/^(associated with|endorsement|endorsed by|view|follow|message|connect)$/i.test(text))
    return false;
  return /[A-Za-z]/.test(text);
}

function isCurrentDetailDocument(path: string): boolean {
  const target = safeUrl(path);
  if (!target) return false;
  const current = new URL(document.location.href);
  return (
    current.origin === target.origin &&
    current.pathname.replace(/\/+$/, "") === target.pathname.replace(/\/+$/, "")
  );
}

async function waitForDetailDocumentSupplementalResult(
  descriptor: SectionRecoveryDescriptor,
  timeoutMs: number,
  targetCount = 0
): Promise<SupplementalPayloadResult> {
  const current = () => supplementalResultFromDocument(document, descriptor);
  let best = current();
  if (isDetailDocumentResultSettled(best, descriptor, targetCount)) return best;
  return new Promise((resolve) => {
    const updateBest = (): SupplementalPayloadResult => {
      best = mergeSupplementalResult(best, current());
      return best;
    };
    const observer = new MutationObserver(() => {
      const result = updateBest();
      if (!isDetailDocumentResultSettled(result, descriptor, targetCount)) return;
      window.clearTimeout(timeout);
      window.clearInterval(scroller);
      observer.disconnect();
      resolve(result);
    });
    const scroller = window.setInterval(() => {
      clickDetailExpansionControls(document);
      scrollDetailContainers(window, document);
      const result = updateBest();
      if (!isDetailDocumentResultSettled(result, descriptor, targetCount)) return;
      window.clearTimeout(timeout);
      window.clearInterval(scroller);
      observer.disconnect();
      resolve(result);
    }, 250);
    const timeout = window.setTimeout(() => {
      window.clearInterval(scroller);
      observer.disconnect();
      resolve(updateBest());
    }, timeoutMs);
    observer.observe(document.documentElement, { childList: true, subtree: true });
  });
}

function scrollDetailContainers(sourceWindow: Window, sourceDocument: Document): void {
  const candidates = [
    sourceDocument.scrollingElement,
    sourceDocument.documentElement,
    sourceDocument.body,
    ...Array.from(sourceDocument.querySelectorAll<HTMLElement>("main, [role='main']"))
  ].filter((element): element is HTMLElement => Boolean(element));
  for (const element of uniqueElements(candidates)) {
    const viewport =
      element === sourceDocument.scrollingElement
        ? sourceWindow.innerHeight || element.clientHeight || 800
        : element.clientHeight || 800;
    const maxScrollTop = Math.max(0, element.scrollHeight - viewport);
    if (maxScrollTop <= 4) continue;
    const nextScrollTop =
      element.scrollTop >= maxScrollTop - 4
        ? 0
        : Math.min(maxScrollTop, element.scrollTop + Math.max(360, Math.floor(viewport * 0.85)));
    element.scrollTop = nextScrollTop;
    if (element === sourceDocument.scrollingElement || element === sourceDocument.documentElement) {
      sourceWindow.scrollTo(0, nextScrollTop);
    }
  }
}

function uniqueElements<T extends Element>(elements: T[]): T[] {
  return Array.from(new Set(elements));
}

function clickDetailExpansionControls(sourceDocument: Document): void {
  for (const control of Array.from(sourceDocument.querySelectorAll<HTMLButtonElement>("button"))) {
    if (!isSafeExpansionButton(control)) continue;
    control.click();
  }
}

function mergeSupplementalResult(
  left: SupplementalPayloadResult,
  right: SupplementalPayloadResult
): SupplementalPayloadResult {
  return {
    diagnostics: [...left.diagnostics, ...right.diagnostics],
    domSections: mergeDetailSectionItems(left.domSections, right.domSections),
    payloads: [...left.payloads, ...right.payloads]
  };
}

function supplementalResultFromDocument(
  sourceDocument: Document,
  descriptor: SectionRecoveryDescriptor
): SupplementalPayloadResult {
  return {
    domSections: detailDomSectionsFromDocument(sourceDocument, descriptor),
    diagnostics: [],
    payloads: voyagerPayloadsFromDocument(sourceDocument, descriptor.htmlPattern)
  };
}

function withSupplementalRecoveryDiagnostic(
  result: SupplementalPayloadResult,
  descriptor: SectionRecoveryDescriptor,
  sourceLabel: string
): SupplementalPayloadResult {
  const includedCount = result.payloads.reduce<number>((count, payload) => {
    const root = objectRecord(payload);
    return count + (Array.isArray(root?.included) ? root.included.length : 0);
  }, 0);
  const renderedCount = detailSectionItemCount(result.domSections, descriptor.section);
  const payloadSectionCount = sectionPayloadItemCount(result.payloads, descriptor);
  const payloadMessage =
    result.payloads.length > 0
      ? `${result.payloads.length} embedded payload${result.payloads.length === 1 ? "" : "s"} with ${includedCount} included entities and ${payloadSectionCount} section item${payloadSectionCount === 1 ? "" : "s"}`
      : "no embedded payloads";
  const renderedMessage =
    renderedCount > 0
      ? ` and ${renderedCount} rendered detail row${renderedCount === 1 ? "" : "s"}`
      : "";
  return {
    ...result,
    diagnostics: [
      ...result.diagnostics,
      {
        code: `coverage.${descriptor.section}.recovered`,
        level: "info",
        message: `${descriptor.label} ${sourceLabel} found ${payloadMessage}${renderedMessage}.`,
        source: "linkedin-voyager"
      }
    ]
  };
}

function supplementalResultHasData(
  result: SupplementalPayloadResult,
  descriptor: SectionRecoveryDescriptor
): boolean {
  return (
    sectionPayloadItemCount(result.payloads, descriptor) > 0 ||
    detailSectionItemCount(result.domSections, descriptor.section) > 0
  );
}

function isDetailDocumentResultSettled(
  result: SupplementalPayloadResult,
  descriptor: SectionRecoveryDescriptor,
  targetCount = 0
): boolean {
  if (!supplementalResultHasData(result, descriptor)) return false;
  const profileId = profileIdFromLocation();
  if (
    profileId &&
    result.payloads.some(
      (payload) => paginationPathsFromPayload(payload, descriptor, profileId).length > 0
    )
  ) {
    return true;
  }
  const recoveredCount = Math.max(
    sectionRecoveredCount(result.payloads, descriptor),
    detailSectionItemCount(result.domSections, descriptor.section)
  );
  return isRecoveredCountSufficient(
    recoveredCount,
    descriptor,
    sectionRecoveryTargetCount(descriptor, result.payloads, targetCount)
  );
}

function voyagerPayloadsFromDocument(sourceDocument: Document, pattern: RegExp): unknown[] {
  return Array.from(sourceDocument.querySelectorAll<HTMLElement>('code[id^="bpr-guid-"]'))
    .map((element) => element.textContent)
    .filter((text): text is string => Boolean(text && pattern.test(text)))
    .flatMap((text) => {
      try {
        return [JSON.parse(text) as unknown];
      } catch {
        return [];
      }
    });
}

function voyagerPayloadsFromHtmlCodes(html: string, pattern: RegExp): unknown[] {
  return Array.from(
    html.matchAll(/<code\b[^>]*id=["']bpr-guid-[^"']*["'][^>]*>([\s\S]*?)<\/code>/gi)
  )
    .map((match) => decodeHtmlText(match[1] ?? ""))
    .filter((text): text is string => Boolean(text && pattern.test(text)))
    .flatMap((text) => {
      try {
        return [JSON.parse(text)];
      } catch {
        return [];
      }
    });
}

function decodeHtmlText(value: string): string {
  const textarea = document.createElement("textarea");
  textarea.innerHTML = value;
  return textarea.value;
}

function detailDomSectionsFromDocument(
  sourceDocument: Document,
  descriptor: SectionRecoveryDescriptor
): DetailSectionItems {
  if (descriptor.section === "skills") {
    const skills = extractDetailSkillsFromDocument(sourceDocument);
    return skills.length ? { skills } : {};
  }
  if (descriptor.section === "courses") {
    const courses = extractDetailCoursesFromDocument(sourceDocument);
    return courses.length ? { courses } : {};
  }
  if (descriptor.section === "education") {
    const education = extractDetailEducationFromDocument(sourceDocument);
    return education.length ? { education } : {};
  }
  if (descriptor.section === "featured") {
    const featured = extractDetailFeaturedFromDocument(sourceDocument);
    return featured.length ? { featured } : {};
  }
  if (descriptor.section === "honorsAwards") {
    const honorsAwards = extractDetailHonorsAwardsFromDocument(sourceDocument);
    return honorsAwards.length ? { honorsAwards } : {};
  }
  if (descriptor.section === "interests") {
    const interests = extractDetailInterestsFromDocument(sourceDocument);
    return interests.length ? { interests } : {};
  }
  if (descriptor.section === "languages") {
    const languages = extractDetailLanguagesFromDocument(sourceDocument);
    return languages.length ? { languages } : {};
  }
  if (descriptor.section === "licensesCertifications") {
    const licensesCertifications = extractDetailCertificationsFromDocument(sourceDocument);
    return licensesCertifications.length ? { licensesCertifications } : {};
  }
  if (descriptor.section === "organizations") {
    const organizations = extractDetailOrganizationsFromDocument(sourceDocument);
    return organizations.length ? { organizations } : {};
  }
  if (descriptor.section === "patents") {
    const patents = extractDetailPatentsFromDocument(sourceDocument);
    return patents.length ? { patents } : {};
  }
  if (descriptor.section === "projects") {
    const projects = extractDetailProjectsFromDocument(sourceDocument);
    return projects.length ? { projects } : {};
  }
  if (descriptor.section === "publications") {
    const publications = extractDetailPublicationsFromDocument(sourceDocument);
    return publications.length ? { publications } : {};
  }
  if (descriptor.section === "recommendations") {
    const recommendations = extractDetailRecommendationsFromDocument(sourceDocument);
    return recommendations.length ? { recommendations } : {};
  }
  if (descriptor.section === "testScores") {
    const testScores = extractDetailTestScoresFromDocument(sourceDocument);
    return testScores.length ? { testScores } : {};
  }
  if (descriptor.section === "volunteering") {
    const volunteering = extractDetailVolunteeringFromDocument(sourceDocument);
    return volunteering.length ? { volunteering } : {};
  }
  if (descriptor.section === "work") {
    const work = extractDetailWorkFromDocument(sourceDocument);
    return work.length ? { work } : {};
  }
  return {};
}

function extractDetailSkillsFromDocument(sourceDocument: Document): DetailSkill[] {
  return mergeDetailSkills(
    detailSkillItems(sourceDocument).flatMap((item) => {
      const name = detailSkillPrimaryText(item) ?? detailPrimaryText(item, "skills");
      if (!name) return [];
      const endorsements = endorsementCountFromText(detailItemText(item));
      return [
        {
          name,
          ...(typeof endorsements === "number" ? { endorsements } : {}),
          provenance: detailDomProvenance("skills"),
          confidence: 0.68
        }
      ];
    })
  );
}

function detailSkillItems(sourceDocument: Document): HTMLElement[] {
  const sduiItems = Array.from(
    sourceDocument.querySelectorAll<HTMLElement>(
      'main [componentkey*="profile.skill("], [role="main"] [componentkey*="profile.skill("]'
    )
  ).filter((item) => !item.parentElement?.closest('[componentkey*="profile.skill("]'));
  return sduiItems.length ? uniqueElements(sduiItems) : detailListItems(sourceDocument);
}

function detailSkillPrimaryText(item: HTMLElement): string | undefined {
  if (!item.getAttribute("componentkey")?.includes("profile.skill(")) return undefined;
  return detailLeafTexts(item).find((text) => !isIgnoredDetailPrimaryText(text, "skills"));
}

function extractDetailCoursesFromDocument(sourceDocument: Document): DetailCourse[] {
  return mergeDetailCourses(
    detailCourseItems(sourceDocument).flatMap((item) => {
      const sduiCourse = detailSduiCourseFromItem(item);
      const rawName = sduiCourse?.name ?? detailPrimaryText(item, "courses");
      if (!rawName) return [];
      const courseIdentity = courseNumberAndNameFromDetailText(rawName);
      const provider = sduiCourse?.provider ?? courseProviderFromDetailItem(item);
      const number = sduiCourse?.number ?? courseIdentity.number;
      return [
        {
          name: courseIdentity.name,
          ...(number ? { number } : {}),
          ...(provider ? { provider } : {}),
          provenance: detailDomProvenance("courses"),
          confidence: 0.64
        }
      ];
    })
  ).items;
}

function detailCourseItems(sourceDocument: Document): HTMLElement[] {
  const sduiItems = Array.from(
    sourceDocument.querySelectorAll<HTMLElement>(
      'main [componentkey*="CourseDetailsSection"] [componentkey^="entity-collection-item"], [role="main"] [componentkey*="CourseDetailsSection"] [componentkey^="entity-collection-item"]'
    )
  ).filter((item) => !item.parentElement?.closest('[componentkey^="entity-collection-item"]'));
  return sduiItems.length ? uniqueElements(sduiItems) : detailListItems(sourceDocument);
}

function detailSduiCourseFromItem(
  item: HTMLElement
): { name: string; number?: string; provider?: string } | undefined {
  if (!item.getAttribute("componentkey")?.startsWith("entity-collection-item")) return undefined;
  const texts = detailLeafTexts(item).filter(
    (text) => !isIgnoredDetailPrimaryText(text, "courses")
  );
  const name = texts[0];
  if (!name) return undefined;
  const number = texts.slice(1).find((text) => isLikelyCourseNumber(text));
  const associated = texts.find((text) => /^associated with\b/i.test(text));
  const provider = associated
    ? cleanDetailText(associated.replace(/^associated with\s+/i, ""))
    : undefined;
  return {
    name,
    ...(number ? { number } : {}),
    ...(provider ? { provider } : {})
  };
}

function detailLeafTexts(item: HTMLElement): string[] {
  return uniqueStrings(
    Array.from(item.querySelectorAll<HTMLElement>("*"))
      .filter((element) => element.children.length === 0)
      .map((element) => cleanDetailText(element.textContent ?? ""))
      .filter(isPresent)
  );
}

function isLikelyCourseNumber(value: string): boolean {
  return /^(?:[A-Z]{2,}\w*\s*\d[\w./-]*|Math\s*\d|Data\s*\d|Engin\s*\d|Chem\s*\d|Stat\s*\d|UGBA\s*\d)/i.test(
    value
  );
}

function extractDetailEducationFromDocument(sourceDocument: Document): DetailEducation[] {
  return mergeDetailEducation(
    detailListItems(sourceDocument).flatMap((item) => {
      const school = detailPrimaryText(item, "education");
      if (!school) return [];
      const fields = detailStructuredFields(item, school, "education");
      const degree = educationDegreeFromText(fields.primarySupporting);
      const field = educationFieldFromText(fields.primarySupporting);
      return [
        {
          school,
          ...(degree ? { degree } : {}),
          ...(field ? { field } : {}),
          ...(fields.date ? { dates: fields.date } : {}),
          ...(fields.description ? { description: fields.description } : {}),
          ...(fields.url ? { schoolUrl: fields.url } : {}),
          ...(fields.imageUrl ? { schoolLogoUrl: fields.imageUrl } : {}),
          provenance: detailDomProvenance("education"),
          confidence: 0.6
        }
      ];
    })
  );
}

function extractDetailCertificationsFromDocument(sourceDocument: Document): DetailCertification[] {
  return mergeDetailCertifications(
    detailListItems(sourceDocument).flatMap((item) => {
      const name = detailPrimaryText(item, "licensesCertifications");
      if (!name) return [];
      const fields = detailStructuredFields(item, name, "licensesCertifications");
      return [
        {
          name,
          ...(fields.primarySupporting ? { issuer: fields.primarySupporting } : {}),
          ...(fields.date ? { date: fields.date } : {}),
          ...(fields.credentialId ? { credentialId: fields.credentialId } : {}),
          ...(fields.url ? { credentialUrl: fields.url } : {}),
          ...(fields.imageUrl ? { issuerLogoUrl: fields.imageUrl } : {}),
          provenance: detailDomProvenance("licensesCertifications"),
          confidence: 0.6
        }
      ];
    })
  );
}

function extractDetailFeaturedFromDocument(sourceDocument: Document): DetailFeatured[] {
  return mergeDetailFeatured(
    detailListItems(sourceDocument).flatMap((item) => {
      const title = detailPrimaryText(item, "featured");
      if (!title) return [];
      const url = detailItemLink(item);
      const imageUrl = detailItemImage(item);
      const description = detailSupportingText(item, title, "featured");
      return [
        {
          title,
          ...(url ? { url } : {}),
          ...(imageUrl ? { imageUrl } : {}),
          ...(description ? { description } : {}),
          provenance: detailDomProvenance("featured"),
          confidence: 0.62
        }
      ];
    })
  );
}

function extractDetailHonorsAwardsFromDocument(sourceDocument: Document): DetailHonorAward[] {
  return mergeDetailHonorsAwards(
    detailListItems(sourceDocument).flatMap((item) => {
      const title = detailPrimaryText(item, "honorsAwards");
      if (!title) return [];
      const fields = detailStructuredFields(item, title, "honorsAwards");
      return [
        {
          title,
          ...(fields.primarySupporting ? { issuer: fields.primarySupporting } : {}),
          ...(fields.date ? { date: fields.date } : {}),
          ...(fields.description ? { description: fields.description } : {}),
          provenance: detailDomProvenance("honorsAwards"),
          confidence: 0.6
        }
      ];
    })
  );
}

function extractDetailInterestsFromDocument(sourceDocument: Document): DetailInterest[] {
  return mergeDetailInterests(
    detailListItems(sourceDocument).flatMap((item) => {
      const name = detailPrimaryText(item, "interests");
      if (!name) return [];
      const url = detailItemLink(item);
      return [
        {
          name,
          ...(url ? { url } : {}),
          provenance: detailDomProvenance("interests"),
          confidence: 0.62
        }
      ];
    })
  );
}

function extractDetailLanguagesFromDocument(sourceDocument: Document): DetailLanguage[] {
  return mergeDetailLanguages(
    detailListItems(sourceDocument).flatMap((item) => {
      const language = detailPrimaryText(item, "languages");
      if (!language) return [];
      const fields = detailStructuredFields(item, language, "languages");
      return [
        {
          language,
          ...(fields.primarySupporting ? { fluency: fields.primarySupporting } : {}),
          provenance: detailDomProvenance("languages"),
          confidence: 0.62
        }
      ];
    })
  );
}

function extractDetailOrganizationsFromDocument(sourceDocument: Document): DetailOrganization[] {
  return mergeDetailOrganizations(
    detailListItems(sourceDocument).flatMap((item) => {
      const name = detailPrimaryText(item, "organizations");
      if (!name) return [];
      const fields = detailStructuredFields(item, name, "organizations");
      return [
        {
          name,
          ...(fields.primarySupporting ? { role: fields.primarySupporting } : {}),
          ...(fields.date ? { dates: fields.date } : {}),
          ...(fields.description ? { description: fields.description } : {}),
          ...(fields.url ? { url: fields.url } : {}),
          ...(fields.imageUrl ? { logoUrl: fields.imageUrl } : {}),
          provenance: detailDomProvenance("organizations"),
          confidence: 0.6
        }
      ];
    })
  );
}

function extractDetailPatentsFromDocument(sourceDocument: Document): DetailPatent[] {
  return mergeDetailPatents(
    detailListItems(sourceDocument).flatMap((item) => {
      const title = detailPrimaryText(item, "patents");
      if (!title) return [];
      const fields = detailStructuredFields(item, title, "patents");
      const numbers = patentNumbersFromText(detailSearchText(item));
      return [
        {
          title,
          inventors: [],
          ...(fields.primarySupporting ? { issuer: fields.primarySupporting } : {}),
          ...(numbers.patentNumber ? { patentNumber: numbers.patentNumber } : {}),
          ...(numbers.applicationNumber ? { applicationNumber: numbers.applicationNumber } : {}),
          ...(fields.date ? { date: fields.date } : {}),
          ...(fields.url ? { url: fields.url } : {}),
          ...(fields.description ? { description: fields.description } : {}),
          provenance: detailDomProvenance("patents"),
          confidence: 0.6
        }
      ];
    })
  );
}

function extractDetailProjectsFromDocument(sourceDocument: Document): DetailProject[] {
  return mergeDetailProjects(
    detailListItems(sourceDocument).flatMap((item) => {
      const name = detailPrimaryText(item, "projects");
      if (!name) return [];
      const url = detailItemLink(item);
      const dates = detailDateText(item);
      const associatedWith = courseProviderFromDetailItem(item);
      const description = detailSupportingText(item, name, "projects");
      return [
        {
          name,
          ...(description ? { description } : {}),
          ...(url ? { url } : {}),
          ...(dates ? { dates } : {}),
          ...(associatedWith ? { associatedWith } : {}),
          provenance: detailDomProvenance("projects"),
          confidence: 0.62
        }
      ];
    })
  );
}

function extractDetailPublicationsFromDocument(sourceDocument: Document): DetailPublication[] {
  return mergeDetailPublications(
    detailListItems(sourceDocument).flatMap((item) => {
      const name = detailPrimaryText(item, "publications");
      if (!name) return [];
      const fields = detailStructuredFields(item, name, "publications");
      const authors = authorsFromDetailItem(item);
      return [
        {
          name,
          ...(fields.primarySupporting ? { publisher: fields.primarySupporting } : {}),
          ...(fields.date ? { date: fields.date } : {}),
          ...(fields.url ? { url: fields.url } : {}),
          ...(fields.description ? { description: fields.description } : {}),
          ...(authors.length ? { authors } : {}),
          provenance: detailDomProvenance("publications"),
          confidence: 0.6
        }
      ];
    })
  );
}

function extractDetailRecommendationsFromDocument(
  sourceDocument: Document
): DetailRecommendation[] {
  return mergeDetailRecommendations(
    detailListItems(sourceDocument).flatMap((item) => {
      const name = detailPrimaryText(item, "recommendations");
      if (!name) return [];
      const fields = detailStructuredFields(item, name, "recommendations");
      const text = fields.description ?? detailRecommendationText(item, name);
      if (!text) return [];
      return [
        {
          name,
          ...(fields.primarySupporting ? { relationship: fields.primarySupporting } : {}),
          text,
          provenance: detailDomProvenance("recommendations"),
          confidence: 0.58
        }
      ];
    })
  );
}

function extractDetailTestScoresFromDocument(sourceDocument: Document): DetailTestScore[] {
  return mergeDetailTestScores(
    detailListItems(sourceDocument).flatMap((item) => {
      const name = detailPrimaryText(item, "testScores");
      if (!name) return [];
      const fields = detailStructuredFields(item, name, "testScores");
      const score = testScoreFromText(detailSearchText(item));
      return [
        {
          name,
          ...(score
            ? { score }
            : fields.primarySupporting
              ? { score: fields.primarySupporting }
              : {}),
          ...(fields.date ? { date: fields.date } : {}),
          ...(fields.description ? { description: fields.description } : {}),
          provenance: detailDomProvenance("testScores"),
          confidence: 0.6
        }
      ];
    })
  );
}

function extractDetailVolunteeringFromDocument(sourceDocument: Document): DetailVolunteering[] {
  return mergeDetailVolunteering(
    detailListItems(sourceDocument).flatMap((item) => {
      const role = detailPrimaryText(item, "volunteering");
      if (!role) return [];
      const fields = detailStructuredFields(item, role, "volunteering");
      return [
        {
          role,
          organization: fields.primarySupporting ?? role,
          ...(fields.date ? { dates: fields.date } : {}),
          ...(fields.description ? { description: fields.description } : {}),
          ...(fields.url ? { organizationUrl: fields.url } : {}),
          ...(fields.imageUrl ? { organizationLogoUrl: fields.imageUrl } : {}),
          provenance: detailDomProvenance("volunteering"),
          confidence: 0.6
        }
      ];
    })
  );
}

function extractDetailWorkFromDocument(sourceDocument: Document): DetailWork[] {
  return mergeDetailWork(
    detailListItems(sourceDocument).flatMap((item) => {
      const title = detailPrimaryText(item, "work");
      if (!title) return [];
      const fields = detailStructuredFields(item, title, "work");
      const company = workCompanyFromText(fields.primarySupporting);
      const employmentType = workEmploymentTypeFromText(fields.primarySupporting);
      return [
        {
          title,
          roles: [],
          ...(company ? { company } : {}),
          ...(employmentType ? { employmentType } : {}),
          ...(fields.date ? { dates: fields.date } : {}),
          ...(fields.description ? { description: fields.description } : {}),
          ...(fields.url ? { companyUrl: fields.url } : {}),
          ...(fields.imageUrl ? { companyLogoUrl: fields.imageUrl } : {}),
          provenance: detailDomProvenance("work"),
          confidence: 0.6
        }
      ];
    })
  );
}

function detailListItems(sourceDocument: Document): HTMLElement[] {
  const selectors = [
    "main li.pvs-list__paged-list-item",
    "main li.artdeco-list__item",
    "main ul > li",
    "main [role='listitem']",
    "main [componentkey*='profile.skill']",
    "main [componentkey*='profile.course']",
    "[role='main'] li.pvs-list__paged-list-item",
    "[role='main'] li.artdeco-list__item",
    "[role='main'] ul > li",
    "[role='main'] [role='listitem']",
    "[role='main'] [componentkey*='profile.skill']",
    "[role='main'] [componentkey*='profile.course']"
  ];
  const seen = new Set<HTMLElement>();
  const items: HTMLElement[] = [];
  for (const selector of selectors) {
    for (const item of Array.from(sourceDocument.querySelectorAll<HTMLElement>(selector))) {
      if (seen.has(item)) continue;
      const text = detailItemText(item);
      if (!text || isIgnoredDetailRowText(text)) continue;
      seen.add(item);
      items.push(item);
    }
  }
  return items;
}

function detailPrimaryText(item: HTMLElement, section: DetailDomSection): string | undefined {
  return detailCandidateTexts(item).find((text) => !isIgnoredDetailPrimaryText(text, section));
}

function detailCandidateTexts(item: HTMLElement): string[] {
  const selector = [
    ".mr1.t-bold span[aria-hidden='true']",
    ".t-bold span[aria-hidden='true']",
    ".hoverable-link-text.t-bold span[aria-hidden='true']",
    "a[href] span[aria-hidden='true']",
    "h2",
    "h3",
    "span[aria-hidden='true']"
  ].join(", ");
  return uniqueStrings([
    ...Array.from(item.querySelectorAll<HTMLElement>(selector))
      .map((element) => cleanDetailText(element.textContent ?? ""))
      .filter(isPresent),
    ...detailTextLines(item)
  ]);
}

function detailTextLines(item: HTMLElement): string[] {
  const text = item.innerText || item.textContent || "";
  return uniqueStrings(
    text
      .split(/\n+| {2,}/)
      .map((line) => cleanDetailText(line))
      .filter(isPresent)
  );
}

function detailItemText(item: HTMLElement): string {
  return cleanDetailText(item.innerText || item.textContent || "") ?? "";
}

function detailSearchText(item: HTMLElement): string {
  return uniqueStrings([...detailCandidateTexts(item), detailItemText(item)]).join(" ");
}

function cleanDetailText(value: string): string | undefined {
  const cleaned = value
    .replace(/\u00a0/g, " ")
    .replace(/\u00c2(?=\s*[\u00b7\u2022])/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || undefined;
}

function isIgnoredDetailRowText(value: string): boolean {
  return /^(?:show|see|view)\s+(?:all|more)\b/i.test(value);
}

function isIgnoredDetailPrimaryText(value: string, section: DetailDomSection): boolean {
  const lower = value.toLowerCase();
  if (value.length > 160) return true;
  if (/^(?:show|see|view|add|edit|message|follow|connect)\b/i.test(value)) return true;
  if (/^open(?:\s|$)/i.test(value)) return true;
  if (/^(?:skills?|courses?)$/i.test(value)) return true;
  if (section === "education" && /^(?:education|schools?)$/i.test(value)) return true;
  if (lower.includes("endorsement")) return true;
  if (lower.includes("associated with")) return true;
  if (lower === "view project" || lower === "view featured") return true;
  if (
    section === "skills" &&
    /^(?:all|industry knowledge|tools\s*&\s*technologies|interpersonal skills?|other skills?|skills?|skill assessment|top skills?)$/i.test(
      value
    )
  ) {
    return true;
  }
  if (section === "courses" && /^(?:courses?|coursework)$/i.test(value)) return true;
  if (section === "featured" && /^(?:featured|media|link|document|post)$/i.test(value)) return true;
  if (section === "honorsAwards" && /^(?:honors?|awards?|honors & awards)$/i.test(value))
    return true;
  if (
    section === "interests" &&
    /^(?:interests?|companies|groups|newsletters|schools|top voices)$/i.test(value)
  )
    return true;
  if (section === "languages" && /^(?:languages?|proficiency)$/i.test(value)) return true;
  if (
    section === "licensesCertifications" &&
    /^(?:licenses?|certifications?|licenses & certifications)$/i.test(value)
  )
    return true;
  if (section === "organizations" && /^(?:organizations?|organization)$/i.test(value)) return true;
  if (section === "patents" && /^(?:patents?|inventors?)$/i.test(value)) return true;
  if (section === "projects" && /^(?:projects?|associated projects?)$/i.test(value)) return true;
  if (section === "publications" && /^(?:publications?|authors?)$/i.test(value)) return true;
  if (section === "recommendations" && /^(?:recommendations?|received|given)$/i.test(value))
    return true;
  if (section === "testScores" && /^(?:test scores?|scores?)$/i.test(value)) return true;
  if (section === "volunteering" && /^(?:volunteering|volunteer experience)$/i.test(value))
    return true;
  if (section === "work" && /^(?:experience|work|positions?|roles?)$/i.test(value)) return true;
  return false;
}

function endorsementCountFromText(value: string): number | undefined {
  const match = /(\d[\d,]*)\s+endorsement/i.exec(value);
  const count = match?.[1];
  if (!count) return undefined;
  return Number(count.replace(/,/g, ""));
}

function courseProviderFromDetailItem(item: HTMLElement): string | undefined {
  const texts = detailCandidateTexts(item);
  for (const text of texts) {
    const inline = /^associated with\s+(.+)$/i.exec(text);
    if (inline?.[1]) return cleanDetailText(inline[1]);
  }
  const associatedIndex = texts.findIndex((text) => /^associated with$/i.test(text));
  if (associatedIndex >= 0) return texts[associatedIndex + 1];
  return undefined;
}

function detailItemLink(item: HTMLElement): string | undefined {
  const anchor = Array.from(item.querySelectorAll<HTMLAnchorElement>("a[href]")).find((link) => {
    const href = link.href || link.getAttribute("href") || "";
    return href && !href.startsWith("javascript:");
  });
  return anchor?.href || undefined;
}

function detailItemImage(item: HTMLElement): string | undefined {
  const image = Array.from(item.querySelectorAll<HTMLImageElement>("img[src]")).find((img) =>
    Boolean(img.src)
  );
  return image?.src || undefined;
}

function detailSupportingText(
  item: HTMLElement,
  primaryText: string,
  section: DetailDomSection
): string | undefined {
  return detailSecondaryTexts(item, primaryText, section)[0];
}

function detailSecondaryTexts(
  item: HTMLElement,
  primaryText: string,
  section: DetailDomSection
): string[] {
  const primaryKey = normalizeDetailKey(primaryText);
  return detailCandidateTexts(item).filter((text) => {
    if (normalizeDetailKey(text) === primaryKey) return false;
    if (isIgnoredDetailPrimaryText(text, section)) return false;
    if (isDetailDateText(text)) return false;
    if (text.length > 500) return false;
    return true;
  });
}

function detailStructuredFields(
  item: HTMLElement,
  primaryText: string,
  section: DetailDomSection
): {
  credentialId?: string;
  date?: string;
  description?: string;
  imageUrl?: string;
  primarySupporting?: string;
  url?: string;
} {
  const secondaryTexts = detailSecondaryTexts(item, primaryText, section);
  const credentialId = credentialIdFromText(detailSearchText(item));
  const primarySupporting = secondaryTexts.find((text) => {
    if (/^(?:credential|license|patent|application|score)\b/i.test(text)) return false;
    return true;
  });
  const description = secondaryTexts.find((text) => {
    if (primarySupporting && normalizeDetailKey(text) === normalizeDetailKey(primarySupporting)) {
      return false;
    }
    if (/^(?:credential|license|patent|application|score)\b/i.test(text)) return false;
    if (credentialId && text.includes(credentialId)) return false;
    return text.length > 20;
  });
  const date = detailDateText(item);
  const imageUrl = detailItemImage(item);
  const url = detailItemLink(item);
  return {
    ...(credentialId ? { credentialId } : {}),
    ...(date ? { date } : {}),
    ...(description ? { description } : {}),
    ...(imageUrl ? { imageUrl } : {}),
    ...(primarySupporting ? { primarySupporting } : {}),
    ...(url ? { url } : {})
  };
}

function detailDateText(item: HTMLElement): string | undefined {
  return detailCandidateTexts(item).find(isDetailDateText);
}

function isDetailDateText(value: string): boolean {
  return /\b(?:present|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|\d{4})\b/i.test(value);
}

function credentialIdFromText(value: string): string | undefined {
  const match = /\b(?:credential|license)\s+(?:id|number)\s*[:#]?\s*([A-Z0-9._-]+)/i.exec(value);
  return match?.[1];
}

function patentNumbersFromText(value: string): {
  applicationNumber?: string;
  patentNumber?: string;
} {
  const patentNumber = /\bpatent\s+(?:number|#)\s*[:#]?\s*([A-Z0-9._-]+)/i.exec(value)?.[1];
  const applicationNumber = /\bapplication\s+(?:number|#)\s*[:#]?\s*([A-Z0-9._-]+)/i.exec(
    value
  )?.[1];
  return {
    ...(applicationNumber ? { applicationNumber } : {}),
    ...(patentNumber ? { patentNumber } : {})
  };
}

function testScoreFromText(value: string): string | undefined {
  const match = /\bscore\s*[:#]?\s*([A-Z0-9./+-]+)/i.exec(value);
  return match?.[1];
}

function authorsFromText(value: string): string[] {
  const match = /\bauthors?\s*[:#]?\s*([^.;]+)/i.exec(value);
  const authors = match?.[1];
  if (!authors) return [];
  return authors
    .split(/,|\band\b/i)
    .map((author) => cleanDetailText(author))
    .filter(isPresent);
}

function authorsFromDetailItem(item: HTMLElement): string[] {
  for (const text of detailCandidateTexts(item)) {
    const authors = authorsFromText(text);
    if (authors.length) return authors;
  }
  return authorsFromText(detailSearchText(item));
}

function workCompanyFromText(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return cleanDetailText(value.split(/·|\|/)[0] ?? value);
}

function workEmploymentTypeFromText(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return cleanDetailText(value.split(/·|\|/).slice(1).join(" "));
}

function educationDegreeFromText(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return cleanDetailText(value.split(/,|\bin\b/i)[0] ?? value);
}

function educationFieldFromText(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const inMatch = /\bin\s+(.+)$/i.exec(value);
  if (inMatch?.[1]) return cleanDetailText(inMatch[1]);
  const [, field] = value.split(/,\s*/, 2);
  return cleanDetailText(field ?? "");
}

function detailRecommendationText(item: HTMLElement, name: string): string | undefined {
  const nameKey = normalizeDetailKey(name);
  return detailCandidateTexts(item)
    .filter((text) => normalizeDetailKey(text) !== nameKey)
    .filter((text) => !isDetailDateText(text))
    .sort((left, right) => right.length - left.length)[0];
}

function courseNumberAndNameFromDetailText(value: string): { name: string; number?: string } {
  const match = /^([A-Z]{2,}[\w.-]*\s?\d[\w.-]*)\s*[-–:]\s*(.+)$/.exec(value);
  const number = match?.[1];
  const name = match?.[2];
  if (!number || !name) return { name: value };
  return {
    number: number.replace(/\s+/g, " ").trim(),
    name: name.trim()
  };
}

function detailDomProvenance(section: DetailDomSection): Profile["identity"]["provenance"] {
  return {
    sourceType: "dom",
    source: `linkedin-detail-dom.${section}`,
    selector: "main li",
    capturedAt: new Date().toISOString()
  };
}

function detailSectionItemCount(
  domSections: DetailSectionItems | undefined,
  section: RecoverableSection
): number {
  if (section === "skills") return domSections?.skills?.length ?? 0;
  if (section === "courses") return domSections?.courses?.length ?? 0;
  if (section === "education") return domSections?.education?.length ?? 0;
  if (section === "featured") return domSections?.featured?.length ?? 0;
  if (section === "honorsAwards") return domSections?.honorsAwards?.length ?? 0;
  if (section === "interests") return domSections?.interests?.length ?? 0;
  if (section === "languages") return domSections?.languages?.length ?? 0;
  if (section === "licensesCertifications") return domSections?.licensesCertifications?.length ?? 0;
  if (section === "organizations") return domSections?.organizations?.length ?? 0;
  if (section === "patents") return domSections?.patents?.length ?? 0;
  if (section === "projects") return domSections?.projects?.length ?? 0;
  if (section === "publications") return domSections?.publications?.length ?? 0;
  if (section === "recommendations") return domSections?.recommendations?.length ?? 0;
  if (section === "testScores") return domSections?.testScores?.length ?? 0;
  if (section === "volunteering") return domSections?.volunteering?.length ?? 0;
  if (section === "work") return domSections?.work?.length ?? 0;
  return 0;
}

function isDetailSectionItemsSufficient(
  domSections: DetailSectionItems | undefined,
  descriptor: SectionRecoveryDescriptor,
  targetCount = sectionRecoveryTargetCount(descriptor)
): boolean {
  const count = detailSectionItemCount(domSections, descriptor.section);
  return isRecoveredCountSufficient(count, descriptor, targetCount);
}

function mergeDetailSectionItems(
  left: DetailSectionItems | undefined,
  right: DetailSectionItems | undefined
): DetailSectionItems {
  if (!left && !right) return {};
  return {
    ...(left?.skills?.length || right?.skills?.length
      ? { skills: mergeDetailSkillSections(left?.skills ?? [], right?.skills ?? []) }
      : {}),
    ...(left?.courses?.length || right?.courses?.length
      ? {
          courses: mergeDetailCourseSections(left?.courses ?? [], right?.courses ?? []).items
        }
      : {}),
    ...(left?.education?.length || right?.education?.length
      ? {
          education: mergeDetailEducation([...(left?.education ?? []), ...(right?.education ?? [])])
        }
      : {}),
    ...(left?.featured?.length || right?.featured?.length
      ? {
          featured: mergeDetailFeatured([...(left?.featured ?? []), ...(right?.featured ?? [])])
        }
      : {}),
    ...(left?.honorsAwards?.length || right?.honorsAwards?.length
      ? {
          honorsAwards: mergeDetailHonorsAwards([
            ...(left?.honorsAwards ?? []),
            ...(right?.honorsAwards ?? [])
          ])
        }
      : {}),
    ...(left?.interests?.length || right?.interests?.length
      ? {
          interests: mergeDetailInterests([...(left?.interests ?? []), ...(right?.interests ?? [])])
        }
      : {}),
    ...(left?.languages?.length || right?.languages?.length
      ? {
          languages: mergeDetailLanguages([...(left?.languages ?? []), ...(right?.languages ?? [])])
        }
      : {}),
    ...(left?.licensesCertifications?.length || right?.licensesCertifications?.length
      ? {
          licensesCertifications: mergeDetailCertifications([
            ...(left?.licensesCertifications ?? []),
            ...(right?.licensesCertifications ?? [])
          ])
        }
      : {}),
    ...(left?.organizations?.length || right?.organizations?.length
      ? {
          organizations: mergeDetailOrganizations([
            ...(left?.organizations ?? []),
            ...(right?.organizations ?? [])
          ])
        }
      : {}),
    ...(left?.patents?.length || right?.patents?.length
      ? {
          patents: mergeDetailPatents([...(left?.patents ?? []), ...(right?.patents ?? [])])
        }
      : {}),
    ...(left?.projects?.length || right?.projects?.length
      ? {
          projects: mergeDetailProjects([...(left?.projects ?? []), ...(right?.projects ?? [])])
        }
      : {}),
    ...(left?.publications?.length || right?.publications?.length
      ? {
          publications: mergeDetailPublications([
            ...(left?.publications ?? []),
            ...(right?.publications ?? [])
          ])
        }
      : {}),
    ...(left?.recommendations?.length || right?.recommendations?.length
      ? {
          recommendations: mergeDetailRecommendations([
            ...(left?.recommendations ?? []),
            ...(right?.recommendations ?? [])
          ])
        }
      : {}),
    ...(left?.testScores?.length || right?.testScores?.length
      ? {
          testScores: mergeDetailTestScores([
            ...(left?.testScores ?? []),
            ...(right?.testScores ?? [])
          ])
        }
      : {}),
    ...(left?.volunteering?.length || right?.volunteering?.length
      ? {
          volunteering: mergeDetailVolunteering([
            ...(left?.volunteering ?? []),
            ...(right?.volunteering ?? [])
          ])
        }
      : {}),
    ...(left?.work?.length || right?.work?.length
      ? {
          work: mergeDetailWork([...(left?.work ?? []), ...(right?.work ?? [])])
        }
      : {})
  };
}

function mergeDetailSectionsIntoProfile(
  profile: Profile,
  domSections: DetailSectionItems | undefined
): Profile {
  if (
    !domSections?.skills?.length &&
    !domSections?.courses?.length &&
    !domSections?.education?.length &&
    !domSections?.featured?.length &&
    !domSections?.honorsAwards?.length &&
    !domSections?.interests?.length &&
    !domSections?.languages?.length &&
    !domSections?.licensesCertifications?.length &&
    !domSections?.organizations?.length &&
    !domSections?.patents?.length &&
    !domSections?.projects?.length &&
    !domSections?.publications?.length &&
    !domSections?.recommendations?.length &&
    !domSections?.testScores?.length &&
    !domSections?.volunteering?.length &&
    !domSections?.work?.length
  ) {
    return profile;
  }
  const diagnostics = [...profile.diagnostics];
  const mergedSkills = domSections.skills?.length
    ? mergeDetailSkillsForProfile(profile.skills, domSections.skills)
    : profile.skills;
  const mergedCourses = domSections.courses?.length
    ? mergeDetailCoursesForProfile(profile.courses, domSections.courses)
    : { duplicateCount: 0, items: profile.courses };
  const mergedEducation = domSections.education?.length
    ? mergeDetailEducation([...profile.education, ...domSections.education])
    : profile.education;
  const mergedFeatured = domSections.featured?.length
    ? mergeDetailFeatured([...profile.featured, ...domSections.featured])
    : profile.featured;
  const mergedHonorsAwards = domSections.honorsAwards?.length
    ? mergeDetailHonorsAwards([...profile.honorsAwards, ...domSections.honorsAwards])
    : profile.honorsAwards;
  const mergedInterests = domSections.interests?.length
    ? mergeDetailInterests([...profile.interests, ...domSections.interests])
    : profile.interests;
  const mergedLanguages = domSections.languages?.length
    ? mergeDetailLanguages([...profile.languages, ...domSections.languages])
    : profile.languages;
  const mergedLicensesCertifications = domSections.licensesCertifications?.length
    ? mergeDetailCertifications([
        ...profile.licensesCertifications,
        ...domSections.licensesCertifications
      ])
    : profile.licensesCertifications;
  const mergedOrganizations = domSections.organizations?.length
    ? mergeDetailOrganizations([...profile.organizations, ...domSections.organizations])
    : profile.organizations;
  const mergedPatents = domSections.patents?.length
    ? mergeDetailPatents([...profile.patents, ...domSections.patents])
    : profile.patents;
  const mergedProjects = domSections.projects?.length
    ? mergeDetailProjects([...profile.projects, ...domSections.projects])
    : profile.projects;
  const mergedPublications = domSections.publications?.length
    ? mergeDetailPublications([...profile.publications, ...domSections.publications])
    : profile.publications;
  const mergedRecommendations = domSections.recommendations?.length
    ? mergeDetailRecommendations([...profile.recommendations, ...domSections.recommendations])
    : profile.recommendations;
  const mergedTestScores = domSections.testScores?.length
    ? mergeDetailTestScores([...profile.testScores, ...domSections.testScores])
    : profile.testScores;
  const mergedVolunteering = domSections.volunteering?.length
    ? mergeDetailVolunteering([...profile.volunteering, ...domSections.volunteering])
    : profile.volunteering;
  const mergedWork = domSections.work?.length
    ? mergeDetailWork([...profile.work, ...domSections.work])
    : profile.work;

  const addedSkills = mergedSkills.length - profile.skills.length;
  if (addedSkills > 0) {
    pushDiagnosticOnce(diagnostics, {
      code: "coverage.skills.recovered",
      level: "info",
      message: `Skills detail rendering contributed ${addedSkills} additional unique skill${addedSkills === 1 ? "" : "s"}.`,
      source: "linkedin-detail-dom"
    });
  }

  const addedCourses = mergedCourses.items.length - profile.courses.length;
  if (addedCourses > 0) {
    pushDiagnosticOnce(diagnostics, {
      code: "coverage.courses.recovered",
      level: "info",
      message: `Courses detail rendering contributed ${addedCourses} additional unique course${addedCourses === 1 ? "" : "s"}.`,
      source: "linkedin-detail-dom"
    });
  }
  if (mergedCourses.duplicateCount > 0) {
    pushDiagnosticOnce(diagnostics, {
      code: "coverage.courses.deduplicated",
      level: "info",
      message: "Course detail rendering merged duplicate normalized records.",
      source: "linkedin-detail-dom"
    });
  }
  pushSectionRecoveredDiagnostic(
    diagnostics,
    "education",
    "Education",
    mergedEducation.length - profile.education.length
  );
  const addedFeatured = mergedFeatured.length - profile.featured.length;
  if (addedFeatured > 0) {
    pushDiagnosticOnce(diagnostics, {
      code: "coverage.featured.recovered",
      level: "info",
      message: `Featured detail rendering contributed ${addedFeatured} additional unique item${addedFeatured === 1 ? "" : "s"}.`,
      source: "linkedin-detail-dom"
    });
  }
  pushSectionRecoveredDiagnostic(
    diagnostics,
    "honorsAwards",
    "Honors",
    mergedHonorsAwards.length - profile.honorsAwards.length
  );
  const addedInterests = mergedInterests.length - profile.interests.length;
  if (addedInterests > 0) {
    pushDiagnosticOnce(diagnostics, {
      code: "coverage.interests.recovered",
      level: "info",
      message: `Interests detail rendering contributed ${addedInterests} additional unique interest${addedInterests === 1 ? "" : "s"}.`,
      source: "linkedin-detail-dom"
    });
  }
  pushSectionRecoveredDiagnostic(
    diagnostics,
    "languages",
    "Languages",
    mergedLanguages.length - profile.languages.length
  );
  pushSectionRecoveredDiagnostic(
    diagnostics,
    "licensesCertifications",
    "Licenses and certifications",
    mergedLicensesCertifications.length - profile.licensesCertifications.length
  );
  pushSectionRecoveredDiagnostic(
    diagnostics,
    "organizations",
    "Organizations",
    mergedOrganizations.length - profile.organizations.length
  );
  pushSectionRecoveredDiagnostic(
    diagnostics,
    "patents",
    "Patents",
    mergedPatents.length - profile.patents.length
  );
  const addedProjects = mergedProjects.length - profile.projects.length;
  if (addedProjects > 0) {
    pushDiagnosticOnce(diagnostics, {
      code: "coverage.projects.recovered",
      level: "info",
      message: `Projects detail rendering contributed ${addedProjects} additional unique project${addedProjects === 1 ? "" : "s"}.`,
      source: "linkedin-detail-dom"
    });
  }
  pushSectionRecoveredDiagnostic(
    diagnostics,
    "publications",
    "Publications",
    mergedPublications.length - profile.publications.length
  );
  pushSectionRecoveredDiagnostic(
    diagnostics,
    "recommendations",
    "Recommendations",
    mergedRecommendations.length - profile.recommendations.length
  );
  pushSectionRecoveredDiagnostic(
    diagnostics,
    "testScores",
    "Test scores",
    mergedTestScores.length - profile.testScores.length
  );
  pushSectionRecoveredDiagnostic(
    diagnostics,
    "volunteering",
    "Volunteering",
    mergedVolunteering.length - profile.volunteering.length
  );
  pushSectionRecoveredDiagnostic(
    diagnostics,
    "work",
    "Experience",
    mergedWork.length - profile.work.length
  );

  return {
    ...profile,
    skills: mergedSkills,
    courses: mergedCourses.items,
    education: mergedEducation,
    featured: mergedFeatured,
    honorsAwards: mergedHonorsAwards,
    interests: mergedInterests,
    languages: mergedLanguages,
    licensesCertifications: mergedLicensesCertifications,
    organizations: mergedOrganizations,
    patents: mergedPatents,
    projects: mergedProjects,
    publications: mergedPublications,
    recommendations: mergedRecommendations,
    testScores: mergedTestScores,
    volunteering: mergedVolunteering,
    work: mergedWork,
    diagnostics
  };
}

function pushSectionRecoveredDiagnostic(
  diagnostics: Diagnostic[],
  section: RecoverableSection,
  label: string,
  addedCount: number
): void {
  if (addedCount <= 0) return;
  pushDiagnosticOnce(diagnostics, {
    code: `coverage.${section}.recovered`,
    level: "info",
    message: `${label} detail rendering contributed ${addedCount} additional unique item${addedCount === 1 ? "" : "s"}.`,
    source: "linkedin-detail-dom"
  });
}

function mergeDetailSkills(skills: DetailSkill[]): DetailSkill[] {
  const byName = new Map<string, DetailSkill>();
  for (const skill of skills) {
    const key = normalizeDetailKey(skill.name);
    if (!key) continue;
    const existing = byName.get(key);
    if (!existing) {
      byName.set(key, skill);
      continue;
    }
    const merged: DetailSkill = {
      ...existing,
      endorsements: existing.endorsements ?? skill.endorsements,
      provenance: existing.provenance ?? skill.provenance
    };
    const confidence = [existing.confidence, skill.confidence].filter(
      (value): value is number => typeof value === "number"
    );
    if (confidence.length) merged.confidence = Math.max(...confidence);
    byName.set(key, merged);
  }
  return Array.from(byName.values());
}

function mergeDetailSkillSections(
  leftSkills: DetailSkill[],
  rightSkills: DetailSkill[]
): DetailSkill[] {
  const left = mergeDetailSkills(leftSkills);
  const right = mergeDetailSkills(rightSkills);
  const target = authoritativeSkillTarget();
  if (target > 0) {
    const completeCandidates = [left, right].filter((skills) => skills.length >= target);
    if (completeCandidates.length) {
      return [...completeCandidates].sort((a, b) => a.length - b.length)[0] ?? [];
    }
  }
  return mergeDetailSkills([...left, ...right]);
}

function mergeDetailSkillsForProfile(
  profileSkills: DetailSkill[],
  detailSkills: DetailSkill[]
): DetailSkill[] {
  const authoritativeTarget = authoritativeSkillTarget();
  if (authoritativeTarget > 0 && detailSkills.length >= authoritativeTarget) {
    const byProfileName = new Map(
      profileSkills
        .map((skill): [string, DetailSkill] | undefined => {
          const key = normalizeDetailKey(skill.name);
          return key ? [key, skill] : undefined;
        })
        .filter((entry): entry is [string, DetailSkill] => Boolean(entry))
    );
    return mergeDetailSkills(
      detailSkills.flatMap((detailSkill) => {
        const profileSkill = byProfileName.get(normalizeDetailKey(detailSkill.name));
        return profileSkill ? [detailSkill, profileSkill] : [detailSkill];
      })
    );
  }
  return mergeDetailSkills([...profileSkills, ...detailSkills]);
}

function authoritativeSkillTarget(): number {
  const descriptor = descriptorBySection("skills");
  return recoveryAdvertisedSectionCountFromDocument(descriptor) ?? 0;
}

function mergeDetailCertifications(items: DetailCertification[]): DetailCertification[] {
  return mergeDetailRecords(items, detailCertificationIdentityKey);
}

function mergeDetailEducation(items: DetailEducation[]): DetailEducation[] {
  return mergeDetailRecords(items, detailEducationIdentityKey);
}

function mergeDetailCourses(courses: DetailCourse[]): {
  duplicateCount: number;
  items: DetailCourse[];
} {
  const byIdentity = new Map<string, DetailCourse[]>();
  for (const course of courses) {
    const key = detailCourseIdentityKey(course);
    if (!key) continue;
    const bucket = byIdentity.get(key) ?? [];
    bucket.push(course);
    byIdentity.set(key, bucket);
  }

  let duplicateCount = 0;
  const items: DetailCourse[] = [];
  for (const bucket of byIdentity.values()) {
    duplicateCount += Math.max(0, bucket.length - 1);
    items.push(mergeDetailCourseGroup(bucket));
  }
  return { duplicateCount, items };
}

function mergeDetailCourseSections(
  leftCourses: DetailCourse[],
  rightCourses: DetailCourse[]
): {
  duplicateCount: number;
  items: DetailCourse[];
} {
  const left = mergeDetailCourses(leftCourses);
  const right = mergeDetailCourses(rightCourses);
  const target = authoritativeCourseTarget();
  if (target > 0) {
    const completeCandidates = [left, right].filter((courses) => courses.items.length >= target);
    if (completeCandidates.length) {
      return (
        [...completeCandidates].sort((a, b) => a.items.length - b.items.length)[0] ?? {
          duplicateCount: 0,
          items: []
        }
      );
    }
  }
  return mergeDetailCourses([...left.items, ...right.items]);
}

function mergeDetailCoursesForProfile(
  profileCourses: DetailCourse[],
  detailCourses: DetailCourse[]
): {
  duplicateCount: number;
  items: DetailCourse[];
} {
  const target = authoritativeCourseTarget();
  if (target > 0 && detailCourses.length >= target) {
    const byProfileKey = new Map<string, DetailCourse>();
    for (const profileCourse of profileCourses) {
      for (const key of detailCourseMergeKeys(profileCourse)) {
        if (!byProfileKey.has(key)) byProfileKey.set(key, profileCourse);
      }
    }
    return mergeDetailCourses(
      detailCourses.map((detailCourse) => {
        const profileCourse = detailCourseMergeKeys(detailCourse)
          .map((key) => byProfileKey.get(key))
          .find(isPresent);
        return profileCourse ? mergeDetailCourseGroup([detailCourse, profileCourse]) : detailCourse;
      })
    );
  }
  return mergeDetailCourses([...profileCourses, ...detailCourses]);
}

function authoritativeCourseTarget(): number {
  const descriptor = descriptorBySection("courses");
  return recoveryAdvertisedSectionCountFromDocument(descriptor) ?? 0;
}

function mergeDetailHonorsAwards(items: DetailHonorAward[]): DetailHonorAward[] {
  return mergeDetailRecords(items, detailHonorAwardIdentityKey);
}

function mergeDetailInterests(interests: DetailInterest[]): DetailInterest[] {
  const byIdentity = new Map<string, DetailInterest>();
  for (const interest of interests) {
    const key = detailInterestIdentityKey(interest);
    if (!key) continue;
    const existing = byIdentity.get(key);
    if (!existing) {
      byIdentity.set(key, interest);
      continue;
    }
    const merged: DetailInterest = {
      ...existing,
      url: existing.url ?? interest.url,
      provenance: existing.provenance ?? interest.provenance
    };
    const confidence = [existing.confidence, interest.confidence].filter(
      (value): value is number => typeof value === "number"
    );
    if (confidence.length) merged.confidence = Math.max(...confidence);
    byIdentity.set(key, merged);
  }
  return Array.from(byIdentity.values());
}

function mergeDetailLanguages(items: DetailLanguage[]): DetailLanguage[] {
  return mergeDetailRecords(items, (item) => `language:${normalizeDetailKey(item.language)}`);
}

function mergeDetailOrganizations(items: DetailOrganization[]): DetailOrganization[] {
  return mergeDetailRecords(items, detailOrganizationIdentityKey);
}

function mergeDetailPatents(items: DetailPatent[]): DetailPatent[] {
  return mergeDetailRecords(items, detailPatentIdentityKey);
}

function mergeDetailFeatured(items: DetailFeatured[]): DetailFeatured[] {
  const byIdentity = new Map<string, DetailFeatured>();
  for (const item of items) {
    const key = detailFeaturedIdentityKey(item);
    if (!key) continue;
    const existing = byIdentity.get(key);
    if (!existing) {
      byIdentity.set(key, item);
      continue;
    }
    const merged: DetailFeatured = {
      ...existing,
      type: existing.type ?? item.type,
      url: existing.url ?? item.url,
      imageUrl: existing.imageUrl ?? item.imageUrl,
      description: existing.description ?? item.description,
      provenance: existing.provenance ?? item.provenance
    };
    const confidence = [existing.confidence, item.confidence].filter(
      (value): value is number => typeof value === "number"
    );
    if (confidence.length) merged.confidence = Math.max(...confidence);
    byIdentity.set(key, merged);
  }
  return Array.from(byIdentity.values());
}

function mergeDetailPublications(items: DetailPublication[]): DetailPublication[] {
  return mergeDetailRecords(items, detailPublicationIdentityKey);
}

function mergeDetailRecommendations(items: DetailRecommendation[]): DetailRecommendation[] {
  return mergeDetailRecords(items, detailRecommendationIdentityKey);
}

function mergeDetailTestScores(items: DetailTestScore[]): DetailTestScore[] {
  return mergeDetailRecords(items, detailTestScoreIdentityKey);
}

function mergeDetailVolunteering(items: DetailVolunteering[]): DetailVolunteering[] {
  return mergeDetailRecords(items, detailVolunteeringIdentityKey);
}

function mergeDetailWork(items: DetailWork[]): DetailWork[] {
  return mergeDetailRecords(items, detailWorkIdentityKey);
}

function mergeDetailProjects(projects: DetailProject[]): DetailProject[] {
  const byIdentity = new Map<string, DetailProject>();
  for (const project of projects) {
    const key = detailProjectIdentityKey(project);
    if (!key) continue;
    const existing = byIdentity.get(key);
    if (!existing) {
      byIdentity.set(key, project);
      continue;
    }
    const merged: DetailProject = {
      ...existing,
      description: existing.description ?? project.description,
      url: existing.url ?? project.url,
      dates: existing.dates ?? project.dates,
      associatedWith: existing.associatedWith ?? project.associatedWith,
      contributors: existing.contributors ?? project.contributors,
      provenance: existing.provenance ?? project.provenance
    };
    const confidence = [existing.confidence, project.confidence].filter(
      (value): value is number => typeof value === "number"
    );
    if (confidence.length) merged.confidence = Math.max(...confidence);
    byIdentity.set(key, merged);
  }
  return Array.from(byIdentity.values());
}

function mergeDetailCourseGroup(courses: DetailCourse[]): DetailCourse {
  return courses.reduce((merged, course) => {
    const next: DetailCourse = {
      ...merged,
      name: merged.name,
      number: merged.number ?? course.number,
      provider: merged.provider ?? course.provider,
      provenance: merged.provenance ?? course.provenance
    };
    const confidence = [merged.confidence, course.confidence].filter(
      (value): value is number => typeof value === "number"
    );
    if (confidence.length) next.confidence = Math.max(...confidence);
    return next;
  });
}

function detailCourseIdentityKey(course: DetailCourse): string {
  const parsed = courseNumberAndNameFromDetailText(course.name);
  const number = normalizeDetailKey(course.number ?? parsed.number ?? "");
  if (number) return `number:${number}`;
  return `name:${normalizeDetailKey(parsed.name)}`;
}

function detailCourseMergeKeys(course: DetailCourse): string[] {
  const parsed = courseNumberAndNameFromDetailText(course.name);
  return uniqueStrings([
    detailCourseIdentityKey(course),
    parsed.number ? `number:${normalizeDetailKey(parsed.number)}` : "",
    `name:${normalizeDetailKey(parsed.name)}`,
    `name:${normalizeDetailKey(course.name)}`
  ]).filter(isPresent);
}

function detailCertificationIdentityKey(item: DetailCertification): string {
  if (item.credentialUrl) return `url:${normalizeUrlKey(item.credentialUrl)}`;
  if (item.credentialId) return `credential:${normalizeDetailKey(item.credentialId)}`;
  return `name:${normalizeDetailKey(`${item.name} ${item.issuer ?? ""}`)}`;
}

function detailEducationIdentityKey(item: DetailEducation): string {
  return `education:${normalizeDetailKey(`${item.school} ${item.degree ?? ""} ${item.dates ?? ""}`)}`;
}

function detailHonorAwardIdentityKey(item: DetailHonorAward): string {
  return `honor:${normalizeDetailKey(`${item.title} ${item.issuer ?? ""} ${item.date ?? ""}`)}`;
}

function detailInterestIdentityKey(interest: DetailInterest): string {
  if (interest.url) return `url:${normalizeUrlKey(interest.url)}`;
  return `name:${normalizeDetailKey(interest.name)}`;
}

function detailOrganizationIdentityKey(item: DetailOrganization): string {
  if (item.url) return `url:${normalizeUrlKey(item.url)}`;
  return `organization:${normalizeDetailKey(`${item.name} ${item.role ?? ""}`)}`;
}

function detailPatentIdentityKey(item: DetailPatent): string {
  if (item.url) return `url:${normalizeUrlKey(item.url)}`;
  if (item.patentNumber) return `patent:${normalizeDetailKey(item.patentNumber)}`;
  if (item.applicationNumber) return `application:${normalizeDetailKey(item.applicationNumber)}`;
  return `title:${normalizeDetailKey(`${item.title} ${item.date ?? ""}`)}`;
}

function detailFeaturedIdentityKey(item: DetailFeatured): string {
  if (item.url) return `url:${normalizeUrlKey(item.url)}`;
  return `title:${normalizeDetailKey(item.title)}`;
}

function detailProjectIdentityKey(project: DetailProject): string {
  if (project.url) return `url:${normalizeUrlKey(project.url)}`;
  return `name:${normalizeDetailKey(`${project.name} ${project.dates ?? ""}`)}`;
}

function detailPublicationIdentityKey(item: DetailPublication): string {
  if (item.url) return `url:${normalizeUrlKey(item.url)}`;
  return `publication:${normalizeDetailKey(`${item.name} ${item.publisher ?? ""} ${item.date ?? ""}`)}`;
}

function detailRecommendationIdentityKey(item: DetailRecommendation): string {
  return `recommendation:${normalizeDetailKey(`${item.name} ${item.relationship ?? ""}`)}`;
}

function detailTestScoreIdentityKey(item: DetailTestScore): string {
  return `test-score:${normalizeDetailKey(`${item.name} ${item.score ?? ""} ${item.date ?? ""}`)}`;
}

function detailVolunteeringIdentityKey(item: DetailVolunteering): string {
  if (item.organizationUrl) return `url:${normalizeUrlKey(item.organizationUrl)}`;
  return `volunteering:${normalizeDetailKey(`${item.role ?? ""} ${item.organization} ${item.dates ?? ""}`)}`;
}

function detailWorkIdentityKey(item: DetailWork): string {
  return `work:${normalizeDetailKey(`${item.title} ${item.company ?? ""} ${item.dates ?? ""}`)}`;
}

function mergeDetailRecords<T extends object>(
  items: T[],
  keyFor: (item: T) => string | undefined
): T[] {
  const byIdentity = new Map<string, T>();
  for (const item of items) {
    const key = keyFor(item);
    if (!key) continue;
    const existing = byIdentity.get(key);
    byIdentity.set(key, existing ? mergeDetailRecord(existing, item) : item);
  }
  return Array.from(byIdentity.values());
}

function mergeDetailRecord<T extends object>(existing: T, next: T): T {
  const merged = { ...existing } as T;
  for (const [key, value] of Object.entries(next)) {
    const existingValue = (merged as Record<string, unknown>)[key];
    if (
      existingValue === undefined ||
      existingValue === null ||
      isEmptyDetailArray(existingValue)
    ) {
      (merged as Record<string, unknown>)[key] = value;
    }
  }
  const existingRecord = existing as Record<string, unknown>;
  const nextRecord = next as Record<string, unknown>;
  const confidence = [existingRecord.confidence, nextRecord.confidence].filter(
    (value): value is number => typeof value === "number"
  );
  if (confidence.length) {
    (merged as Record<string, unknown>).confidence = Math.max(...confidence);
  }
  return merged;
}

function isEmptyDetailArray(value: unknown): boolean {
  return Array.isArray(value) && value.length === 0;
}

function normalizeDetailKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeUrlKey(value: string): string {
  const url = safeUrl(value);
  if (!url) return normalizeDetailKey(value);
  url.hash = "";
  url.search = "";
  return url.toString().replace(/\/+$/, "").toLowerCase();
}

async function paginationSupplementalPayloads(
  descriptor: SectionRecoveryDescriptor,
  initialPayloads: unknown[],
  profileId: string,
  deadline: number,
  sourcePath?: string,
  seenPaths = new Set<string>()
): Promise<SupplementalPayloadResult> {
  if (!descriptor.supportsPagination || !initialPayloads.length) {
    return { diagnostics: [], payloads: [] };
  }
  const payloads: unknown[] = [];
  const diagnostics: Diagnostic[] = [];
  const seen = new Set<string>();
  const isTargetReached = (): boolean => {
    const recoveredPayloads = [...initialPayloads, ...payloads];
    const targetCount = sectionRecoveryTargetCount(descriptor, recoveredPayloads);
    return targetCount > 0 && sectionRecoveredCount(recoveredPayloads, descriptor) >= targetCount;
  };
  if (isTargetReached()) {
    return { diagnostics: [], payloads: [] };
  }
  let queue = uniqueStrings(
    initialPayloads.flatMap((payload) =>
      paginationPathsFromPayload(payload, descriptor, profileId, sourcePath)
    )
  );
  let pages = 0;
  while (queue.length && pages < 8) {
    const path = queue.shift();
    if (!path) break;
    const marker = paginationPathMarker(path);
    if (seen.has(marker) || seenPaths.has(marker)) continue;
    seen.add(marker);
    seenPaths.add(marker);
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      diagnostics.push(coverageBudgetDiagnostic(descriptor));
      break;
    }
    try {
      const payload = await voyagerFetch(path, remainingMs);
      pages += 1;
      payloads.push(payload);
      if (isTargetReached()) break;
      queue = uniqueStrings([
        ...queue,
        ...paginationPathsFromPayload(payload, descriptor, profileId, path)
      ]);
    } catch (error) {
      diagnostics.push(coverageUnavailableDiagnostic(descriptor, voyagerFailure(error)));
    }
  }
  if (pages) {
    diagnostics.push({
      code: "coverage.pagination.exhausted",
      level: "info",
      message: `${descriptor.label} pagination fetched ${pages} additional page${pages === 1 ? "" : "s"} before reaching a stop condition.`,
      source: "linkedin-voyager"
    });
  }
  return { diagnostics, payloads };
}

function paginationPathMarker(path: string): string {
  const url = safeUrl(path);
  if (!url) return safeDecode(path).toLowerCase();
  url.hash = "";
  return safeDecode(url.toString()).toLowerCase();
}

function paginationPathsFromPayload(
  payload: unknown,
  descriptor: SectionRecoveryDescriptor,
  profileId: string,
  sourcePath?: string
): string[] {
  const paths: string[] = [];
  collectPaginationPaths(payload, descriptor, profileId, paths, 0);
  const nextByStart = nextPaginationPathFromPayload(payload, descriptor, profileId, sourcePath);
  if (nextByStart) paths.push(nextByStart);
  const nextByRecoveredCount = nextPaginationPathFromRecoveredCount(
    payload,
    descriptor,
    profileId,
    sourcePath
  );
  if (nextByRecoveredCount) paths.push(nextByRecoveredCount);
  return paths;
}

function collectPaginationPaths(
  value: unknown,
  descriptor: SectionRecoveryDescriptor,
  profileId: string,
  paths: string[],
  depth: number
): void {
  if (depth > 8) return;
  if (Array.isArray(value)) {
    for (const item of value) collectPaginationPaths(item, descriptor, profileId, paths, depth + 1);
    return;
  }
  const record = objectRecord(value);
  if (!record) return;
  const paging = objectRecord(record.paging);
  const links = Array.isArray(paging?.links) ? paging.links : [];
  for (const link of links) {
    const linkRecord = objectRecord(link);
    const rel = stringValue(linkRecord?.rel) ?? stringValue(linkRecord?.type);
    if (rel && !/next/i.test(rel)) continue;
    const href = stringValue(linkRecord?.href) ?? stringValue(linkRecord?.url);
    const path = voyagerPathFromPaginationHref(href, descriptor, profileId);
    if (path) paths.push(path);
  }
  for (const nested of Object.values(record)) {
    collectPaginationPaths(nested, descriptor, profileId, paths, depth + 1);
  }
}

type SectionPaginationCursor = {
  count: number;
  start: number;
  total: number;
};

function nextPaginationPathFromPayload(
  payload: unknown,
  descriptor: SectionRecoveryDescriptor,
  profileId: string,
  sourcePath: string | undefined
): string | undefined {
  if (!sourcePath) return undefined;
  const nextStartFromCursor = [
    ...sectionPaginationCursorsFromPayload(payload, descriptor),
    ...genericPaginationCursorsFromPayload(payload)
  ]
    .map((cursor) => cursor.start + cursor.count)
    .filter((start) => Number.isFinite(start))
    .sort((left, right) => left - right)
    .find((start, index, starts) => start > 0 && starts.indexOf(start) === index);
  const nextStart =
    nextStartFromCursor ?? nextPaginationStartFromSummary(payload, descriptor, sourcePath);
  if (typeof nextStart !== "number") return undefined;
  return paginationPathWithStart(sourcePath, nextStart, profileId);
}

function nextPaginationStartFromSummary(
  payload: unknown,
  descriptor: SectionRecoveryDescriptor,
  sourcePath: string
): number | undefined {
  const summary = sectionPageSummary(payload, descriptor);
  if (summary.pageSize <= 0 || summary.totalCount <= summary.pageSize) return undefined;
  const currentStart = paginationStartFromPath(sourcePath) ?? 0;
  const nextStart = currentStart + summary.pageSize;
  return summary.totalCount > nextStart ? nextStart : undefined;
}

function nextPaginationPathFromRecoveredCount(
  payload: unknown,
  descriptor: SectionRecoveryDescriptor,
  profileId: string,
  sourcePath: string | undefined
): string | undefined {
  if (!sourcePath) return undefined;
  const recoveredCount = sectionRecoveredCount([payload], descriptor);
  if (recoveredCount <= 0) return undefined;
  const currentStart = paginationStartFromPath(sourcePath) ?? 0;
  const nextStart = currentStart + recoveredCount;
  if (sectionRecoveryTargetCount(descriptor, [payload]) <= nextStart) return undefined;
  return paginationPathWithStart(sourcePath, nextStart, profileId);
}

function paginationStartFromPath(sourcePath: string): number | undefined {
  const path = sourcePath.startsWith("http")
    ? sourcePath
    : `https://www.linkedin.com/voyager/api${sourcePath.startsWith("/") ? sourcePath : `/${sourcePath}`}`;
  const url = safeUrl(path);
  if (!url) return undefined;
  return (
    graphqlVariablesStart(url.searchParams.get("variables")) ??
    numericValueFromString(url.searchParams.get("start"))
  );
}

function sectionPaginationCursorsFromPayload(
  value: unknown,
  descriptor: SectionRecoveryDescriptor
): SectionPaginationCursor[] {
  const cursors: SectionPaginationCursor[] = [];
  collectSectionPaginationCursors(value, descriptor, cursors, 0);
  return cursors;
}

function genericPaginationCursorsFromPayload(value: unknown): SectionPaginationCursor[] {
  const cursors: SectionPaginationCursor[] = [];
  collectGenericPaginationCursors(value, cursors, 0);
  return cursors;
}

function collectGenericPaginationCursors(
  value: unknown,
  cursors: SectionPaginationCursor[],
  depth: number
): void {
  if (depth > 8) return;
  if (Array.isArray(value)) {
    for (const item of value) collectGenericPaginationCursors(item, cursors, depth + 1);
    return;
  }
  const record = objectRecord(value);
  if (!record) return;
  const paging = objectRecord(record.paging);
  if (paging) {
    const start = numericValue(paging.start ?? record.start) ?? 0;
    const count = numericValue(paging.count ?? record.count);
    const total = numericValue(
      paging.total ??
        paging.totalCount ??
        paging.totalResults ??
        record.total ??
        record.totalCount ??
        record.totalResults
    );
    if (typeof count === "number" && typeof total === "number" && total > start + count) {
      cursors.push({ count, start, total });
    }
  }
  for (const nested of Object.values(record)) {
    collectGenericPaginationCursors(nested, cursors, depth + 1);
  }
}

function collectSectionPaginationCursors(
  value: unknown,
  descriptor: SectionRecoveryDescriptor,
  cursors: SectionPaginationCursor[],
  depth: number
): void {
  if (depth > 8) return;
  if (Array.isArray(value)) {
    for (const item of value) collectSectionPaginationCursors(item, descriptor, cursors, depth + 1);
    return;
  }
  const record = objectRecord(value);
  if (!record) return;
  if (
    isSectionCollectionRecord(record, descriptor) ||
    recordHasSectionEntityReferences(record, descriptor)
  ) {
    const elementCount = sectionRecordItemCount(record, descriptor);
    const paging = objectRecord(record.paging);
    const start = numericValue(paging?.start ?? record.start) ?? 0;
    const count = elementCount || numericValue(paging?.count ?? record.count) || 0;
    const total =
      numericValue(
        paging?.total ??
          paging?.totalCount ??
          paging?.totalResults ??
          record.total ??
          record.totalCount ??
          record.totalResults
      ) ?? count;
    if (count > 0 && total > start + count) {
      cursors.push({ count, start, total });
    }
  }
  for (const nested of Object.values(record)) {
    collectSectionPaginationCursors(nested, descriptor, cursors, depth + 1);
  }
}

function paginationPathWithStart(
  sourcePath: string,
  nextStart: number,
  profileId: string
): string | undefined {
  const path = sourcePath.startsWith("http")
    ? sourcePath
    : `https://www.linkedin.com/voyager/api${sourcePath.startsWith("/") ? sourcePath : `/${sourcePath}`}`;
  const url = safeUrl(path);
  if (!url || url.origin !== "https://www.linkedin.com") return undefined;
  if (!url.pathname.startsWith("/voyager/api/")) return undefined;
  const decoded = safeDecode(url.toString());
  const profileMarker = safeDecode(profileId);
  if (
    decoded.includes("/identity/profiles/") &&
    !decoded.includes(`/identity/profiles/${profileMarker}`)
  ) {
    return undefined;
  }
  if (decoded.includes("/in/") && !decoded.includes(`/in/${profileMarker}`)) {
    return undefined;
  }
  if (url.pathname === "/voyager/api/graphql") {
    const nextVariables = graphqlVariablesWithStart(url.searchParams.get("variables"), nextStart);
    if (!nextVariables) return undefined;
    url.searchParams.set("variables", nextVariables);
    return url.toString();
  }
  url.searchParams.set("start", String(nextStart));
  return url.toString();
}

function graphqlVariablesStart(value: string | null): number | undefined {
  if (!value) return undefined;
  const match = /(?:^|[,(])start:(\d+)(?=[),]|$)/.exec(safeDecode(value));
  return numericValueFromString(match?.[1]);
}

function graphqlVariablesWithStart(value: string | null, nextStart: number): string | undefined {
  if (!value) return undefined;
  const decoded = safeDecode(value);
  let replaced = false;
  const nextVariables = decoded.replace(/(^|[,(])start:\d+(?=[),]|$)/, (match, prefix: string) => {
    replaced = true;
    return `${prefix}start:${nextStart}`;
  });
  return replaced ? nextVariables : undefined;
}

function voyagerPathFromPaginationHref(
  href: string | undefined,
  descriptor: SectionRecoveryDescriptor,
  profileId: string
): string | undefined {
  if (!href) return undefined;
  const url = href.startsWith("http") ? safeUrl(href) : safeUrl(`https://www.linkedin.com${href}`);
  if (!url || url.origin !== "https://www.linkedin.com") return undefined;
  if (!url.pathname.startsWith("/voyager/api/")) return undefined;
  const decoded = safeDecode(url.toString());
  if (decoded.includes("/in/") && !decoded.includes(`/in/${safeDecode(profileId)}`)) {
    return undefined;
  }
  return url.toString();
}

function coverageUnavailableDiagnostic(
  descriptor: SectionRecoveryDescriptor,
  failure?: Pick<VoyagerAttempt, "status" | "reason">
): Diagnostic {
  return {
    code: `coverage.${descriptor.section}.unavailable`,
    level: failure?.status === 404 || failure?.status === 410 ? "info" : "warning",
    message: `${descriptor.label} recovery was unavailable${failure?.status ? ` (${failure.status})` : ""}${failure?.reason ? `: ${failure.reason}` : ""}.`,
    source: "linkedin-voyager"
  };
}

function coverageBudgetDiagnostic(descriptor: SectionRecoveryDescriptor): Diagnostic {
  return {
    code: "coverage.budget.exhausted",
    level: "warning",
    message: `${descriptor.label} recovery stopped because the extraction budget was exhausted.`,
    source: "linkedin-voyager"
  };
}

function advertisedSectionCountFromDocument(
  descriptor: SectionRecoveryDescriptor
): number | undefined {
  const text = profileVisibleTextForCounts();
  for (const term of descriptor.advertisedTerms) {
    for (const pattern of [
      new RegExp(`\\b${escapeRegExp(term)}\\s*\\(([\\d,]+)\\)`, "i"),
      new RegExp(`show all\\s+([\\d,]+)\\s+${escapeRegExp(term)}\\b`, "i"),
      new RegExp(`\\b([\\d,]+)\\s+${escapeRegExp(term)}\\b`, "i")
    ]) {
      const match = pattern.exec(text);
      if (!match?.[1]) continue;
      const count = Number(match[1].replace(/,/g, ""));
      if (Number.isFinite(count)) return count;
    }
  }
  return undefined;
}

function recoveryAdvertisedSectionCountFromDocument(
  descriptor: SectionRecoveryDescriptor
): number | undefined {
  const count = advertisedSectionCountFromDocument(descriptor);
  if (typeof count !== "number") return undefined;
  return count;
}

function hasDetailLinkForSection(descriptor: SectionRecoveryDescriptor): boolean {
  if (!descriptor.detailPath) return false;
  const profileId = profileIdFromLocation();
  if (!profileId) return false;
  const expectedDetailPath = descriptor.detailPath.replace(/\/+$/, "").toLowerCase();
  return Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]")).some((anchor) => {
    const url = safeUrl(anchor.href || anchor.getAttribute("href") || "");
    if (!url || url.origin !== "https://www.linkedin.com") return false;
    const match = /^\/in\/([^/]+)\/(.+)$/i.exec(safeDecode(url.pathname));
    const linkedProfileId = match?.[1];
    const linkedPath = match?.[2]?.replace(/\/+$/, "").toLowerCase();
    return Boolean(
      linkedProfileId &&
      linkedPath === expectedDetailPath &&
      profileIdsMatch(linkedProfileId, profileId)
    );
  });
}

function profileVisibleTextForCounts(): string {
  const body = document.body;
  if (!body) return "";
  const clone = body.cloneNode(true) as HTMLElement;
  clone
    .querySelectorAll('code[id^="bpr-guid-"], script, style, template')
    .forEach((element) => element.remove());
  const textParts: string[] = [];
  const walker = document.createTreeWalker(clone, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const text = cleanDetailText(node.textContent ?? "");
    if (text) textParts.push(text);
    node = walker.nextNode();
  }
  return textParts.join(" ");
}

function isIdentityDashProfilesGraphqlUrl(url: URL, profileId: string): boolean {
  if (url.pathname !== "/voyager/api/graphql") return false;
  if (!url.searchParams.get("queryId")?.startsWith(IDENTITY_DASH_PROFILES_QUERY_PREFIX)) {
    return false;
  }
  return graphqlVariablesMatchProfile(url.searchParams.get("variables"), profileId);
}

function isDashProfileUrnUrl(url: URL, profileId: string): boolean {
  const match = /^\/voyager\/api\/identity\/dash\/profiles\/([^/?#]+)/i.exec(
    safeDecode(url.pathname)
  );
  return Boolean(
    match?.[1] &&
    match[1].startsWith("urn:li:fsd_profile:") &&
    profileIdMatchesMemberIdentity(match[1], profileId) &&
    url.searchParams.get("decorationId")
  );
}

function isDashProfileQueryUrl(url: URL, profileId: string): boolean {
  return (
    url.pathname === "/voyager/api/identity/dash/profiles" &&
    url.searchParams.get("q") === "memberIdentity" &&
    profileIdMatchesMemberIdentity(url.searchParams.get("memberIdentity"), profileId) &&
    Boolean(url.searchParams.get("decorationId"))
  );
}

function graphqlVariablesMatchProfile(value: string | null, profileId: string): boolean {
  if (!value) return false;
  const variables = safeDecode(value);
  const profileMarker = escapeRegExp(safeDecode(profileId));
  const memberIdentityPattern = new RegExp(`(?:^|[,(])memberIdentity:${profileMarker}(?:[),]|$)`);
  if (memberIdentityPattern.test(variables)) return true;

  return [...variables.matchAll(/profileUrn:([^,)]+)/g)].some((match) =>
    profileIdMatchesMemberIdentity(match[1], profileId)
  );
}

function profileIdMatchesMemberIdentity(
  value: string | null | undefined,
  profileId: string
): boolean {
  if (!value) return false;
  if (profileIdsMatch(value, profileId)) return true;
  const urnId = profileIdFromUrn(value);
  return Boolean(urnId && profileIdsMatch(urnId, profileId));
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
    supplementalDomSections?: DetailSectionItems | undefined;
    supplementalDiagnostics?: Diagnostic[];
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
  const profileWithDomSections = mergeDetailSectionsIntoProfile(
    profile,
    options.supplementalDomSections
  );
  const profileWithSupplementDiagnostics = options.supplementalDiagnostics?.length
    ? {
        ...profileWithDomSections,
        diagnostics: [...profileWithDomSections.diagnostics, ...options.supplementalDiagnostics]
      }
    : profileWithDomSections;
  if (!hasStructuredProfileSections(profileWithDomSections)) {
    return {
      profile: null,
      reason: "parsed but did not include structured profile sections"
    };
  }
  return {
    profile: applyCoverageDiagnostics(enrichProfileFromDocument(profileWithSupplementDiagnostics))
  };
}

function preliminaryVoyagerCandidateProfile(
  payload: unknown,
  options: {
    profileId: string;
    source: string;
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
    url: string;
    verboseDiagnostics?: boolean;
  } = {
    source: options.source,
    url: document.location.href
  };
  if (options.verboseDiagnostics) {
    extractionOptions.verboseDiagnostics = true;
  }

  const profile = extractProfileFromVoyagerPayload(
    payloadWithPreferredProfileEntity(payload, options.profileId),
    extractionOptions
  );
  if (!hasStructuredProfileSections(profile)) {
    return { profile: null, reason: "parsed but did not include structured profile sections" };
  }
  return { profile };
}

function applyCoverageDiagnostics(profile: Profile): Profile {
  const diagnostics = reconciledCoverageDiagnostics(profile);
  for (const descriptor of SECTION_RECOVERY_DESCRIPTORS) {
    const count = profileSectionCount(profile, descriptor.section);
    const advertisedCount = advertisedSectionCountFromDocument(descriptor);
    if (advertisedCount && count === 0) {
      pushDiagnosticOnce(diagnostics, {
        code: `coverage.${descriptor.section}.unavailable`,
        level: "warning",
        message: `${descriptor.label} was advertised, but no accessible items were recovered.`,
        source: "linkedin-voyager"
      });
      continue;
    }
    if (advertisedCount && count >= advertisedCount) {
      pushDiagnosticOnce(diagnostics, {
        code: `coverage.${descriptor.section}.complete`,
        level: "info",
        message: `${descriptor.label} extraction reached the advertised count of ${advertisedCount}.`,
        source: "linkedin-voyager"
      });
      continue;
    }
    if (advertisedCount && count < advertisedCount) {
      pushDiagnosticOnce(diagnostics, {
        code: `coverage.${descriptor.section}.partial`,
        level: "warning",
        message: `${descriptor.label} extraction found ${count} item${count === 1 ? "" : "s"} but the page advertised ${advertisedCount}.`,
        source: "linkedin-voyager"
      });
      continue;
    }
    if (
      descriptor.knownCap &&
      count === descriptor.knownCap &&
      !sectionResolvedByProfile({ ...profile, diagnostics }, descriptor)
    ) {
      pushDiagnosticOnce(diagnostics, {
        code: `coverage.${descriptor.section}.capped`,
        level: "warning",
        message: `${descriptor.label} extraction returned exactly the known page cap of ${descriptor.knownCap}; the section may still be partial.`,
        source: "linkedin-voyager"
      });
    }
  }
  if (
    profile.diagnostics.some(
      (diagnostic) => diagnostic.code === "linkedin-voyager.courses.deduplicated"
    )
  ) {
    pushDiagnosticOnce(diagnostics, {
      code: "coverage.courses.deduplicated",
      level: "info",
      message: "Course recovery merged duplicate normalized records.",
      source: "linkedin-voyager"
    });
  }
  return { ...profile, diagnostics: reconciledCoverageDiagnostics({ ...profile, diagnostics }) };
}

function reconciledCoverageDiagnostics(profile: Profile): Diagnostic[] {
  return profile.diagnostics.filter((diagnostic) => {
    const recoveredMatch = /^coverage\.([^.]+)\.recovered$/.exec(diagnostic.code);
    if (recoveredMatch?.[1]) {
      const descriptor = descriptorBySection(recoveredMatch[1] as RecoverableSection);
      return recoveredDiagnosticStillApplies(profile, descriptor);
    }
    const match = /^coverage\.([^.]+)\.(partial|capped|unavailable)$/.exec(diagnostic.code);
    if (match) {
      const descriptor = descriptorBySection(match[1] as RecoverableSection);
      const state = match[2];
      if (state === "unavailable") return profileSectionCount(profile, descriptor.section) === 0;
      return !sectionResolvedByProfile(profile, descriptor);
    }
    if (
      diagnostic.code === "linkedin-voyager.skills.partial" ||
      diagnostic.code === "linkedin-voyager.skills.possibly-capped"
    ) {
      const descriptor = descriptorBySection("skills");
      const skillCount = profileSectionCount(profile, "skills");
      const advertisedCount = advertisedSectionCountFromDocument(descriptor);
      if (advertisedCount && skillCount >= advertisedCount) return false;
      if (sectionResolvedByProfile(profile, descriptor)) return false;
      return skillCount <= (descriptor.knownCap ?? Number.POSITIVE_INFINITY);
    }
    return true;
  });
}

function sectionResolvedByProfile(
  profile: Profile,
  descriptor: SectionRecoveryDescriptor
): boolean {
  const count = profileSectionCount(profile, descriptor.section);
  const advertisedCount = advertisedSectionCountFromDocument(descriptor);
  return Boolean(
    (advertisedCount && count >= advertisedCount) ||
    sectionHasCompleteCoverage(profile.diagnostics, descriptor.section) ||
    (sectionHasRecoveredCoverage(profile.diagnostics, descriptor.section) &&
      (!descriptor.knownCap || count > descriptor.knownCap))
  );
}

function recoveredDiagnosticStillApplies(
  profile: Profile,
  descriptor: SectionRecoveryDescriptor
): boolean {
  const count = profileSectionCount(profile, descriptor.section);
  const advertisedCount = advertisedSectionCountFromDocument(descriptor);
  if (advertisedCount) return count >= advertisedCount;
  if (descriptor.knownCap && count === descriptor.knownCap) return false;
  return count > 0;
}

function sectionHasCompleteCoverage(
  diagnostics: Diagnostic[],
  section: RecoverableSection
): boolean {
  return diagnostics.some((diagnostic) => diagnostic.code === `coverage.${section}.complete`);
}

function sectionHasRecoveredCoverage(
  diagnostics: Diagnostic[],
  section: RecoverableSection
): boolean {
  return diagnostics.some(
    (diagnostic) =>
      diagnostic.code === `coverage.${section}.recovered` ||
      diagnostic.code === `linkedin-voyager.${section}.recovered`
  );
}

function pushDiagnosticOnce(diagnostics: Diagnostic[], diagnostic: Diagnostic): void {
  if (diagnostics.some((existing) => existing.code === diagnostic.code)) return;
  diagnostics.push(diagnostic);
}

function profileSectionCount(profile: Profile, section: RecoverableSection): number {
  switch (section) {
    case "connections":
      return profile.identity.connections ? 1 : 0;
    case "followers":
      return profile.identity.followers ? 1 : 0;
    case "imagery":
      return (
        Number(Boolean(profile.identity.imagery?.profileImageUrl)) +
        Number(Boolean(profile.identity.imagery?.backgroundImageUrl))
      );
    case "links":
      return profile.identity.links.length;
    case "licensesCertifications":
      return profile.licensesCertifications.length;
    case "honorsAwards":
      return profile.honorsAwards.length;
    case "testScores":
      return profile.testScores.length;
    default:
      return Array.isArray(profile[section]) ? profile[section].length : 0;
  }
}

function enrichProfileFromDocument(profile: Profile): Profile {
  const socialCounts = socialCountsFromDocument();
  const identity = { ...profile.identity };
  if (!identity.connections && socialCounts.connections) {
    identity.connections = socialCounts.connections;
  }
  if (!identity.followers && socialCounts.followers) {
    identity.followers = socialCounts.followers;
  }
  if (
    identity.connections === profile.identity.connections &&
    identity.followers === profile.identity.followers
  ) {
    return profile;
  }
  return {
    ...profile,
    identity
  };
}

function socialCountsFromDocument(): { connections?: string; followers?: string } {
  const pageText = document.body?.innerText ?? "";
  const counts: { connections?: string; followers?: string } = {};
  const connections = socialCountFromText(pageText, "connections");
  const followers = socialCountFromText(pageText, "followers");
  if (connections) counts.connections = connections;
  if (followers) counts.followers = followers;
  return counts;
}

function socialCountFromText(text: string, label: "connections" | "followers"): string | undefined {
  const match = new RegExp(`(?:^|[\\s•|])([\\d,.]+\\s*(?:[kKmM])?\\+?)\\s+${label}\\b`, "i").exec(
    text
  );
  return match?.[1]?.replace(/\s+/g, "");
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
    `/identity/profiles/${encodedProfileId}/courses`,
    `/identity/profiles/${encodedProfileId}/skillCategory`,
    `/identity/profiles/${encodedProfileId}/recommendations?q=received&recommendationStatuses=List(VISIBLE)`
  ];
}

function courseSupplementalPath(profileId: string): string {
  return `/identity/profiles/${encodeURIComponent(profileId)}/courses`;
}

function skillSupplementalPath(profileId: string): string {
  return `/identity/profiles/${encodeURIComponent(profileId)}/skillCategory`;
}

function recommendationsSupplementalPath(profileId: string): string {
  return `/identity/profiles/${encodeURIComponent(profileId)}/recommendations?q=received&recommendationStatuses=List(VISIBLE)`;
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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function objectRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numericValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function numericValueFromString(value: string | undefined | null): number | undefined {
  if (!value) return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function isPresent<T>(value: T | undefined | null | ""): value is T {
  return Boolean(value);
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
