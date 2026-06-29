import type { ExportFormat } from "./schema";

export const EXPORT_FORMATS = [
  "json",
  "json-resume",
  "yaml",
  "csv",
  "xlsx",
  "xml",
  "markdown"
] as const satisfies readonly ExportFormat[];

export const TEXT_EXPORT_FORMATS = [
  "json",
  "json-resume",
  "yaml",
  "csv",
  "xml",
  "markdown"
] as const satisfies readonly ExportFormat[];

export function isTextExportFormat(format: ExportFormat): boolean {
  return (TEXT_EXPORT_FORMATS as readonly string[]).includes(format);
}
