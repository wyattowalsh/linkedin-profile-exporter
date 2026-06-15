import type { ReadinessResult } from "@linkedin-profile-exporter/core/extraction";
import type { ExportFormat, Profile } from "@linkedin-profile-exporter/core/schema";
import type { Settings } from "@linkedin-profile-exporter/core/settings";

export type ExtractionPhase =
  | "checking-readiness"
  | "preparing-page"
  | "reading-embedded-data"
  | "reading-linkedin-data"
  | "using-page-fallback"
  | "complete"
  | "failed";

export interface ExtractionStatus {
  detail?: string;
  label: string;
  phase: ExtractionPhase;
  requestId: string;
}

export type RuntimeMessage =
  | { type: "profile-readiness" }
  | { type: "extract-profile"; requestId?: string; settings: Settings }
  | { type: "download-export"; profile: Profile; format: ExportFormat; filenameTemplate?: string }
  | { type: "extraction-status"; status: ExtractionStatus };

export type RuntimeResponse =
  | { ok: true; readiness: ReadinessResult }
  | { ok: true; profile: Profile }
  | { ok: true; downloaded: true }
  | { ok: false; error: string };
