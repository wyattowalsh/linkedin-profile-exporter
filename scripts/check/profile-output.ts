import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { XMLParser } from "fast-xml-parser";
import { JSDOM } from "jsdom";
import {
  applyProfileSettings,
  defaultSettings,
  EXPORT_FORMATS,
  exportProfile,
  extractProfileFromDocument,
  validateProfile,
  type Profile
} from "@linkedin-profile-exporter/core";
import { denseProfileHtml } from "@linkedin-profile-exporter/fixtures";

const TOP_LEVEL_KEYS = [
  "schemaVersion",
  "identity",
  "work",
  "education",
  "skills",
  "licensesCertifications",
  "projects",
  "publications",
  "volunteering",
  "honorsAwards",
  "testScores",
  "patents",
  "languages",
  "courses",
  "recommendations",
  "featured",
  "organizations",
  "interests",
  "metadata",
  "diagnostics",
  "exportMetadata"
] as const;

const SECTION_NAMES = [
  "work",
  "education",
  "skills",
  "licensesCertifications",
  "projects",
  "publications",
  "volunteering",
  "honorsAwards",
  "testScores",
  "patents",
  "languages",
  "courses",
  "recommendations",
  "featured",
  "organizations",
  "interests"
] as const;

type SectionName = (typeof SECTION_NAMES)[number];

const MARKDOWN_KNOWN_PAGE_CAPS: Partial<Record<SectionName, number>> = {
  courses: 20,
  featured: 20,
  projects: 20,
  skills: 20
};

const MARKDOWN_EMPTY_SKILLS_TEXT = "no accessible skills captured.";
const MARKDOWN_COVERAGE_LABELS: Record<string, string> = {
  connections: "connections",
  courses: "courses",
  education: "education",
  featured: "featured",
  followers: "followers",
  honorsawards: "honorsAwards",
  imagery: "imagery",
  interests: "interests",
  languages: "languages",
  licensescertifications: "licensesCertifications",
  links: "links",
  organizations: "organizations",
  pagination: "pagination",
  patents: "patents",
  projects: "projects",
  publications: "publications",
  recommendations: "recommendations",
  recoverybudget: "recovery-budget",
  skills: "skills",
  testscores: "testScores",
  volunteering: "volunteering",
  work: "work"
};
const MARKDOWN_COVERAGE_STATES = new Set([
  "capped",
  "complete",
  "deduplicated",
  "exhausted",
  "partial",
  "recovered",
  "unavailable"
]);

const XML_ARRAY_TAGS = new Set([
  ...SECTION_NAMES,
  "authors",
  "contributors",
  "diagnostics",
  "formats",
  "inventors",
  "links",
  "roles"
]);

const XML_NUMERIC_TAGS = new Set(["confidence", "endorsements"]);

interface ExportSummary {
  bytes: number;
  format: string;
  mimeType: string;
}

interface MarkdownProfileSummary {
  capturedAt?: string | undefined;
  coverageDiagnostics: string[];
  duplicateCourseRows: number;
  formats: string[];
  schemaVersion?: string | undefined;
  sectionCounts: Partial<Record<SectionName, number>>;
  sourceUrl?: string | undefined;
  warnings: string[];
}

type ProfileOutput =
  | { kind: "profile"; profile: Profile }
  | { kind: "markdown"; summary: MarkdownProfileSummary };

async function main(): Promise<void> {
  const sourcePath = process.argv[2];
  const source = sourcePath ? "file" : "fixture:denseProfileHtml";
  const output = sourcePath
    ? profileOutputFromFile(sourcePath)
    : { kind: "profile" as const, profile: profileFromFixture() };

  if (output.kind === "markdown") {
    assertMarkdownSummary(output.summary);
    console.log(JSON.stringify(markdownResult(source, output.summary), null, 2));
    return;
  }

  const profile = output.profile;
  assertCanonicalShape(profile);
  const privacy = assertSettingsFiltering(profile);
  const exports = await assertAllExports(profile);

  console.log(
    JSON.stringify(
      {
        ok: true,
        source,
        schemaVersion: profile.schemaVersion,
        identity: {
          namePresent: Boolean(profile.identity.name),
          profileUrlHost: hostOnly(profile.identity.profileUrl)
        },
        metadata: {
          capturedAt: profile.metadata.capturedAt,
          generator: profile.metadata.generator,
          sourceUrlHost: hostOnly(profile.metadata.sourceUrl)
        },
        sectionCounts: sectionCounts(profile),
        diagnostics: {
          count: profile.diagnostics.length,
          codes: [...new Set(profile.diagnostics.map((diagnostic) => diagnostic.code))].sort()
        },
        privacy,
        exports
      },
      null,
      2
    )
  );
}

export function profileFromFile(path: string): Profile {
  const output = profileOutputFromFile(path);
  assert(output.kind === "profile", "Markdown exports are aggregate-assurance inputs only.");
  return output.profile;
}

export function profileOutputFromFile(path: string): ProfileOutput {
  const sourcePath = resolve(path);
  const contents = readFileSync(sourcePath, "utf8");
  if (sourcePath.toLowerCase().endsWith(".xml") || contents.trimStart().startsWith("<")) {
    return { kind: "profile", profile: profileFromXml(contents) };
  }
  if (isMarkdownProfileExport(contents)) {
    return { kind: "markdown", summary: profileSummaryFromMarkdown(contents) };
  }
  return { kind: "profile", profile: validateProfile(JSON.parse(contents)) };
}

export function profileFromXml(contents: string): Profile {
  const parser = new XMLParser({
    ignoreAttributes: false,
    parseTagValue: false,
    trimValues: true
  });
  const parsed = parser.parse(contents) as unknown;
  const root = objectRecord(parsed)?.profile;
  assert(root, "XML profile output must contain a <profile> root");
  return validateProfile(normalizeXmlProfileValue(root));
}

export function profileSummaryFromMarkdown(contents: string): MarkdownProfileSummary {
  const frontmatter = markdownFrontmatter(contents);
  const sections = markdownSections(contents);
  const sectionCounts: Partial<Record<SectionName, number>> = {};
  for (const [title, body] of sections) {
    const section = markdownSectionName(title);
    if (!section) continue;
    sectionCounts[section] = markdownSectionCount(section, body);
  }

  const duplicateCourseRows = duplicateMarkdownCourseRows(sections.get("Courses") ?? "");
  const coverageDiagnostics = markdownCoverageDiagnostics(
    sections.get("Coverage Diagnostics") ?? ""
  );
  const warnings: string[] = [];
  for (const [section, knownCap] of Object.entries(MARKDOWN_KNOWN_PAGE_CAPS) as Array<
    [SectionName, number]
  >) {
    const count = sectionCounts[section] ?? 0;
    if (
      section === "skills" &&
      markdownSkillsUsesLegacyCommaLine(sections.get("Skills") ?? "") &&
      count >= knownCap &&
      !markdownCoverageSectionResolved(coverageDiagnostics, section, count)
    ) {
      warnings.push("skills-count-may-be-default-page-size");
      continue;
    }
    if (
      count === knownCap &&
      !markdownCoverageSectionResolved(coverageDiagnostics, section, count)
    ) {
      warnings.push(`${section}-count-is-default-page-size`);
    }
  }
  if (duplicateCourseRows) {
    warnings.push("courses-contain-duplicate-normalized-identities");
  }

  return {
    capturedAt: frontmatter.capturedAt,
    coverageDiagnostics,
    duplicateCourseRows,
    formats: frontmatter.formats,
    schemaVersion: frontmatter.schema,
    sectionCounts,
    sourceUrl: frontmatter.sourceUrl,
    warnings
  };
}

function isMarkdownProfileExport(contents: string): boolean {
  return /^---\s*\n[\s\S]*?\n---\s*\n\s*# /m.test(contents);
}

function markdownFrontmatter(contents: string): {
  capturedAt?: string;
  formats: string[];
  schema?: string;
  sourceUrl?: string;
} {
  const match = /^---\s*\n([\s\S]*?)\n---\s*/m.exec(contents);
  assert(match, "Markdown profile output must contain frontmatter.");
  const frontmatter = match[1] ?? "";
  const formats: string[] = [];
  const metadata: {
    capturedAt?: string;
    formats: string[];
    schema?: string;
    sourceUrl?: string;
  } = { formats };
  let collectingFormats = false;
  for (const line of frontmatter.split("\n")) {
    const keyValue = /^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/.exec(line);
    if (keyValue) {
      const key = keyValue[1] ?? "";
      const value = keyValue[2] ?? "";
      collectingFormats = key === "formats";
      if (key === "schema") metadata.schema = value;
      if (key === "sourceUrl") metadata.sourceUrl = value;
      if (key === "capturedAt") metadata.capturedAt = value;
      continue;
    }
    if (collectingFormats) {
      const format = /^\s*-\s*(\S+)\s*$/.exec(line)?.[1];
      if (format) formats.push(format);
    }
  }
  return metadata;
}

function markdownSections(contents: string): Map<string, string> {
  const sections = new Map<string, string>();
  const matches = Array.from(contents.matchAll(/^##\s+(.+?)\s*$/gm));
  for (const [index, match] of matches.entries()) {
    const title = match[1];
    if (!title || match.index === undefined) continue;
    const start = match.index + match[0].length;
    const end = matches[index + 1]?.index ?? contents.length;
    sections.set(title.trim(), contents.slice(start, end).trim());
  }
  return sections;
}

function markdownSectionName(title: string): SectionName | undefined {
  const normalized = title.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const byTitle: Record<string, SectionName> = {
    courses: "courses",
    education: "education",
    experience: "work",
    featured: "featured",
    honorsawards: "honorsAwards",
    languages: "languages",
    licensescertifications: "licensesCertifications",
    organizations: "organizations",
    patents: "patents",
    projects: "projects",
    publications: "publications",
    recommendations: "recommendations",
    skills: "skills",
    testscores: "testScores",
    volunteering: "volunteering"
  };
  return byTitle[normalized];
}

function markdownSectionCount(section: SectionName, body: string): number {
  if (!body.trim()) return 0;
  if (section === "skills") {
    if (body.trim().toLowerCase() === MARKDOWN_EMPTY_SKILLS_TEXT) return 0;
    const bulletRows = body.split("\n").filter((line) => line.trimStart().startsWith("- "));
    if (bulletRows.length) return bulletRows.length;
    return legacyCommaSeparatedSkillCount(body);
  }
  return body.split("\n").filter((line) => line.trimStart().startsWith("- ")).length;
}

function markdownSkillsUsesLegacyCommaLine(body: string): boolean {
  if (!body.trim() || body.trim().toLowerCase() === MARKDOWN_EMPTY_SKILLS_TEXT) return false;
  return !body.split("\n").some((line) => line.trimStart().startsWith("- "));
}

function legacyCommaSeparatedSkillCount(body: string): number {
  return body
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean).length;
}

function duplicateMarkdownCourseRows(body: string): number {
  const seen = new Set<string>();
  let duplicateRows = 0;
  for (const line of body.split("\n")) {
    if (!line.trimStart().startsWith("- ")) continue;
    const name = markdownRecordField(line, "Name");
    const number = markdownRecordField(line, "Number");
    if (!name && !number) continue;
    const key = [number ?? "", name ?? ""].join("|").toLowerCase().replace(/\s+/g, " ").trim();
    if (seen.has(key)) {
      duplicateRows += 1;
      continue;
    }
    seen.add(key);
  }
  return duplicateRows;
}

function markdownCoverageDiagnostics(body: string): string[] {
  return body
    .split("\n")
    .map((line) => /^-\s+([^:]+):\s+([a-z-]+)(?:\s+\((\d+)\))?/.exec(line.trim()))
    .flatMap((match) => {
      if (!match) return [];
      const sectionLabel = (match[1] ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
      const section = MARKDOWN_COVERAGE_LABELS[sectionLabel];
      const state = match[2] ?? "";
      if (!section || !MARKDOWN_COVERAGE_STATES.has(state)) return [];
      const count = match[3] ? Number(match[3]) : undefined;
      return [`${section}:${state}${Number.isFinite(count) ? `:${count}` : ""}`];
    });
}

function markdownCoverageSectionResolved(
  coverageDiagnostics: string[],
  section: SectionName,
  count: number
): boolean {
  const states = new Set(
    coverageDiagnostics
      .map((diagnostic) => diagnostic.split(":"))
      .filter(([diagnosticSection]) => diagnosticSection === section)
      .map(([, state]) => state)
      .filter((state): state is string => Boolean(state))
  );
  if (states.has("complete")) return true;
  const knownCap = MARKDOWN_KNOWN_PAGE_CAPS[section];
  return states.has("recovered") && (!knownCap || count > knownCap);
}

function markdownRecordField(line: string, field: string): string | undefined {
  const match = new RegExp(`(?:^|- |; )${escapeRegExp(field)}: ([^;]+)`).exec(line);
  return match?.[1]?.trim();
}

function assertMarkdownSummary(summary: MarkdownProfileSummary): void {
  assert(
    summary.schemaVersion === "linkedin-profile-exporter.profile.v1",
    "Markdown profile output frontmatter schema is invalid."
  );
  assert(Boolean(summary.sourceUrl), "Markdown profile output frontmatter sourceUrl is required.");
  if (summary.sourceUrl) assertUrl(summary.sourceUrl, "Markdown sourceUrl is invalid.");
}

function markdownResult(source: string, summary: MarkdownProfileSummary): Record<string, unknown> {
  return {
    ok: true,
    source,
    format: "markdown",
    schemaVersion: summary.schemaVersion,
    metadata: {
      capturedAt: summary.capturedAt,
      sourceUrlHost: summary.sourceUrl ? hostOnly(summary.sourceUrl) : undefined
    },
    sectionCounts: summary.sectionCounts,
    markdownAssurance: {
      coverageDiagnostics: summary.coverageDiagnostics,
      duplicateCourseRows: summary.duplicateCourseRows,
      formats: summary.formats,
      warnings: summary.warnings
    }
  };
}

function profileFromFixture(): Profile {
  const dom = new JSDOM(denseProfileHtml, {
    url: "https://www.linkedin.com/in/alex-rivera-fixture/"
  });
  return withDomGlobals(dom.window, () =>
    extractProfileFromDocument(dom.window.document, {
      now: "2026-05-25T12:00:00.000Z",
      settings: { diagnostics: { includeAllFields: true } },
      url: "https://www.linkedin.com/in/alex-rivera-fixture/"
    })
  );
}

type DomConstructors = Pick<
  typeof globalThis,
  "HTMLAnchorElement" | "HTMLElement" | "HTMLImageElement"
>;

function withDomGlobals<T>(window: DomConstructors, callback: () => T): T {
  const globalScope = globalThis as typeof globalThis & {
    HTMLAnchorElement?: typeof HTMLAnchorElement;
    HTMLImageElement?: typeof HTMLImageElement;
    HTMLElement?: typeof HTMLElement;
  };
  const previous = {
    HTMLAnchorElement: globalScope.HTMLAnchorElement,
    HTMLImageElement: globalScope.HTMLImageElement,
    HTMLElement: globalScope.HTMLElement
  };
  globalScope.HTMLAnchorElement = window.HTMLAnchorElement;
  globalScope.HTMLImageElement = window.HTMLImageElement;
  globalScope.HTMLElement = window.HTMLElement;
  try {
    return callback();
  } finally {
    restoreGlobal("HTMLAnchorElement", previous.HTMLAnchorElement);
    restoreGlobal("HTMLImageElement", previous.HTMLImageElement);
    restoreGlobal("HTMLElement", previous.HTMLElement);
  }
}

function restoreGlobal(
  name: "HTMLAnchorElement" | "HTMLImageElement" | "HTMLElement",
  value: unknown
) {
  if (value) {
    Object.defineProperty(globalThis, name, {
      configurable: true,
      value,
      writable: true
    });
    return;
  }
  Reflect.deleteProperty(globalThis, name);
}

function assertCanonicalShape(profile: Profile): void {
  for (const key of TOP_LEVEL_KEYS) {
    assert(key in profile, `canonical profile is missing top-level key: ${key}`);
  }
  for (const section of SECTION_NAMES) {
    assert(
      Array.isArray(profile[section]),
      `canonical profile section is not an array: ${section}`
    );
  }
  assert(Boolean(profile.identity.name), "canonical profile identity.name is required");
  assertUrl(profile.identity.profileUrl, "canonical profile identity.profileUrl is invalid");
  assertUrl(profile.metadata.sourceUrl, "canonical profile metadata.sourceUrl is invalid");
  assert(
    profile.metadata.generator === "linkedin-profile-exporter",
    "canonical profile metadata.generator must be linkedin-profile-exporter"
  );
}

function assertSettingsFiltering(profile: Profile): Record<string, boolean> {
  const sourceHasProvenance = hasNestedKey(profile, "provenance");
  const sourceHasConfidence = hasNestedKey(profile, "confidence");
  const sourceHasDiagnostics = profile.diagnostics.length > 0;

  const defaultFiltered = applyProfileSettings(profile, defaultSettings);
  assert(defaultFiltered.diagnostics.length === 0, "default settings must strip diagnostics");
  assert(!hasNestedKey(defaultFiltered, "provenance"), "default settings must strip provenance");
  assert(!hasNestedKey(defaultFiltered, "confidence"), "default settings must strip confidence");

  const fullFields = applyProfileSettings(profile, { diagnostics: { includeAllFields: true } });
  if (sourceHasProvenance) {
    assert(hasNestedKey(fullFields, "provenance"), "includeAllFields must preserve provenance");
  }
  if (sourceHasConfidence) {
    assert(hasNestedKey(fullFields, "confidence"), "includeAllFields must preserve confidence");
  }
  if (sourceHasDiagnostics) {
    assert(fullFields.diagnostics.length > 0, "includeAllFields must preserve diagnostics");
  }

  return {
    defaultStripsConfidence: !hasNestedKey(defaultFiltered, "confidence"),
    defaultStripsDiagnostics: defaultFiltered.diagnostics.length === 0,
    defaultStripsProvenance: !hasNestedKey(defaultFiltered, "provenance"),
    includeAllFieldsPreservesConfidence:
      !sourceHasConfidence || hasNestedKey(fullFields, "confidence"),
    includeAllFieldsPreservesDiagnostics:
      !sourceHasDiagnostics || fullFields.diagnostics.length > 0,
    includeAllFieldsPreservesProvenance:
      !sourceHasProvenance || hasNestedKey(fullFields, "provenance")
  };
}

async function assertAllExports(profile: Profile): Promise<ExportSummary[]> {
  const summaries: ExportSummary[] = [];
  for (const format of EXPORT_FORMATS) {
    const result = await exportProfile(profile, format, {
      filenameTemplate: "{name}-{date}-{format}"
    });
    const bytes =
      typeof result.contents === "string"
        ? Buffer.byteLength(result.contents, "utf8")
        : result.contents.byteLength;
    assert(bytes > 0, `${format} export is empty`);

    if (format === "json" || format === "json-resume") {
      JSON.parse(String(result.contents));
    }
    if (format === "csv") {
      assert(
        String(result.contents).startsWith("section,index,field,value,source,confidence"),
        "CSV header is invalid"
      );
    }
    if (format === "markdown") {
      assert(
        String(result.contents).includes("\n# "),
        "Markdown export is missing profile heading"
      );
    }
    if (format === "xml") {
      assert(String(result.contents).includes("<profile>"), "XML export is missing profile root");
    }
    if (format === "xlsx") {
      const contents = result.contents;
      assert(contents instanceof Uint8Array, "XLSX export must be binary");
      assert(contents[0] === 0x50 && contents[1] === 0x4b, "XLSX export is not a ZIP container");
    }

    summaries.push({
      bytes,
      format,
      mimeType: result.mimeType
    });
  }
  return summaries;
}

function sectionCounts(profile: Profile): Record<SectionName, number> {
  return Object.fromEntries(
    SECTION_NAMES.map((section) => [section, profile[section].length])
  ) as Record<SectionName, number>;
}

function hasNestedKey(value: unknown, key: string): boolean {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some((item) => hasNestedKey(item, key));
  const record = value as Record<string, unknown>;
  return key in record || Object.values(record).some((item) => hasNestedKey(item, key));
}

function hostOnly(url: string): string {
  return new URL(url).host;
}

function assertUrl(url: string, message: string): void {
  try {
    new URL(url);
  } catch {
    throw new Error(message);
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function normalizeXmlProfileValue(value: unknown, key?: string): unknown {
  if (XML_ARRAY_TAGS.has(key ?? "")) {
    if (value === undefined || value === null || value === "") return [];
    const items = Array.isArray(value) ? value : [value];
    return items.map((item) => normalizeXmlProfileValue(item));
  }

  if (Array.isArray(value)) return value.map((item) => normalizeXmlProfileValue(item));

  const record = objectRecord(value);
  if (record) {
    return Object.fromEntries(
      Object.entries(record).map(([entryKey, entryValue]) => [
        entryKey,
        normalizeXmlProfileValue(entryValue, entryKey)
      ])
    );
  }

  if (key && XML_NUMERIC_TAGS.has(key) && typeof value === "string" && value.trim()) {
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : value;
  }

  return value;
}

function objectRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
