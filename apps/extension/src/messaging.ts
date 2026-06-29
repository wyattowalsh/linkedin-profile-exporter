import type { ReadinessResult } from "@linkedin-profile-exporter/core/extraction";
import type { Diagnostic, Profile } from "@linkedin-profile-exporter/core/schema";
import type { Settings } from "@linkedin-profile-exporter/core/settings";

export type RecoverableSection =
  | "work"
  | "education"
  | "skills"
  | "licensesCertifications"
  | "projects"
  | "publications"
  | "volunteering"
  | "honorsAwards"
  | "testScores"
  | "patents"
  | "languages"
  | "courses"
  | "recommendations"
  | "featured"
  | "organizations"
  | "interests"
  | "links"
  | "imagery"
  | "connections"
  | "followers";

export type ExtractionPhase =
  | "checking-readiness"
  | "preparing-page"
  | "reading-embedded-data"
  | "reading-linkedin-data"
  | "recovering-sections"
  | "reading-details"
  | "paginating"
  | "deduplicating"
  | "using-page-fallback"
  | "complete"
  | "failed";

export interface ExtractionStatus {
  detail?: string;
  label: string;
  phase: ExtractionPhase;
  requestId: string;
}

export type DetailSectionItems = Partial<
  Pick<
    Profile,
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
  >
>;

export interface DetailSectionResult {
  diagnostics: Diagnostic[];
  domSections?: DetailSectionItems | undefined;
  payloads: unknown[];
}

export type RuntimeMessage =
  | { type: "profile-readiness" }
  | { type: "extract-profile"; requestId?: string; settings: Settings }
  | {
      type: "extract-detail-section";
      requestId?: string;
      section: RecoverableSection;
      targetCount?: number;
    }
  | { type: "extraction-status"; status: ExtractionStatus }
  | {
      type: "recover-detail-section-tab";
      section: RecoverableSection;
      targetCount?: number;
      timeoutMs: number;
      url: string;
    };

export type RuntimeResponse =
  | { ok: true; readiness: ReadinessResult }
  | { ok: true; profile: Profile }
  | { ok: true; detail: DetailSectionResult }
  | { ok: false; error: string };
