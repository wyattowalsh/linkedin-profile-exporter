import {
  SCHEMA_VERSION,
  type Diagnostic,
  type Profile,
  type Provenance,
  profileSchema
} from "./schema";
import { applyProfileSettings, normalizeSettings, type Settings } from "./settings";
import { z } from "zod";

export type ReadinessState = "ready" | "unavailable" | "needs-action";

export interface ReadinessResult {
  state: ReadinessState;
  reason: string;
  profileUrl?: string;
}

export interface ExtractionOptions {
  url?: string;
  settings?: Partial<Settings>;
  now?: string;
}

const LINKEDIN_PROFILE_URL_PATTERN = /^https:\/\/([a-z]{2,3}\.)?www\.linkedin\.com\/in\/[^/]+\/?/i;
const PROFILE_ROOT_SELECTOR = [
  "[data-lpe-profile]",
  "main",
  '[role="main"]',
  ".scaffold-layout__main",
  ".scaffold-layout"
].join(", ");
const PROFILE_NAME_SELECTOR = [
  '[data-lpe-section="identity"] [data-field="name"]',
  '[data-lpe-section="identity"] h1',
  ".pv-text-details__left-panel h1",
  ".pv-top-card h1",
  ".pv-top-card .text-heading-xlarge",
  '[class*="pv-top-card"] h1',
  '[class*="pv-top-card"] .text-heading-xlarge',
  'main h1.text-heading-xlarge',
  '[role="main"] h1.text-heading-xlarge',
  'main [data-anonymize="person-name"]',
  '[role="main"] [data-anonymize="person-name"]',
  'main .text-heading-xlarge',
  '[role="main"] .text-heading-xlarge'
].join(", ");
const PROFILE_HEADLINE_SELECTOR = [
  '[data-lpe-section="identity"] [data-field="headline"]',
  ".pv-top-card .text-body-medium.break-words",
  '[class*="pv-top-card"] [class*="text-body-medium"][class*="break-words"]',
  'main .text-body-medium.break-words',
  '[role="main"] .text-body-medium.break-words'
].join(", ");
const PROFILE_LOCATION_SELECTOR = [
  '[data-lpe-section="identity"] [data-field="location"]',
  '.pv-top-card [class*="text-body-small"][class*="t-black--light"][class*="break-words"]',
  '[class*="pv-top-card"] [class*="text-body-small"][class*="t-black--light"][class*="break-words"]',
  'main [class*="text-body-small"][class*="t-black--light"][class*="break-words"]',
  '[role="main"] [class*="text-body-small"][class*="t-black--light"][class*="break-words"]'
].join(", ");

function capturedAt(options?: ExtractionOptions): string {
  return options?.now ?? new Date().toISOString();
}

function text(root: ParentNode, selector: string): string | undefined {
  const value = root.querySelector(selector)?.textContent?.replace(/\s+/g, " ").trim();
  return value || undefined;
}

function href(root: ParentNode, selector: string): string | undefined {
  const value = root.querySelector<HTMLAnchorElement>(selector)?.href;
  return value || undefined;
}

function source(source: string, selector: string, options?: ExtractionOptions): Provenance {
  return {
    sourceType: "dom",
    source,
    selector,
    capturedAt: capturedAt(options)
  };
}

function itemSource(section: string, options?: ExtractionOptions): Pick<Profile["work"][number], "provenance" | "confidence"> {
  return {
    provenance: source(section, `[data-lpe-section="${section}"]`, options),
    confidence: 0.9
  };
}

function profileUrlFromDocument(document: Document, options?: ExtractionOptions): string | undefined {
  const explicit = document.querySelector<HTMLElement>("[data-lpe-profile]")?.dataset.profileUrl;
  const ogUrl = document.querySelector<HTMLMetaElement>('meta[property="og:url"]')?.content;
  return options?.url ?? explicit ?? ogUrl ?? document.location?.href;
}

export function detectLinkedInProfileReadiness(
  target: string | Document | { url?: string; document?: Document }
): ReadinessResult {
  const document = typeof target === "object" && "querySelector" in target ? target : typeof target === "object" ? target.document : undefined;
  const url = typeof target === "string" ? target : typeof target === "object" && !("querySelector" in target) ? target.url : document?.location?.href;
  const candidate = url ?? (document ? profileUrlFromDocument(document) : undefined);

  if (!candidate || !LINKEDIN_PROFILE_URL_PATTERN.test(candidate)) {
    return { state: "unavailable", reason: "Current page is not a LinkedIn profile URL." };
  }

  if (document && !hasProfileContent(document)) {
    return {
      state: "needs-action",
      reason: "LinkedIn profile URL is present, but profile content is not loaded yet. Wait for the profile to finish loading, sign in if LinkedIn shows a gate, then retry.",
      profileUrl: candidate
    };
  }

  return { state: "ready", reason: "LinkedIn profile content is available.", profileUrl: candidate };
}

export function hasProfileContent(document: Document): boolean {
  if (document.querySelector("[data-lpe-profile]")) return true;
  if (!document.querySelector(PROFILE_ROOT_SELECTOR)) return false;

  const name = text(document, PROFILE_NAME_SELECTOR);
  return Boolean(name && !isLinkedInGateText(name));
}

function isLinkedInGateText(value: string): boolean {
  const normalized = value.toLowerCase();
  return /^(sign in|log in|join linkedin|linkedin)$/.test(normalized) || normalized.includes("sign in to view");
}

export function extractProfileFromHtml(html: string, options: ExtractionOptions = {}): Profile {
  if (typeof DOMParser === "undefined") {
    throw new Error("DOMParser is required to extract from HTML strings.");
  }
  const document = new DOMParser().parseFromString(html, "text/html");
  return extractProfileFromDocument(document, options);
}

export function extractProfileFromDocument(document: Document, options: ExtractionOptions = {}): Profile {
  const readinessTarget: { document: Document; url?: string } = options.url ? { document, url: options.url } : { document };
  const readiness = detectLinkedInProfileReadiness(readinessTarget);
  if (readiness.state !== "ready") {
    throw new Error(readiness.reason);
  }

  const mergedSettings = normalizeSettings(options.settings);
  const now = capturedAt(options);
  const diagnostics: Diagnostic[] = [
    { code: "readiness.ready", level: "info", message: readiness.reason, source: "document" }
  ];

  if (document.querySelector("[data-lpe-show-more]")) {
    diagnostics.push({
      code: "automation.show-more-detected",
      level: "info",
      message: mergedSettings.expandShowMore
        ? "Show-more controls were detected and marked for expansion."
        : "Show-more controls were detected but expansion is disabled.",
      source: "automation"
    });
  }

  for (const hidden of Array.from(document.querySelectorAll<HTMLElement>("[data-lpe-hidden='true']"))) {
    diagnostics.push({
      code: "automation.hidden-section",
      level: "info",
      message: `Hidden section ${hidden.dataset.lpeSection ?? "unknown"} was included from accessible fixture content.`,
      source: "automation"
    });
  }

  const parsedState = parseClientState(document);
  const state = parsedState.state;
  if (parsedState.diagnostic) diagnostics.push(parsedState.diagnostic);
  if (state) {
    diagnostics.push({
      code: "client-state.parsed",
      level: "info",
      message: "Embedded client state was parsed and merged where useful.",
      source: "client-state"
    });
  }

  const profileUrl = profileUrlFromDocument(document, options) ?? readiness.profileUrl!;
  const locale = state?.metadata?.locale ?? document.documentElement.lang;
  const profileImageUrl = document.querySelector<HTMLMetaElement>('meta[property="og:image"]')?.content;
  const about = text(document, '[data-lpe-section="identity"] [data-field="about"]');

  const profile: Profile = profileSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    identity: {
      name: text(document, PROFILE_NAME_SELECTOR) ?? "Unknown LinkedIn Profile",
      headline:
        text(document, PROFILE_HEADLINE_SELECTOR) ??
        state?.identity?.headline ??
        document.querySelector<HTMLMetaElement>('meta[name="description"]')?.content,
      location: text(document, PROFILE_LOCATION_SELECTOR),
      profileUrl,
      about,
      links: Array.from(document.querySelectorAll<HTMLAnchorElement>('[data-lpe-section="identity"] a[href]')).map(
        (anchor) => ({
          label: anchor.textContent?.trim() || anchor.href,
          url: anchor.href,
          provenance: source("identity", '[data-lpe-section="identity"] a[href]', options),
          confidence: 0.85
        })
      ),
      imagery: profileImageUrl
        ? {
            profileImageUrl,
            alt: "LinkedIn profile image metadata",
            provenance: {
              sourceType: "metadata",
              source: "og:image",
              selector: 'meta[property="og:image"]',
              capturedAt: now
            },
            confidence: 0.8
          }
        : undefined,
      provenance: source("identity", '[data-lpe-section="identity"]', options),
      confidence: 0.92
    },
    work: readStructuredItems(document, "work", (item) => ({
      title: text(item, '[data-field="title"]') ?? "Role",
      company: text(item, '[data-field="company"]'),
      location: text(item, '[data-field="location"]'),
      dates: text(item, '[data-field="dates"]'),
      description: text(item, '[data-field="description"]'),
      roles: Array.from(item.querySelectorAll<HTMLElement>("[data-lpe-role]")).map((role) => ({
        title: text(role, '[data-field="title"]') ?? "Role",
        dates: text(role, '[data-field="dates"]'),
        description: text(role, '[data-field="description"]'),
        ...itemSource("work.role", options)
      })),
      ...itemSource("work", options)
    })),
    education: readStructuredItems(document, "education", (item) => ({
      school: text(item, '[data-field="school"]') ?? "School",
      degree: text(item, '[data-field="degree"]'),
      field: text(item, '[data-field="field"]'),
      dates: text(item, '[data-field="dates"]'),
      description: text(item, '[data-field="description"]'),
      activities: text(item, '[data-field="activities"]'),
      ...itemSource("education", options)
    })),
    skills: [
      ...readTextItems(document, "skills").map((name) => ({ name, ...itemSource("skills", options) })),
      ...(state?.skills ?? []).map((skill) => ({
        name: skill.name,
        endorsements: skill.endorsements,
        provenance: {
          sourceType: "client-state" as const,
          source: "data-linkedin-profile-state.skills",
          capturedAt: now
        },
        confidence: 0.75
      }))
    ],
    licensesCertifications: readStructuredItems(document, "licenses-certifications", (item) => ({
      name: text(item, '[data-field="name"]') ?? "Certification",
      issuer: text(item, '[data-field="issuer"]'),
      date: text(item, '[data-field="date"]'),
      credentialUrl: href(item, '[data-field="credentialUrl"], a[href]'),
      ...itemSource("licenses-certifications", options)
    })),
    projects: readStructuredItems(document, "projects", (item) => ({
      name: text(item, '[data-field="name"]') ?? "Project",
      description: text(item, '[data-field="description"]'),
      url: href(item, '[data-field="url"], a[href]'),
      dates: text(item, '[data-field="dates"]'),
      ...itemSource("projects", options)
    })),
    publications: readStructuredItems(document, "publications", (item) => ({
      name: text(item, '[data-field="name"]') ?? "Publication",
      publisher: text(item, '[data-field="publisher"]'),
      date: text(item, '[data-field="date"]'),
      url: href(item, '[data-field="url"], a[href]'),
      ...itemSource("publications", options)
    })),
    volunteering: readStructuredItems(document, "volunteering", (item) => ({
      role: text(item, '[data-field="role"]'),
      organization: text(item, '[data-field="organization"]') ?? "Organization",
      description: text(item, '[data-field="description"]'),
      dates: text(item, '[data-field="dates"]'),
      ...itemSource("volunteering", options)
    })),
    honorsAwards: readStructuredItems(document, "honors-awards", (item) => ({
      title: text(item, '[data-field="title"]') ?? "Award",
      issuer: text(item, '[data-field="issuer"]'),
      date: text(item, '[data-field="date"]'),
      description: text(item, '[data-field="description"]'),
      ...itemSource("honors-awards", options)
    })),
    languages: readStructuredItems(document, "languages", (item) => ({
      language: text(item, '[data-field="language"]') ?? "Language",
      fluency: text(item, '[data-field="fluency"]'),
      ...itemSource("languages", options)
    })),
    courses: readStructuredItems(document, "courses", (item) => ({
      name: text(item, '[data-field="name"]') ?? "Course",
      provider: text(item, '[data-field="provider"]'),
      ...itemSource("courses", options)
    })),
    recommendations: readStructuredItems(document, "recommendations", (item) => ({
      name: text(item, '[data-field="name"]') ?? "Recommendation",
      relationship: text(item, '[data-field="relationship"]'),
      text: text(item, '[data-field="text"]') ?? item.textContent?.trim() ?? "",
      ...itemSource("recommendations", options)
    })),
    featured: readStructuredItems(document, "featured", (item) => ({
      title: text(item, '[data-field="title"]') ?? "Featured item",
      url: href(item, '[data-field="url"], a[href]'),
      description: text(item, '[data-field="description"]'),
      ...itemSource("featured", options)
    })),
    organizations: readStructuredItems(document, "organizations", (item) => ({
      name: text(item, '[data-field="name"]') ?? "Organization",
      role: text(item, '[data-field="role"]'),
      ...itemSource("organizations", options)
    })),
    interests: readTextItems(document, "interests").map((name) => ({ name, ...itemSource("interests", options) })),
    metadata: {
      capturedAt: now,
      sourceUrl: profileUrl,
      locale,
      generator: "linkedin-profile-exporter",
      referenceBuild: "joshuatz/linkedin-to-jsonresume build_3.2.3 audited, not ported"
    },
    diagnostics,
    exportMetadata: {
      formats: mergedSettings.outputFormats,
      filenameTemplate: mergedSettings.filenameTemplate
    }
  });

  return applyProfileSettings(profile, mergedSettings);
}

function readStructuredItems<T>(
  document: Document,
  section: string,
  mapper: (item: HTMLElement) => T
): T[] {
  return Array.from(document.querySelectorAll<HTMLElement>(`[data-lpe-section="${section}"] [data-lpe-item]`)).map(mapper);
}

function readTextItems(document: Document, section: string): string[] {
  return Array.from(document.querySelectorAll<HTMLElement>(`[data-lpe-section="${section}"] [data-lpe-item]`))
    .map((item) => item.textContent?.replace(/\s+/g, " ").trim())
    .filter((value): value is string => Boolean(value));
}

const clientStateSchema = z
  .object({
    metadata: z.object({ locale: z.string().optional() }).optional(),
    identity: z.object({ headline: z.string().optional() }).optional(),
    skills: z.array(z.object({ name: z.string().min(1), endorsements: z.number().int().nonnegative().optional() })).optional()
  })
  .passthrough();

type ClientState = z.infer<typeof clientStateSchema>;

function parseClientState(document: Document): { state?: ClientState; diagnostic?: Diagnostic } {
  const script = document.querySelector<HTMLScriptElement>('script[type="application/json"][data-linkedin-profile-state]');
  if (!script?.textContent) return {};
  try {
    const parsed = clientStateSchema.safeParse(JSON.parse(script.textContent));
    if (!parsed.success) {
      return {
        diagnostic: {
          code: "client-state.invalid-shape",
          level: "warning",
          message: "Embedded client state was present but did not match the supported shape.",
          source: "client-state"
        }
      };
    }
    return { state: parsed.data };
  } catch {
    return {
      diagnostic: {
        code: "client-state.invalid-json",
        level: "warning",
        message: "Embedded client state was present but could not be parsed as JSON.",
        source: "client-state"
      }
    };
  }
}
