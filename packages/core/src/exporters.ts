import ExcelJS from "exceljs";
import { XMLBuilder } from "fast-xml-parser";
import { stringify as stringifyYaml } from "yaml";
import { type ExportFormat, type Profile, validateProfile } from "./schema";

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

export interface ExportOptions {
  filenameTemplate?: string;
}

export interface ExportResult {
  format: ExportFormat;
  filename: string;
  mimeType: string;
  contents: string | Uint8Array;
}

export async function exportProfile(
  profileInput: unknown,
  format: ExportFormat,
  options: ExportOptions = {}
): Promise<ExportResult> {
  const profile = validateProfile(profileInput);
  const base = filenameBase(
    profile,
    format,
    options.filenameTemplate ?? profile.exportMetadata.filenameTemplate
  );
  switch (format) {
    case "json":
      return {
        format,
        filename: `${base}.json`,
        mimeType: "application/json",
        contents: exportCanonicalJson(profile)
      };
    case "json-resume":
      return {
        format,
        filename: `${base}.resume.json`,
        mimeType: "application/json",
        contents: JSON.stringify(exportJsonResume(profile), null, 2)
      };
    case "yaml":
      return {
        format,
        filename: `${base}.yaml`,
        mimeType: "text/yaml",
        contents: exportYamlResume(profile)
      };
    case "csv":
      return {
        format,
        filename: `${base}.csv`,
        mimeType: "text/csv",
        contents: exportCsv(profile)
      };
    case "xlsx":
      return {
        format,
        filename: `${base}.xlsx`,
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        contents: await exportXlsx(profile)
      };
    case "xml":
      return {
        format,
        filename: `${base}.xml`,
        mimeType: "application/xml",
        contents: exportXml(profile)
      };
    case "markdown":
      return {
        format,
        filename: `${base}.md`,
        mimeType: "text/markdown",
        contents: exportMarkdown(profile)
      };
  }
}

export function exportCanonicalJson(profileInput: unknown): string {
  return JSON.stringify(compactCanonicalJson(validateProfile(profileInput)), null, 2);
}

export function exportJsonResume(profileInput: unknown): Record<string, unknown> {
  const profile = validateProfile(profileInput);
  return {
    basics: {
      name: profile.identity.name,
      label: profile.identity.headline,
      image: profile.identity.imagery?.profileImageUrl,
      url: profile.identity.profileUrl,
      summary: profile.identity.about,
      location: profile.identity.location ? { address: profile.identity.location } : undefined,
      profiles: profile.identity.links.map((link) => ({ network: link.label, url: link.url }))
    },
    work: profile.work.map((item) => ({
      name: item.company,
      position: item.title,
      location: item.location,
      summary: item.description,
      highlights: item.roles.map((role) =>
        [role.title, role.dates, role.description].filter(Boolean).join(" - ")
      ),
      startDate: item.dates
    })),
    education: profile.education.map((item) => ({
      institution: item.school,
      area: item.field,
      studyType: item.degree,
      startDate: item.dates,
      courses: item.activities ? [item.activities] : []
    })),
    skills: profile.skills.map((item) => ({
      name: item.name,
      keywords: item.endorsements ? [`${item.endorsements} endorsements`] : []
    })),
    certificates: profile.licensesCertifications.map((item) => ({
      name: item.name,
      issuer: item.issuer,
      date: item.date,
      url: item.credentialUrl
    })),
    projects: profile.projects,
    publications: profile.publications,
    volunteer: profile.volunteering.map((item) => ({
      organization: item.organization,
      position: item.role,
      summary: item.description,
      startDate: item.dates
    })),
    awards: profile.honorsAwards,
    languages: profile.languages.map((item) => ({
      language: item.language,
      fluency: item.fluency
    })),
    interests: profile.interests.map((item) => ({ name: item.name })),
    references: profile.recommendations.map((item) => ({ name: item.name, reference: item.text })),
    meta: {
      canonicalSchema: profile.schemaVersion,
      generatedAt: profile.metadata.capturedAt,
      sourceUrl: profile.metadata.sourceUrl,
      linkedinProfileExporter: {
        canonicalProfile: compactCanonicalJson(profile),
        courses: profile.courses,
        featured: profile.featured,
        organizations: profile.organizations,
        testScores: profile.testScores,
        patents: profile.patents
      }
    }
  };
}

export function exportYamlResume(profileInput: unknown): string {
  return stringifyYaml(exportJsonResume(profileInput));
}

export function exportCsv(profileInput: unknown): string {
  const profile = validateProfile(profileInput);
  const rows: Array<Record<string, string>> = [];
  flatten("identity", profile.identity, rows);
  for (const section of repeatSections(profile)) {
    section.items.forEach((item, index) => flatten(section.name, item, rows, String(index + 1)));
  }
  return toCsv(rows, ["section", "index", "field", "value", "source", "confidence"]);
}

export async function exportXlsx(profileInput: unknown): Promise<Uint8Array> {
  const profile = validateProfile(profileInput);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "linkedin-profile-exporter";
  workbook.created = new Date(profile.metadata.capturedAt);

  addWorksheet(workbook, "identity", [profile.identity]);
  for (const section of repeatSections(profile)) {
    addWorksheet(workbook, section.name.slice(0, 31), section.items);
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer as ArrayBuffer);
}

export function exportXml(profileInput: unknown): string {
  const profile = validateProfile(profileInput);
  const builder = new XMLBuilder({ ignoreAttributes: false, format: true });
  return builder.build({ profile });
}

export function exportMarkdown(profileInput: unknown): string {
  const profile = validateProfile(profileInput);
  const frontmatter = stringifyYaml({
    schema: profile.schemaVersion,
    name: profile.identity.name,
    sourceUrl: profile.metadata.sourceUrl,
    capturedAt: profile.metadata.capturedAt,
    formats: profile.exportMetadata.formats
  }).trim();

  const lines = [
    "---",
    frontmatter,
    "---",
    "",
    `# ${profile.identity.name}`,
    profile.identity.headline ?? "",
    profile.identity.location ?? "",
    "",
    "---",
    "",
    "## About",
    profile.identity.about ?? "No accessible about text captured.",
    "",
    "## Experience",
    ...profile.work.map((item) => `- ${formatRecordSummary(item, ["title", "company", "dates"])}`),
    "",
    "## Education",
    ...profile.education.map(
      (item) =>
        `- ${item.school}${item.degree ? `, ${item.degree}` : ""}${item.field ? ` in ${item.field}` : ""}`
    ),
    "",
    "## Skills",
    profile.skills.map((skill) => skill.name).join(", ") || "No accessible skills captured.",
    "",
    ...repeatSections(profile)
      .filter((section) => !["work", "education", "skills"].includes(section.name))
      .flatMap((section) => markdownSection(section.name, section.items))
  ];

  return `${lines.filter((line, index) => line !== "" || lines[index - 1] !== "").join("\n")}\n`;
}

function repeatSections(
  profile: Profile
): Array<{ name: string; items: Array<Record<string, unknown>> }> {
  return [
    { name: "work", items: profile.work },
    { name: "education", items: profile.education },
    { name: "skills", items: profile.skills },
    { name: "licensesCertifications", items: profile.licensesCertifications },
    { name: "projects", items: profile.projects },
    { name: "publications", items: profile.publications },
    { name: "volunteering", items: profile.volunteering },
    { name: "honorsAwards", items: profile.honorsAwards },
    { name: "testScores", items: profile.testScores },
    { name: "patents", items: profile.patents },
    { name: "languages", items: profile.languages },
    { name: "courses", items: profile.courses },
    { name: "recommendations", items: profile.recommendations },
    { name: "featured", items: profile.featured },
    { name: "organizations", items: profile.organizations },
    { name: "interests", items: profile.interests }
  ];
}

function markdownSection(name: string, items: Array<Record<string, unknown>>): string[] {
  if (!items.length) return [];
  return ["", `## ${sectionTitle(name)}`, ...items.map((item) => `- ${formatRecordSummary(item)}`)];
}

function sectionTitle(name: string): string {
  return name.replace(/([A-Z])/g, " $1").replace(/^./, (value) => value.toUpperCase());
}

function formatRecordSummary(
  item: Record<string, unknown>,
  preferredFields: string[] = []
): string {
  const ordered = [
    ...preferredFields,
    ...Object.keys(item).filter(
      (key) => !preferredFields.includes(key) && key !== "provenance" && key !== "confidence"
    )
  ];
  return ordered
    .flatMap((key) => {
      const value = item[key];
      if (value === undefined) return [];
      return [`${labelize(key)}: ${formatMarkdownValue(value)}`];
    })
    .join("; ");
}

function formatMarkdownValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map(formatMarkdownValue).join(", ");
  }
  if (value && typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value);
}

function labelize(value: string): string {
  return value.replace(/([A-Z])/g, " $1").replace(/^./, (character) => character.toUpperCase());
}

function flatten(
  section: string,
  input: unknown,
  rows: Array<Record<string, string>>,
  index = ""
): void {
  if (!input || typeof input !== "object") return;
  for (const [field, value] of Object.entries(input as Record<string, unknown>)) {
    if (field === "provenance" || field === "confidence") continue;
    if (Array.isArray(value) || (value && typeof value === "object")) {
      rows.push({
        section,
        index,
        field,
        value: JSON.stringify(value),
        source: sourceOf(input),
        confidence: confidenceOf(input)
      });
    } else if (value !== undefined) {
      rows.push({
        section,
        index,
        field,
        value: String(value),
        source: sourceOf(input),
        confidence: confidenceOf(input)
      });
    }
  }
}

function sourceOf(input: unknown): string {
  if (!input || typeof input !== "object") return "";
  const source = (input as { provenance?: { source?: string } }).provenance?.source;
  return source ?? "";
}

function confidenceOf(input: unknown): string {
  if (!input || typeof input !== "object") return "";
  const confidence = (input as { confidence?: number }).confidence;
  return typeof confidence === "number" ? confidence.toFixed(2) : "";
}

function toCsv(rows: Array<Record<string, string>>, headers: string[]): string {
  return [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header] ?? "")).join(","))
  ].join("\n");
}

function csvEscape(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function addWorksheet(
  workbook: ExcelJS.Workbook,
  name: string,
  items: Array<Record<string, unknown>>
): void {
  const worksheet = workbook.addWorksheet(name);
  const keys = Array.from(
    new Set(items.flatMap((item) => Object.keys(item).filter((key) => key !== "provenance")))
  );
  worksheet.columns = keys.map((key) => ({
    header: key,
    key,
    width: Math.max(14, key.length + 2)
  }));
  for (const item of items) {
    const row: Record<string, string> = {};
    for (const key of keys) {
      const value = item[key];
      row[key] =
        typeof value === "object" && value !== null
          ? JSON.stringify(value)
          : value === undefined
            ? ""
            : String(value);
    }
    worksheet.addRow(row);
  }
}

function compactCanonicalJson(profile: Profile): Profile | Omit<Profile, "diagnostics"> {
  if (profile.diagnostics.length) return profile;
  return Object.fromEntries(
    Object.entries(profile).filter(([key]) => key !== "diagnostics")
  ) as Omit<Profile, "diagnostics">;
}

function safeFilename(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-|-$/g, "");
}

function filenameBase(profile: Profile, format: ExportFormat, template: string): string {
  const rendered = template
    .replaceAll("{name}", profile.identity.name)
    .replaceAll("{date}", profile.metadata.capturedAt.slice(0, 10))
    .replaceAll("{format}", format);
  return safeFilename(rendered) || "linkedin-profile-export";
}
