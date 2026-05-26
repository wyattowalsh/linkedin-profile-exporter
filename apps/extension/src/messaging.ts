import type { ReadinessResult } from "@linkedin-profile-exporter/core/extraction";
import type { ExportFormat, Profile } from "@linkedin-profile-exporter/core/schema";
import type { Settings } from "@linkedin-profile-exporter/core/settings";

export type RuntimeMessage =
  | { type: "profile-readiness" }
  | { type: "extract-profile"; settings: Settings }
  | { type: "download-export"; profile: Profile; format: ExportFormat; filenameTemplate?: string };

export type RuntimeResponse =
  | { ok: true; readiness: ReadinessResult }
  | { ok: true; profile: Profile }
  | { ok: true; downloaded: true }
  | { ok: false; error: string };
