import type { ExportFormat, Profile } from "@linkedin-profile-exporter/core/schema";
import type { Settings } from "@linkedin-profile-exporter/core/settings";
import { browser } from "wxt/browser";
import { copyProfileExport, isTextExportFormat, profileToClipboardText } from "./export-download";
import type { RuntimeMessage, RuntimeResponse } from "./messaging";

export interface DeliveryResult {
  action: Settings["deliveryMode"];
  error?: string;
  fallbackText?: string | undefined;
  format: ExportFormat;
  ok: boolean;
}

export function formatsForDelivery(deliveryMode: Settings["deliveryMode"], formats: readonly ExportFormat[]): ExportFormat[] {
  return deliveryMode === "clipboard" ? formats.filter(isTextExportFormat) : [...formats];
}

export function blockedClipboardFormats(formats: readonly ExportFormat[]): ExportFormat[] {
  return formats.filter((format) => !isTextExportFormat(format));
}

export async function deliverProfileFormats(
  profile: Profile,
  settings: Settings,
  deliveryMode: Settings["deliveryMode"] = settings.deliveryMode
): Promise<DeliveryResult[]> {
  const formats = formatsForDelivery(deliveryMode, settings.outputFormats);
  return Promise.all(formats.map((format) => deliverProfileFormat(profile, settings, format, deliveryMode)));
}

async function deliverProfileFormat(
  profile: Profile,
  settings: Settings,
  format: ExportFormat,
  deliveryMode: Settings["deliveryMode"]
): Promise<DeliveryResult> {
  if (deliveryMode === "clipboard") {
    if (!isTextExportFormat(format)) {
      return { action: deliveryMode, format, ok: false, error: "XLSX is a binary workbook and must be downloaded." };
    }
    try {
      await copyProfileExport(profile, format, settings.filenameTemplate);
      return { action: deliveryMode, format, ok: true };
    } catch (error) {
      return {
        action: deliveryMode,
        format,
        ok: false,
        error: error instanceof Error ? error.message : "Clipboard access was denied.",
        fallbackText: await safeClipboardFallback(profile, format, settings.filenameTemplate)
      };
    }
  }

  const response = (await browser.runtime.sendMessage({
    type: "download-export",
    profile,
    format,
    filenameTemplate: settings.filenameTemplate
  } satisfies RuntimeMessage)) as RuntimeResponse;

  if (response.ok) return { action: deliveryMode, format, ok: true };
  return { action: deliveryMode, format, ok: false, error: response.error };
}

async function safeClipboardFallback(profile: Profile, format: ExportFormat, filenameTemplate: string): Promise<string | undefined> {
  try {
    return await profileToClipboardText(profile, format, filenameTemplate);
  } catch {
    return undefined;
  }
}
