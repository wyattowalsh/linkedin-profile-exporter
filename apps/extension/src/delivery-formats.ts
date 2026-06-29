import { isTextExportFormat } from "@linkedin-profile-exporter/core/export-formats";
import type { ExportFormat } from "@linkedin-profile-exporter/core/schema";
import type { Settings } from "@linkedin-profile-exporter/core/settings";

export function formatsForDelivery(
  deliveryMode: Settings["deliveryMode"],
  formats: readonly ExportFormat[]
): ExportFormat[] {
  return deliveryMode === "clipboard" ? formats.filter(isTextExportFormat) : [...formats];
}

export function blockedClipboardFormats(formats: readonly ExportFormat[]): ExportFormat[] {
  return formats.filter((format) => !isTextExportFormat(format));
}
