import { isTextExportFormat } from "@linkedin-profile-exporter/core/export-formats";
import type { ExportFormat, Profile } from "@linkedin-profile-exporter/core/schema";
import type { Settings } from "@linkedin-profile-exporter/core/settings";
import { blockedClipboardFormats, formatsForDelivery } from "./delivery-formats";
import {
  copyProfileExport,
  downloadProfileExport,
  profileToClipboardText
} from "./export-download";

export interface DeliveryResult {
  action: Settings["deliveryMode"];
  error?: string;
  fallbackText?: string | undefined;
  format: ExportFormat;
  ok: boolean;
}

export { blockedClipboardFormats, formatsForDelivery };

export async function deliverProfileFormats(
  profile: Profile,
  settings: Settings,
  deliveryMode: Settings["deliveryMode"] = settings.deliveryMode
): Promise<DeliveryResult[]> {
  const formats = formatsForDelivery(deliveryMode, settings.outputFormats);
  return Promise.all(
    formats.map((format) => deliverProfileFormat(profile, settings, format, deliveryMode))
  );
}

async function deliverProfileFormat(
  profile: Profile,
  settings: Settings,
  format: ExportFormat,
  deliveryMode: Settings["deliveryMode"]
): Promise<DeliveryResult> {
  if (deliveryMode === "clipboard") {
    if (!isTextExportFormat(format)) {
      return {
        action: deliveryMode,
        format,
        ok: false,
        error: "XLSX is a binary workbook and must be downloaded."
      };
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

  try {
    await downloadProfileExport(profile, format, settings.filenameTemplate);
    return { action: deliveryMode, format, ok: true };
  } catch (error) {
    return {
      action: deliveryMode,
      format,
      ok: false,
      error: error instanceof Error ? error.message : "Download failed."
    };
  }
}

async function safeClipboardFallback(
  profile: Profile,
  format: ExportFormat,
  filenameTemplate: string
): Promise<string | undefined> {
  try {
    return await profileToClipboardText(profile, format, filenameTemplate);
  } catch {
    return undefined;
  }
}
