import { XMLParser } from "fast-xml-parser";
import { describe, expect, it } from "vitest";
import {
  denseProfileHtml,
  hiddenSectionProfileHtml,
  invalidProfileFixture,
  liveLikeProfileHtml,
  metadataBackedProfileHtml,
  multilingualProfileHtml,
  voyagerDashGraphqlProfilePayload,
  voyagerDashProfilePayload,
  sparseProfileHtml,
  voyagerProfilePayload,
  voyagerSupplementalManyCoursesPayload,
  voyagerSupplementalManySkillsPayload,
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
  settingsSchema,
  shouldIncludeVerboseDiagnostics
} from "../src";

const fullMetadataSettings = { diagnostics: { includeAllFields: true } } as const;
const fixedNow = "2026-05-25T12:00:00.000Z";

describe("canonical schema", () => {
  it("accepts dense extracted fixtures and rejects invalid fixtures", () => {
    const profile = extractProfileFromHtml(denseProfileHtml, { now: fixedNow });
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
    expect(settings.diagnostics).toMatchObject({
      includeAllFields: false,
      includeProvenance: false,
      includeConfidence: false,
      verbose: false
    });
  });
});

describe("extraction", () => {
  it("detects LinkedIn readiness states", () => {
    expect(detectLinkedInProfileReadiness("https://www.linkedin.com/in/example/").state).toBe(
      "ready"
    );
    expect(detectLinkedInProfileReadiness("https://example.test/not-linkedin").state).toBe(
      "unavailable"
    );
  });

  it("detects delayed live-style LinkedIn landmarks", () => {
    const emptyDocument = new DOMParser().parseFromString(
      "<!doctype html><html><body></body></html>",
      "text/html"
    );
    expect(
      detectLinkedInProfileReadiness({
        document: emptyDocument,
        url: "https://www.linkedin.com/in/loading/"
      })
    ).toMatchObject({
      state: "needs-action",
      profileUrl: "https://www.linkedin.com/in/loading/"
    });

    const gateDocument = new DOMParser().parseFromString(
      "<!doctype html><html><body><main><h1>Sign in to LinkedIn</h1></main></body></html>",
      "text/html"
    );
    expect(
      detectLinkedInProfileReadiness({
        document: gateDocument,
        url: "https://www.linkedin.com/in/gated/"
      })
    ).toMatchObject({
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

    const metadataDocument = new DOMParser().parseFromString(
      metadataBackedProfileHtml,
      "text/html"
    );
    expect(detectLinkedInProfileReadiness(metadataDocument).state).toBe("ready");
    expect(extractProfileFromHtml(metadataBackedProfileHtml).identity).toMatchObject({
      name: "Taylor Morgan",
      headline: "Privacy engineer"
    });
  });

  it("extracts dense profile sections with provenance and diagnostics", () => {
    const profile = extractProfileFromHtml(denseProfileHtml, {
      now: fixedNow,
      settings: fullMetadataSettings
    });
    expect(profile.work[0]?.roles[0]?.title).toBe("Engineering Manager");
    expect(profile.work[0]).toMatchObject({
      employmentType: "Full-time",
      companyUrl: "https://www.linkedin.com/company/northstar-labs/",
      companyLogoUrl: "https://static.example.test/company/northstar-200.png",
      companyIndustry: "Software Development"
    });
    expect(profile.work[0]?.roles[0]).toMatchObject({
      employmentType: "Full-time",
      location: "Remote"
    });
    expect(profile.education[0]?.school).toBe("Example University");
    expect(profile.education[0]).toMatchObject({
      schoolUrl: "https://www.linkedin.com/school/example-university/",
      schoolLogoUrl: "https://static.example.test/school/example-university-200.png"
    });
    expect(profile.skills.map((skill) => skill.name)).toContain("Schema Design");
    expect(profile.licensesCertifications[0]).toMatchObject({
      credentialId: "CERT-PRIVACY-1",
      issuerUrl: "https://www.linkedin.com/company/example-standards-institute/",
      issuerLogoUrl: "https://static.example.test/company/example-standards.png"
    });
    expect(profile.projects[0]).toMatchObject({
      associatedWith: "Director of Engineering, Northstar Labs",
      contributors: ["Alex Rivera", "Taylor Morgan"]
    });
    expect(profile.publications[0]).toMatchObject({
      description: "A fixture article about auditable browser data exports.",
      authors: ["Alex Rivera", "Taylor Morgan"]
    });
    expect(profile.volunteering[0]).toMatchObject({
      organizationUrl: "https://www.linkedin.com/company/local-tech-fellows/",
      organizationLogoUrl: "https://static.example.test/company/local-tech-fellows.png",
      cause: "Education"
    });
    expect(profile.honorsAwards[0]).toMatchObject({
      associatedWith: "Director of Engineering, Northstar Labs"
    });
    expect(profile.courses[0]).toMatchObject({
      number: "AUT-201"
    });
    expect(profile.featured[0]).toMatchObject({
      type: "article",
      imageUrl: "https://static.example.test/featured/demo.png"
    });
    expect(profile.organizations[0]).toMatchObject({
      dates: "2024 - Present",
      description: "Professional community for local browser automation.",
      url: "https://example.test/guild",
      logoUrl: "https://static.example.test/org/guild.png"
    });
    expect(profile.interests[0]).toMatchObject({
      name: "Local-first software",
      url: "https://example.test/local-first"
    });
    expect(profile.recommendations[0]?.text).toContain("ambiguous data problems");
    expect(profile.testScores[0]).toMatchObject({
      name: "GRE Quantitative Reasoning",
      score: "170"
    });
    expect(profile.patents[0]).toMatchObject({
      title: "Local Browser Export Workflow",
      patentNumber: "US-EXAMPLE-1"
    });
    expect(profile.identity.provenance?.sourceType).toBe("dom");
    expect(
      profile.diagnostics.some((diagnostic) => diagnostic.code === "client-state.parsed")
    ).toBe(true);
  });

  it("handles sparse, multilingual, and hidden-section fixtures", () => {
    expect(extractProfileFromHtml(sparseProfileHtml).work).toHaveLength(0);
    expect(extractProfileFromHtml(multilingualProfileHtml).metadata.locale).toBe("es");
    const hidden = extractProfileFromHtml(hiddenSectionProfileHtml, {
      settings: fullMetadataSettings
    });
    expect(hidden.projects[0]?.name).toBe("Local Export Workbench");
    expect(
      hidden.diagnostics.some((diagnostic) => diagnostic.code === "automation.hidden-section")
    ).toBe(true);
  });

  it("normalizes joined sentence boundaries from DOM and Voyager text", () => {
    const html = denseProfileHtml.replace(
      "I build local-first tools that turn messy browser workflows into structured, reviewable data.",
      "Fast extraction.Most exports stay local."
    );
    expect(extractProfileFromHtml(html).identity.about).toBe(
      "Fast extraction. Most exports stay local."
    );

    const payload = structuredClone(voyagerProfilePayload) as unknown as {
      included: Array<Record<string, unknown>>;
    };
    const profileEntity = payload.included.find(
      (item) => item.$type === "com.linkedin.voyager.identity.profile.Profile"
    );
    if (!profileEntity) throw new Error("Voyager profile fixture entity missing");
    profileEntity.summary = "Fast extraction.Most exports stay local.";

    const profile = extractProfileFromVoyagerPayload(payload, {
      now: fixedNow,
      supplementalPayloads: [structuredClone(voyagerSupplementalSkillsPayload)],
      url: "https://www.linkedin.com/in/alex-rivera-fixture/"
    });
    expect(profile.identity.about).toBe("Fast extraction. Most exports stay local.");
  });

  it("normalizes first-person sentence joins in rich export text", () => {
    const html = denseProfileHtml.replace(
      "I build local-first tools that turn messy browser workflows into structured, reviewable data.",
      "Fast extraction.I\u2019ve shipped exports. Costs fell 90%.I\u2019ve kept accuracy high. (Notes).Next section. Summary].Next section."
    );
    expect(extractProfileFromHtml(html).identity.about).toBe(
      "Fast extraction. I\u2019ve shipped exports. Costs fell 90%. I\u2019ve kept accuracy high. (Notes). Next section. Summary]. Next section."
    );

    const payload = structuredClone(voyagerProfilePayload) as unknown as {
      included: Array<Record<string, unknown>>;
    };
    const profileEntity = payload.included.find(
      (item) => item.$type === "com.linkedin.voyager.identity.profile.Profile"
    );
    if (!profileEntity) throw new Error("Voyager profile fixture entity missing");
    profileEntity.summary =
      "Fast extraction.I\u2019ve shipped exports. Costs fell 90%.I\u2019ve kept accuracy high.";

    const profile = extractProfileFromVoyagerPayload(payload, {
      now: fixedNow,
      supplementalPayloads: [structuredClone(voyagerSupplementalSkillsPayload)],
      url: "https://www.linkedin.com/in/alex-rivera-fixture/"
    });
    expect(profile.identity.about).toBe(
      "Fast extraction. I\u2019ve shipped exports. Costs fell 90%. I\u2019ve kept accuracy high."
    );
  });

  it("does not split URL-like tokens or uppercase acronym boundaries", () => {
    const html = denseProfileHtml.replace(
      "I build local-first tools that turn messy browser workflows into structured, reviewable data.",
      "Keep https://example.com/path.Next and U.S.A.Next intact."
    );
    expect(extractProfileFromHtml(html).identity.about).toBe(
      "Keep https://example.com/path.Next and U.S.A.Next intact."
    );
  });

  it("continues when embedded client state has an unsupported shape", () => {
    const html = denseProfileHtml.replace(
      '"skills": [{ "name": "Schema Design", "endorsements": 8 }]',
      '"skills": "not-an-array"'
    );
    const profile = extractProfileFromHtml(html, {
      now: fixedNow,
      settings: fullMetadataSettings
    });
    expect(profile.identity.name).toBe("Alex Rivera");
    expect(
      profile.diagnostics.some((diagnostic) => diagnostic.code === "client-state.invalid-shape")
    ).toBe(true);
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
      about:
        "I build local-first tools that turn messy browser workflows into structured, reviewable data.",
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
    expect(profile.licensesCertifications[0]).toMatchObject({
      name: "Privacy Engineering Certificate",
      issuerUrl: "https://www.linkedin.com/company/example-standards-institute/",
      issuerLogoUrl: "https://static.example.test/company/example-standards.png",
      date: "2024 - Present"
    });
    expect(profile.projects[0]).toMatchObject({
      name: "Local Export Workbench",
      associatedWith: "Director of Engineering, Northstar Labs",
      contributors: ["Alex Rivera"]
    });
    expect(profile.publications[0]).toMatchObject({
      name: "Practical Provenance for Browser Data",
      description: "A fixture article about auditable browser data exports.",
      authors: ["Alex Rivera"]
    });
    expect(profile.volunteering[0]).toMatchObject({
      organization: "Local Tech Fellows",
      organizationUrl: "https://www.linkedin.com/company/local-tech-fellows/",
      organizationLogoUrl: "https://static.example.test/company/local-tech-fellows.png",
      cause: "Education"
    });
    expect(profile.honorsAwards[0]).toMatchObject({
      title: "Data Quality Leadership Award",
      associatedWith: "Director of Engineering, Northstar Labs"
    });
    expect(
      profile.diagnostics.some((diagnostic) => diagnostic.code === "linkedin-voyager.parsed")
    ).toBe(true);
  });

  it("extracts Dash Voyager profile payloads with position groups", () => {
    const profile = extractProfileFromVoyagerPayload(voyagerDashProfilePayload, {
      now: "2026-05-25T12:00:00.000Z",
      source: "linkedin-voyager.network.dashProfile",
      url: "https://www.linkedin.com/in/alex-rivera-fixture/"
    });
    expect(profile.identity.name).toBe("Alex Rivera");
    expect(profile.identity).toMatchObject({
      industry: "Software Development",
      connections: "500",
      followers: "1200",
      imagery: {
        profileImageUrl: "https://static.example.test/profile/alex-400.png"
      }
    });
    expect(profile.work[0]).toMatchObject({
      title: "Director of Engineering",
      company: "Northstar Labs",
      employmentType: "Full-time",
      dates: "2020-06 - Present",
      companyUrl: "https://www.linkedin.com/company/northstar-labs/",
      companyLogoUrl: "https://static.example.test/company/northstar-200.png",
      companyIndustry: "Software Development"
    });
    expect(profile.work[0]?.roles).toMatchObject([
      {
        title: "Director of Engineering",
        employmentType: "Full-time",
        location: "New York, NY",
        dates: "2021-01 - Present",
        description: "Led browser automation and data quality teams."
      },
      {
        title: "Engineering Manager",
        employmentType: "Full-time",
        location: "Remote",
        dates: "2020-06 - 2020-12",
        description: "Scaled the platform engineering team."
      }
    ]);
    expect(profile.education[0]).toMatchObject({
      school: "Example University",
      schoolUrl: "https://www.linkedin.com/school/example-university/",
      schoolLogoUrl: "https://static.example.test/school/example-university-200.png"
    });
    expect(profile.skills).toMatchObject([{ name: "TypeScript", endorsements: 12 }]);
    expect(profile.languages[0]).toMatchObject({
      language: "English",
      fluency: "Native or bilingual"
    });
    expect(profile.courses[0]).toMatchObject({
      name: "AUT-201 - Accessible Automation Systems",
      number: "AUT-201",
      provider: "Example University"
    });
    expect(profile.featured[0]).toMatchObject({
      title: "Privacy-first extension demo",
      type: "article",
      url: "https://www.linkedin.com/feed/update/urn:li:activity:fixture",
      imageUrl: "https://static.example.test/featured/demo.png"
    });
    expect(profile.testScores[0]).toMatchObject({
      name: "GRE Quantitative Reasoning",
      score: "170",
      date: "2015"
    });
    expect(profile.patents[0]).toMatchObject({
      title: "Local Browser Export Workflow",
      issuer: "USPTO",
      patentNumber: "US-EXAMPLE-1",
      date: "2025",
      url: "https://example.test/patent",
      inventors: ["Alex Rivera"]
    });
    expect(profile.organizations[0]).toMatchObject({
      name: "Browser Tools Guild",
      role: "Member",
      dates: "2024 - Present",
      description: "Professional community for local browser automation.",
      url: "https://example.test/guild"
    });
    expect(profile.interests[0]).toMatchObject({
      name: "Local-first software",
      url: "https://www.linkedin.com/company/local-first/"
    });
    expect(profile.identity.provenance?.sourceType).toBe("client-state");
  });

  it("merges supplemental Voyager skills and courses beyond the first visible page", () => {
    const profile = extractProfileFromVoyagerPayload(voyagerDashProfilePayload, {
      now: fixedNow,
      source: "linkedin-voyager.network.dashProfile",
      supplementalPayloads: [
        voyagerSupplementalManyCoursesPayload,
        voyagerSupplementalManySkillsPayload
      ],
      url: "https://www.linkedin.com/in/alex-rivera-fixture/"
    });

    expect(profile.skills).toHaveLength(97);
    expect(profile.skills[0]?.name).toBe("TypeScript");
    expect(profile.skills.at(-1)?.name).toBe("Skill 097");
    expect(profile.courses).toHaveLength(28);
    expect(profile.courses[0]?.name).toBe("AUT-201 - Accessible Automation Systems");
    expect(profile.courses.at(-1)?.name).toBe("CRS-028 - Course 028");
  });

  it("extracts live-style skillCategory supplements with nested untyped skill records", () => {
    const skillUrns = Array.from({ length: 97 }, (_, index) =>
      index === 0
        ? "urn:li:fs_skill:(alex-rivera,typescript)"
        : `urn:li:fs_skill:(alex-rivera,skill-${String(index + 1).padStart(3, "0")})`
    );
    const profile = extractProfileFromVoyagerPayload(voyagerDashProfilePayload, {
      now: fixedNow,
      source: "linkedin-voyager.network.dashProfile",
      supplementalPayloads: [
        {
          data: {
            "*elements": ["urn:li:collection:skillCategory"]
          },
          included: [
            {
              entityUrn: "urn:li:collection:skillCategory",
              $type: "com.linkedin.voyager.identity.profile.SkillCategory",
              "*skills": skillUrns,
              paging: { count: 97, start: 0 }
            },
            ...skillUrns.map((entityUrn, index) => ({
              entityUrn,
              name: index === 0 ? "TypeScript" : `Skill ${String(index + 1).padStart(3, "0")}`,
              ...(index === 0 ? { endorsementCount: 12 } : {})
            }))
          ]
        }
      ],
      url: "https://www.linkedin.com/in/alex-rivera-fixture/"
    });

    expect(profile.skills).toHaveLength(97);
    expect(profile.skills[0]).toMatchObject({ endorsements: 12, name: "TypeScript" });
    expect(profile.skills.at(-1)?.name).toBe("Skill 097");
    expect(
      profile.diagnostics.some(
        (diagnostic) => diagnostic.code === "linkedin-voyager.skills.recovered"
      )
    ).toBe(true);
  });

  it("extracts details-page skill categories with nested skill title records", () => {
    const skillUrns = Array.from({ length: 97 }, (_, index) =>
      index === 0
        ? "urn:li:fsd_skill:(alex-rivera,typescript)"
        : `urn:li:fsd_skill:(alex-rivera,skill-${String(index + 1).padStart(3, "0")})`
    );
    const profile = extractProfileFromVoyagerPayload(voyagerDashProfilePayload, {
      now: fixedNow,
      source: "linkedin-voyager.network.dashProfile",
      supplementalPayloads: [
        {
          data: {
            "*elements": ["urn:li:fsd_profileSkillCategory:(alex-rivera,top-skills)"]
          },
          included: [
            {
              entityUrn: "urn:li:fsd_profileSkillCategory:(alex-rivera,top-skills)",
              $type: "com.linkedin.voyager.dash.identity.profile.SkillCategory",
              "*skills": skillUrns,
              paging: { total: 97, start: 0 }
            },
            ...skillUrns.map((entityUrn, index) => ({
              entityUrn,
              skillUrn: entityUrn,
              $type: "com.linkedin.voyager.dash.identity.profile.ProfileSkill",
              title: {
                text: index === 0 ? "TypeScript" : `Skill ${String(index + 1).padStart(3, "0")}`
              },
              ...(index === 0 ? { endorsementCount: 12 } : {})
            }))
          ]
        }
      ],
      url: "https://www.linkedin.com/in/alex-rivera-fixture/"
    });

    expect(profile.skills).toHaveLength(97);
    expect(profile.skills[0]).toMatchObject({ endorsements: 12, name: "TypeScript" });
    expect(profile.skills.at(-1)?.name).toBe("Skill 097");
    expect(
      profile.diagnostics.some(
        (diagnostic) => diagnostic.code === "linkedin-voyager.skills.recovered"
      )
    ).toBe(true);
  });

  it("uses paging totals instead of page size for skill completeness diagnostics", () => {
    const skillUrns = Array.from(
      { length: 20 },
      (_, index) => `urn:li:fsd_skill:(alex-rivera,skill-${String(index + 1).padStart(3, "0")})`
    );
    const profile = extractProfileFromVoyagerPayload(voyagerDashProfilePayload, {
      now: fixedNow,
      source: "linkedin-voyager.network.dashProfile",
      supplementalPayloads: [
        {
          data: {
            "*elements": ["urn:li:fsd_profileSkillCategory:(alex-rivera,top-skills)"]
          },
          included: [
            {
              entityUrn: "urn:li:fsd_profileSkillCategory:(alex-rivera,top-skills)",
              $type: "com.linkedin.voyager.dash.identity.profile.SkillCategory",
              "*skills": skillUrns,
              paging: { count: 20, total: 97, start: 0 }
            },
            ...skillUrns.map((entityUrn, index) => ({
              entityUrn,
              skillUrn: entityUrn,
              $type: "com.linkedin.voyager.dash.identity.profile.ProfileSkill",
              title: {
                text: `Skill ${String(index + 1).padStart(3, "0")}`
              }
            }))
          ]
        }
      ],
      url: "https://www.linkedin.com/in/alex-rivera-fixture/"
    });

    expect(profile.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      "linkedin-voyager.skills.partial"
    );
  });

  it("keeps the richest endorsement count when duplicate skills merge", () => {
    const profile = extractProfileFromVoyagerPayload(voyagerDashProfilePayload, {
      now: fixedNow,
      source: "linkedin-voyager.network.dashProfile",
      supplementalPayloads: [
        {
          data: {
            "*elements": [
              "urn:li:fs_skill:(alex-rivera,typescript-visible)",
              "urn:li:fs_skill:(alex-rivera,typescript-detail)"
            ]
          },
          included: [
            {
              entityUrn: "urn:li:fs_skill:(alex-rivera,typescript-visible)",
              $type: "com.linkedin.voyager.identity.profile.Skill",
              endorsementCount: 1,
              name: "TypeScript"
            },
            {
              entityUrn: "urn:li:fs_skill:(alex-rivera,typescript-detail)",
              $type: "com.linkedin.voyager.identity.profile.Skill",
              endorsementCount: 12,
              name: "TypeScript"
            }
          ]
        }
      ],
      url: "https://www.linkedin.com/in/alex-rivera-fixture/"
    });

    expect(profile.skills.find((skill) => skill.name === "TypeScript")?.endorsements).toBe(12);
  });

  it("deduplicates provider-partial supplemental course records", () => {
    const profile = extractProfileFromVoyagerPayload(voyagerDashProfilePayload, {
      now: fixedNow,
      source: "linkedin-voyager.network.dashProfile",
      supplementalPayloads: [
        {
          data: {
            "*elements": [
              "urn:li:fs_course:(alex-rivera,automation-provider)",
              "urn:li:fs_course:(alex-rivera,automation-missing-provider)"
            ]
          },
          included: [
            {
              entityUrn: "urn:li:fs_course:(alex-rivera,automation-provider)",
              $type: "com.linkedin.voyager.identity.profile.Course",
              name: "Accessible Automation Systems",
              number: "AUT-201",
              providerName: "Example University"
            },
            {
              entityUrn: "urn:li:fs_course:(alex-rivera,automation-missing-provider)",
              $type: "com.linkedin.voyager.identity.profile.Course",
              name: "Accessible Automation Systems",
              number: "AUT-201"
            }
          ]
        }
      ],
      url: "https://www.linkedin.com/in/alex-rivera-fixture/"
    });

    expect(profile.courses).toHaveLength(1);
    expect(profile.courses[0]).toMatchObject({
      name: "AUT-201 - Accessible Automation Systems",
      number: "AUT-201",
      provider: "Example University"
    });
    expect(
      profile.diagnostics.some(
        (diagnostic) => diagnostic.code === "linkedin-voyager.courses.deduplicated"
      )
    ).toBe(true);
  });

  it("extracts observed GraphQL Dash Voyager profile payloads", () => {
    const profile = extractProfileFromVoyagerPayload(voyagerDashGraphqlProfilePayload, {
      now: "2026-05-25T12:00:00.000Z",
      source: "linkedin-voyager.network.identityDashProfiles",
      url: "https://www.linkedin.com/in/alex-rivera-fixture/"
    });
    expect(profile.identity.name).toBe("Alex Rivera");
    expect(profile.work[0]).toMatchObject({
      title: "Director of Engineering",
      company: "Northstar Labs"
    });
    expect(profile.education[0]?.school).toBe("Example University");
    expect(profile.skills.map((skill) => skill.name)).toEqual(["TypeScript"]);
    expect(profile.courses[0]?.name).toBe("AUT-201 - Accessible Automation Systems");
    expect(profile.featured[0]?.title).toBe("Privacy-first extension demo");
    expect(profile.testScores[0]?.name).toBe("GRE Quantitative Reasoning");
    expect(profile.patents[0]?.title).toBe("Local Browser Export Workflow");
  });

  it("prefers the URL-matching Voyager profile identity when unrelated identities are present", () => {
    const profile = extractProfileFromVoyagerPayload(
      {
        ...voyagerDashGraphqlProfilePayload,
        included: [
          {
            entityUrn: "urn:li:fsd_profile:unrelated-profile",
            $type: "com.linkedin.voyager.dash.identity.profile.Profile",
            firstName: "Wrong",
            lastName: "Person",
            publicIdentifier: "unrelated-profile"
          },
          ...voyagerDashGraphqlProfilePayload.included
        ]
      },
      {
        now: fixedNow,
        source: "linkedin-voyager.network.identityDashProfiles",
        url: "https://www.linkedin.com/in/alex-rivera-fixture/"
      }
    );

    expect(profile.identity).toMatchObject({
      name: "Alex Rivera",
      memberUrn: "urn:li:fsd_profile:alex-rivera-fixture"
    });
  });

  it("includes raw Voyager inventory only for verbose diagnostics", () => {
    expect(shouldIncludeVerboseDiagnostics({ diagnostics: { includeAllFields: true } })).toBe(
      false
    );
    expect(shouldIncludeVerboseDiagnostics({ diagnostics: { verbose: true } })).toBe(true);

    const quiet = extractProfileFromVoyagerPayload(voyagerDashGraphqlProfilePayload, {
      now: "2026-05-25T12:00:00.000Z",
      source: "linkedin-voyager.network.identityDashProfiles",
      url: "https://www.linkedin.com/in/alex-rivera-fixture/"
    });
    expect(
      quiet.diagnostics.some((diagnostic) =>
        diagnostic.code.startsWith("linkedin-voyager.inventory.")
      )
    ).toBe(false);
    const fullFields = applyProfileSettings(quiet, {
      diagnostics: { includeAllFields: true }
    });
    expect(
      fullFields.diagnostics.some((diagnostic) => diagnostic.code === "linkedin-voyager.parsed")
    ).toBe(true);
    expect(
      fullFields.diagnostics.some((diagnostic) =>
        diagnostic.code.startsWith("linkedin-voyager.inventory.")
      )
    ).toBe(false);

    const verbosePayload = {
      ...voyagerDashGraphqlProfilePayload,
      included: [
        ...voyagerDashGraphqlProfilePayload.included,
        {
          entityUrn: "urn:li:collection:unrelated",
          $type: "com.linkedin.restli.common.CollectionResponse",
          "*elements": []
        }
      ]
    };
    const verbose = extractProfileFromVoyagerPayload(verbosePayload, {
      now: "2026-05-25T12:00:00.000Z",
      source: "linkedin-voyager.network.identityDashProfiles",
      url: "https://www.linkedin.com/in/alex-rivera-fixture/",
      verboseDiagnostics: true
    });
    const sections = verbose.diagnostics.find(
      (diagnostic) => diagnostic.code === "linkedin-voyager.inventory.sections"
    );
    const toc = verbose.diagnostics.find(
      (diagnostic) => diagnostic.code === "linkedin-voyager.inventory.toc"
    );
    const entities = verbose.diagnostics.find(
      (diagnostic) => diagnostic.code === "linkedin-voyager.inventory.entities"
    );
    const fields = verbose.diagnostics.find(
      (diagnostic) => diagnostic.code === "linkedin-voyager.inventory.fields"
    );
    expect(sections?.message).toContain('"workPositionGroups":1');
    expect(sections?.message).toContain('"courses":1');
    expect(sections?.message).toContain('"featured":1');
    expect(sections?.message).toContain('"testScores":1');
    expect(sections?.message).toContain('"patents":1');
    expect(toc?.message).toContain('"identityDashProfilesByMemberIdentity":1');
    expect(entities?.message).toContain(
      "com.linkedin.voyager.dash.deco.identity.profile.FullProfileCourse"
    );
    expect(entities?.message).toContain(
      "com.linkedin.voyager.dash.deco.identity.profile.FullProfileTestScore"
    );
    expect(fields?.message).toContain("com.linkedin.voyager.dash.identity.profile.PositionGroup");
    expect(fields?.message).toContain("*profilePositionInPositionGroup");

    const includeAllFieldsOnly = applyProfileSettings(verbose, {
      diagnostics: { includeAllFields: true }
    });
    expect(
      includeAllFieldsOnly.diagnostics.some((diagnostic) =>
        diagnostic.code.startsWith("linkedin-voyager.inventory.")
      )
    ).toBe(false);
    const verboseFiltered = applyProfileSettings(verbose, {
      diagnostics: { includeAllFields: true, verbose: true }
    });
    expect(
      verboseFiltered.diagnostics.some((diagnostic) =>
        diagnostic.code.startsWith("linkedin-voyager.inventory.")
      )
    ).toBe(true);
  });

  it("applies data scope and diagnostic settings without dropping required identity", () => {
    const profile = extractProfileFromHtml(denseProfileHtml, {
      now: fixedNow,
      settings: fullMetadataSettings
    });
    const filtered = applyProfileSettings(profile, {
      dataScope: {
        ...defaultSettings.dataScope,
        identity: false,
        experience: false,
        extendedSections: false,
        imageryMetadata: false
      },
      diagnostics: {
        ...defaultSettings.diagnostics,
        includeConfidence: false,
        includeProvenance: false,
        verbose: false
      }
    });
    expect(filtered.identity).toMatchObject({
      name: "Alex Rivera",
      profileUrl: "https://www.linkedin.com/in/alex-rivera-fixture/"
    });
    expect(filtered.identity.headline).toBeUndefined();
    expect(filtered.identity.provenance).toBeUndefined();
    expect(filtered.work).toHaveLength(0);
    expect(filtered.projects).toHaveLength(0);
    expect(filtered.testScores).toHaveLength(0);
    expect(filtered.patents).toHaveLength(0);
  });
});

describe("exporters", () => {
  const profile = () => extractProfileFromHtml(denseProfileHtml, { now: fixedNow });
  const fullProfile = () =>
    extractProfileFromHtml(denseProfileHtml, {
      now: fixedNow,
      settings: fullMetadataSettings
    });

  it("exports every registered format", async () => {
    await Promise.all(
      EXPORT_FORMATS.map(async (format) => {
        const result = await exportProfile(profile(), format);
        expect(result.filename).toContain("alex-rivera");
        expect(result.contents).toBeTruthy();
      })
    );
  }, 30_000);

  it("uses sanitized filename templates with format placeholders", async () => {
    const result = await exportProfile(profile(), "markdown", {
      filenameTemplate: "{name}/{date}/{format}"
    });
    expect(result.filename).toBe("alex-rivera-2026-05-25-markdown.md");
  });

  it("exports parseable JSON, YAML, XML, Markdown, CSV, and XLSX", async () => {
    const canonicalJson = JSON.parse(exportCanonicalJson(profile()));
    expect(canonicalJson.identity.name).toBe("Alex Rivera");
    expect(canonicalJson).not.toHaveProperty("diagnostics");
    expect(canonicalJson.identity).not.toHaveProperty("provenance");
    expect(canonicalJson.identity).not.toHaveProperty("confidence");

    const fullCanonicalJson = JSON.parse(exportCanonicalJson(fullProfile()));
    expect(fullCanonicalJson.identity.provenance.sourceType).toBe("dom");
    expect(fullCanonicalJson.identity.confidence).toBe(0.92);
    expect(
      fullCanonicalJson.diagnostics.some(
        (diagnostic: { code: string }) => diagnostic.code === "client-state.parsed"
      )
    ).toBe(true);

    expect(exportJsonResume(profile())).toMatchObject({
      basics: { name: "Alex Rivera" },
      meta: {
        linkedinProfileExporter: {
          canonicalProfile: {
            licensesCertifications: [expect.objectContaining({ credentialId: "CERT-PRIVACY-1" })],
            featured: [expect.objectContaining({ type: "article" })]
          },
          testScores: [{ name: "GRE Quantitative Reasoning" }],
          patents: [{ title: "Local Browser Export Workflow" }]
        }
      }
    });
    expect(exportYamlResume(profile())).toContain("basics:");
    const csv = exportCsv(profile());
    expect(csv.split("\n")[0]).toBe("section,index,field,value,source,confidence");
    expect(csv).toContain("testScores");
    const markdown = exportMarkdown(profile());
    expect(markdown).toContain("---\nschema:");
    expect(markdown).toContain(`- ${profile().skills[0]?.name}`);
    expect(markdown).toContain("## Licenses Certifications");
    expect(markdown).toContain("Credential Id: CERT-PRIVACY-1");
    expect(markdown).toContain("Roles: Title: Engineering Manager");
    expect(markdown).not.toContain('{"title"');
    expect(markdown).toContain("## Projects");
    expect(markdown).toContain("Contributors: Alex Rivera, Taylor Morgan");
    expect(markdown).toContain("## Featured");
    expect(markdown).toContain("Type: article");
    expect(markdown).toContain("## Test Scores");
    expect(markdown).not.toContain("## Coverage Diagnostics");
    expect(new XMLParser().parse(exportXml(profile())).profile.schemaVersion).toBe(
      "linkedin-profile-exporter.profile.v1"
    );
    const workbook = await exportXlsx(profile());
    expect(workbook.byteLength).toBeGreaterThan(100);
  }, 30_000);

  it("includes compact Markdown coverage diagnostics only when diagnostics are retained", () => {
    const source = fullProfile();
    const withCoverage = {
      ...source,
      diagnostics: [
        ...source.diagnostics,
        {
          code: "coverage.skills.capped",
          level: "warning" as const,
          message: "Skill recovery saw private detail text that must not be exported.",
          source: "linkedin-voyager"
        },
        {
          code: "coverage.skills.recovered",
          level: "info" as const,
          message: "Skill recovery found some detail rows.",
          source: "linkedin-voyager"
        },
        {
          code: "coverage.skills.complete",
          level: "info" as const,
          message: "Skill recovery reached the advertised total.",
          source: "linkedin-voyager"
        },
        {
          code: "coverage.courses.recovered",
          level: "info" as const,
          message: "Course recovery found exactly the default detail page size.",
          source: "linkedin-voyager"
        },
        {
          code: "coverage.work.unavailable",
          level: "warning" as const,
          message: "Work detail fetch failed after work data was already extracted.",
          source: "linkedin-voyager"
        },
        {
          code: "coverage.private-client-name.unavailable",
          level: "warning" as const,
          message: "Untrusted diagnostic labels must not be exported.",
          source: "linkedin-voyager"
        }
      ]
    };

    const cleanMarkdown = exportMarkdown(applyProfileSettings(withCoverage, defaultSettings));
    expect(cleanMarkdown).not.toContain("## Coverage Diagnostics");

    const diagnosticMarkdown = exportMarkdown(
      applyProfileSettings(withCoverage, { diagnostics: { includeAllFields: true } })
    );
    expect(diagnosticMarkdown).toContain("## Coverage Diagnostics");
    expect(diagnosticMarkdown).not.toContain("Skills: recovered");
    expect(diagnosticMarkdown).not.toContain("Skills: capped");
    expect(diagnosticMarkdown).toContain("- Courses: recovered (1)");
    expect(diagnosticMarkdown).not.toContain("Work: unavailable");
    expect(diagnosticMarkdown).not.toContain("Private-client-name");
    expect(diagnosticMarkdown).not.toContain("private detail text");
  });

  it("keeps readable sentence spacing in text exports", () => {
    const exportedProfile = extractProfileFromHtml(
      denseProfileHtml.replace(
        "I build local-first tools that turn messy browser workflows into structured, reviewable data.",
        "Fast extraction.I\u2019ve shipped exports. Costs fell 90%.I\u2019ve kept accuracy high."
      ),
      { now: fixedNow }
    );

    for (const contents of [
      exportCanonicalJson(exportedProfile),
      exportXml(exportedProfile),
      exportMarkdown(exportedProfile)
    ]) {
      expect(contents).not.toContain("Fast extraction.I");
      expect(contents).not.toContain("90%.I");
      expect(contents).toContain("90%. I");
    }
  });
});
