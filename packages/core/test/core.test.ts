import { XMLParser } from "fast-xml-parser";
import { describe, expect, it } from "vitest";
import {
  denseProfileHtml,
  hiddenSectionProfileHtml,
  invalidProfileFixture,
  liveLikeProfileHtml,
  metadataBackedProfileHtml,
  multilingualProfileHtml,
  sparseProfileHtml,
  voyagerProfilePayload,
  voyagerSupplementalSkillsPayload
} from "@linkedin-profile-exporter/fixtures";
import {
  EXPORT_FORMATS,
  defaultSettings,
  applyProfileSettings,
  detectLinkedInProfileReadiness,
  exportCanonicalJson,
  exportCsv,
  exportJsonResume,
  exportMarkdown,
  exportProfile,
  exportXlsx,
  exportXml,
  exportYamlResume,
  extractProfileFromHtml,
  extractProfileFromVoyagerPayload,
  profileSchema,
  settingsSchema
} from "../src";

describe("canonical schema", () => {
  it("accepts dense extracted fixtures and rejects invalid fixtures", () => {
    const profile = extractProfileFromHtml(denseProfileHtml, { now: "2026-05-25T12:00:00.000Z" });
    expect(profileSchema.parse(profile).identity.name).toBe("Alex Rivera");
    expect(() => profileSchema.parse(invalidProfileFixture)).toThrow();
  });

  it("keeps local-only privacy defaults", () => {
    const settings = settingsSchema.parse({});
    expect(settings).toEqual(defaultSettings);
    expect(settings.privacy.localOnly).toBe(true);
    expect(settings.privacy.analyticsEnabled).toBe(false);
    expect(settings.outputFormats).toContain("json");
    expect(settings.automationMode).toBe("review-before-export");
    expect(settings.deliveryMode).toBe("download");
  });
});

describe("extraction", () => {
  it("detects LinkedIn readiness states", () => {
    expect(detectLinkedInProfileReadiness("https://www.linkedin.com/in/example/").state).toBe("ready");
    expect(detectLinkedInProfileReadiness("https://example.test/not-linkedin").state).toBe("unavailable");
  });

  it("detects delayed live-style LinkedIn landmarks", () => {
    const emptyDocument = new DOMParser().parseFromString("<!doctype html><html><body></body></html>", "text/html");
    expect(detectLinkedInProfileReadiness({ document: emptyDocument, url: "https://www.linkedin.com/in/loading/" })).toMatchObject({
      state: "needs-action",
      profileUrl: "https://www.linkedin.com/in/loading/"
    });

    const gateDocument = new DOMParser().parseFromString(
      '<!doctype html><html><body><main><h1>Sign in to LinkedIn</h1></main></body></html>',
      "text/html"
    );
    expect(detectLinkedInProfileReadiness({ document: gateDocument, url: "https://www.linkedin.com/in/gated/" })).toMatchObject({
      state: "needs-action",
      profileUrl: "https://www.linkedin.com/in/gated/"
    });

    const liveLikeDocument = new DOMParser().parseFromString(liveLikeProfileHtml, "text/html");
    expect(detectLinkedInProfileReadiness(liveLikeDocument).state).toBe("ready");
    expect(extractProfileFromHtml(liveLikeProfileHtml).identity).toMatchObject({
      name: "Jordan Lee",
      headline: "Product operator building local export workflows",
      location: "Brooklyn, NY"
    });

    const metadataDocument = new DOMParser().parseFromString(metadataBackedProfileHtml, "text/html");
    expect(detectLinkedInProfileReadiness(metadataDocument).state).toBe("ready");
    expect(extractProfileFromHtml(metadataBackedProfileHtml).identity).toMatchObject({
      name: "Taylor Morgan",
      headline: "Privacy engineer"
    });
  });

  it("extracts dense profile sections with provenance and diagnostics", () => {
    const profile = extractProfileFromHtml(denseProfileHtml, { now: "2026-05-25T12:00:00.000Z" });
    expect(profile.work[0]?.roles[0]?.title).toBe("Engineering Manager");
    expect(profile.education[0]?.school).toBe("Example University");
    expect(profile.skills.map((skill) => skill.name)).toContain("Schema Design");
    expect(profile.recommendations[0]?.text).toContain("ambiguous data problems");
    expect(profile.identity.provenance?.sourceType).toBe("dom");
    expect(profile.diagnostics.some((diagnostic) => diagnostic.code === "client-state.parsed")).toBe(true);
  });

  it("handles sparse, multilingual, and hidden-section fixtures", () => {
    expect(extractProfileFromHtml(sparseProfileHtml).work).toHaveLength(0);
    expect(extractProfileFromHtml(multilingualProfileHtml).metadata.locale).toBe("es");
    const hidden = extractProfileFromHtml(hiddenSectionProfileHtml);
    expect(hidden.projects[0]?.name).toBe("Local Export Workbench");
    expect(hidden.diagnostics.some((diagnostic) => diagnostic.code === "automation.hidden-section")).toBe(true);
  });

  it("continues when embedded client state has an unsupported shape", () => {
    const html = denseProfileHtml.replace('"skills": [{ "name": "Schema Design", "endorsements": 8 }]', '"skills": "not-an-array"');
    const profile = extractProfileFromHtml(html, { now: "2026-05-25T12:00:00.000Z" });
    expect(profile.identity.name).toBe("Alex Rivera");
    expect(profile.diagnostics.some((diagnostic) => diagnostic.code === "client-state.invalid-shape")).toBe(true);
  });

  it("extracts real-profile sections from LinkedIn Voyager payloads", () => {
    const profile = extractProfileFromVoyagerPayload(voyagerProfilePayload, {
      now: "2026-05-25T12:00:00.000Z",
      supplementalPayloads: [voyagerSupplementalSkillsPayload],
      url: "https://www.linkedin.com/in/alex-rivera-fixture/"
    });
    expect(profile.identity).toMatchObject({
      name: "Alex Rivera",
      headline: "Engineering leader building privacy-preserving data products",
      about: "I build local-first tools that turn messy browser workflows into structured, reviewable data.",
      location: "New York, NY"
    });
    expect(profile.work[0]).toMatchObject({
      title: "Director of Engineering",
      company: "Northstar Labs",
      dates: "2021-01 - Present"
    });
    expect(profile.education[0]).toMatchObject({
      school: "Example University",
      degree: "BS",
      field: "Computer Science",
      dates: "2011 - 2015"
    });
    expect(profile.skills.map((skill) => skill.name)).toEqual(["TypeScript", "Browser Extensions"]);
    expect(profile.projects[0]?.name).toBe("Local Export Workbench");
    expect(profile.diagnostics.some((diagnostic) => diagnostic.code === "linkedin-voyager.parsed")).toBe(true);
  });

  it("applies data scope and diagnostic settings without dropping required identity", () => {
    const profile = extractProfileFromHtml(denseProfileHtml, { now: "2026-05-25T12:00:00.000Z" });
    const filtered = applyProfileSettings(profile, {
      dataScope: { ...defaultSettings.dataScope, identity: false, experience: false, extendedSections: false, imageryMetadata: false },
      diagnostics: { includeConfidence: false, includeProvenance: false, verbose: false }
    });
    expect(filtered.identity).toMatchObject({ name: "Alex Rivera", profileUrl: "https://www.linkedin.com/in/alex-rivera-fixture/" });
    expect(filtered.identity.headline).toBeUndefined();
    expect(filtered.identity.provenance).toBeUndefined();
    expect(filtered.work).toHaveLength(0);
    expect(filtered.projects).toHaveLength(0);
  });
});

describe("exporters", () => {
  const profile = () => extractProfileFromHtml(denseProfileHtml, { now: "2026-05-25T12:00:00.000Z" });

  it("exports every registered format", async () => {
    await Promise.all(
      EXPORT_FORMATS.map(async (format) => {
        const result = await exportProfile(profile(), format);
        expect(result.filename).toContain("alex-rivera");
        expect(result.contents).toBeTruthy();
      })
    );
  });

  it("uses sanitized filename templates with format placeholders", async () => {
    const result = await exportProfile(profile(), "markdown", { filenameTemplate: "{name}/{date}/{format}" });
    expect(result.filename).toBe("alex-rivera-2026-05-25-markdown.md");
  });

  it("exports parseable JSON, YAML, XML, Markdown, CSV, and XLSX", async () => {
    expect(JSON.parse(exportCanonicalJson(profile())).identity.name).toBe("Alex Rivera");
    expect(exportJsonResume(profile()).basics).toMatchObject({ name: "Alex Rivera" });
    expect(exportYamlResume(profile())).toContain("basics:");
    expect(exportCsv(profile()).split("\n")[0]).toBe("section,index,field,value,source,confidence");
    expect(exportMarkdown(profile())).toContain("---\nschema:");
    expect(new XMLParser().parse(exportXml(profile())).profile.schemaVersion).toBe("linkedin-profile-exporter.profile.v1");
    const workbook = await exportXlsx(profile());
    expect(workbook.byteLength).toBeGreaterThan(100);
  });
});
