import { isTextExportFormat } from "@linkedin-profile-exporter/core/export-formats";
import { exportProfile } from "@linkedin-profile-exporter/core/exporters";
import type { ExportFormat, Profile } from "@linkedin-profile-exporter/core/schema";
import { browser } from "wxt/browser";

export async function profileToDownload(
  profile: Profile,
  format: ExportFormat,
  filenameTemplate?: string
): Promise<{
  filename: string;
  mimeType: string;
  dataUrl: string;
}> {
  const result = await exportProfile(profile, format, exportOptions(filenameTemplate));
  const bytes =
    typeof result.contents === "string"
      ? new TextEncoder().encode(result.contents)
      : result.contents;
  const base64 = bytesToBase64(bytes);
  return {
    filename: result.filename,
    mimeType: result.mimeType,
    dataUrl: `data:${result.mimeType};base64,${base64}`
  };
}

export async function downloadProfileExport(
  profile: Profile,
  format: ExportFormat,
  filenameTemplate?: string
): Promise<void> {
  const download = await profileToDownload(profile, format, filenameTemplate);
  await browser.downloads.download({
    url: download.dataUrl,
    filename: download.filename,
    saveAs: false
  });
}

export async function profileToClipboardText(
  profile: Profile,
  format: ExportFormat,
  filenameTemplate?: string
): Promise<string> {
  if (!isTextExportFormat(format)) {
    throw new Error("XLSX workbooks are binary and must be downloaded.");
  }
  const result = await exportProfile(profile, format, exportOptions(filenameTemplate));
  if (typeof result.contents !== "string") {
    throw new Error(`${format} cannot be copied to the clipboard.`);
  }
  return result.contents;
}

export async function copyProfileExport(
  profile: Profile,
  format: ExportFormat,
  filenameTemplate?: string
): Promise<void> {
  const text = await profileToClipboardText(profile, format, filenameTemplate);
  await navigator.clipboard.writeText(text);
}

export { isTextExportFormat };

function exportOptions(filenameTemplate?: string) {
  return filenameTemplate ? { filenameTemplate } : {};
}

function bytesToBase64(bytes: Uint8Array): string {
  const chunks: string[] = [];
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize);
    chunks.push(String.fromCharCode(...chunk));
  }
  return btoa(chunks.join(""));
}
