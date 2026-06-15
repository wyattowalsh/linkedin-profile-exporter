import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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

interface ExportSummary {
  bytes: number;
  format: string;
  mimeType: string;
}

async function main(): Promise<void> {
  const sourcePath = process.argv[2];
  const source = sourcePath ? "file" : "fixture:denseProfileHtml";
  const profile = sourcePath ? profileFromFile(sourcePath) : profileFromFixture();

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

function profileFromFile(path: string): Profile {
  return validateProfile(JSON.parse(readFileSync(resolve(path), "utf8")));
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

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

await main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
