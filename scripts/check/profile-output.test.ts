import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { profileFromFile, profileFromXml, profileOutputFromFile } from "./profile-output";

const syntheticXml = `<?xml version="1.0"?>
<profile>
  <schemaVersion>linkedin-profile-exporter.profile.v1</schemaVersion>
  <identity>
    <name>Fixture Person</name>
    <profileUrl>https://www.linkedin.com/in/fixture-person/</profileUrl>
    <confidence>0.92</confidence>
  </identity>
  <skills>
    <name>TypeScript</name>
    <endorsements>12</endorsements>
  </skills>
  <skills>
    <name>Browser Extensions</name>
  </skills>
  <testScores>
    <name>GRE Quantitative Reasoning</name>
    <score>170</score>
  </testScores>
  <metadata>
    <capturedAt>2026-05-25T12:00:00.000Z</capturedAt>
    <sourceUrl>https://www.linkedin.com/in/fixture-person/</sourceUrl>
    <generator>linkedin-profile-exporter</generator>
  </metadata>
  <exportMetadata>
    <formats>json</formats>
    <formats>xml</formats>
    <filenameTemplate>{name}-{date}</filenameTemplate>
  </exportMetadata>
</profile>`;

describe("profile output checker XML support", () => {
  it("validates XML with repeated sections, defaults, and schema-aware scalar coercion", () => {
    const profile = profileFromXml(syntheticXml);
    expect(profile).toMatchObject({
      identity: {
        confidence: 0.92,
        name: "Fixture Person"
      },
      skills: [{ endorsements: 12, name: "TypeScript" }, { name: "Browser Extensions" }],
      testScores: [{ name: "GRE Quantitative Reasoning", score: "170" }],
      work: [],
      diagnostics: [],
      exportMetadata: {
        formats: ["json", "xml"]
      }
    });
  });

  it("accepts XML file paths without exposing profile content in failures", () => {
    const directory = mkdtempSync(join(tmpdir(), "linkedin-profile-output-"));
    const xmlPath = join(directory, "profile.xml");
    try {
      writeFileSync(xmlPath, syntheticXml, "utf8");
      expect(profileFromFile(xmlPath).identity.name).toBe("Fixture Person");
    } finally {
      rmSync(directory, { force: true, recursive: true });
    }
  });

  it("accepts XML pasted attachment paths with a text suffix", () => {
    const directory = mkdtempSync(join(tmpdir(), "linkedin-profile-output-"));
    const textPath = join(directory, "pasted-text.txt");
    try {
      writeFileSync(textPath, syntheticXml, "utf8");
      expect(profileFromFile(textPath).skills).toHaveLength(2);
    } finally {
      rmSync(directory, { force: true, recursive: true });
    }
  });
});

const syntheticMarkdown = `---
schema: linkedin-profile-exporter.profile.v1
name: Fixture Person
sourceUrl: https://www.linkedin.com/in/fixture-person/
capturedAt: 2026-05-25T12:00:00.000Z
formats:
  - json
  - xml
  - markdown
---

# Fixture Person
Fixture headline

## Skills
${Array.from({ length: 20 }, (_, index) => `- Skill ${String(index + 1).padStart(3, "0")}`).join("\n")}

## Courses
${Array.from(
  { length: 20 },
  (_, index) =>
    `- Name: CRS-${String(index + 1).padStart(3, "0")} - Course ${String(index + 1).padStart(3, "0")}; Number: CRS-${String(index + 1).padStart(3, "0")}`
).join("\n")}

## Featured
${Array.from(
  { length: 20 },
  (_, index) =>
    `- Title: Featured ${String(index + 1).padStart(3, "0")}; Url: https://example.test/${index + 1}`
).join("\n")}

## Coverage Diagnostics
- Skills: capped (20)
- Recovery budget: exhausted
- Private Client Name: unavailable (1)
`;

describe("profile output checker Markdown support", () => {
  it("accepts Markdown pasted attachment paths as aggregate assurance inputs", () => {
    const directory = mkdtempSync(join(tmpdir(), "linkedin-profile-output-"));
    const textPath = join(directory, "pasted-text.txt");
    try {
      writeFileSync(textPath, syntheticMarkdown, "utf8");
      const output = profileOutputFromFile(textPath);
      expect(output).toMatchObject({
        kind: "markdown",
        summary: {
          coverageDiagnostics: ["skills:capped:20", "recovery-budget:exhausted"],
          duplicateCourseRows: 0,
          formats: ["json", "xml", "markdown"],
          schemaVersion: "linkedin-profile-exporter.profile.v1",
          sectionCounts: {
            courses: 20,
            featured: 20,
            skills: 20
          },
          warnings: [
            "courses-count-is-default-page-size",
            "featured-count-is-default-page-size",
            "skills-count-is-default-page-size"
          ]
        }
      });
    } finally {
      rmSync(directory, { force: true, recursive: true });
    }
  });

  it("does not warn on default page-size counts when Markdown coverage is complete", () => {
    const directory = mkdtempSync(join(tmpdir(), "linkedin-profile-output-"));
    const textPath = join(directory, "pasted-complete-text.txt");
    try {
      writeFileSync(
        textPath,
        syntheticMarkdown.replace("- Skills: capped (20)", "- Skills: complete (20)"),
        "utf8"
      );
      const output = profileOutputFromFile(textPath);
      expect(output).toMatchObject({
        kind: "markdown",
        summary: {
          coverageDiagnostics: ["skills:complete:20", "recovery-budget:exhausted"],
          warnings: ["courses-count-is-default-page-size", "featured-count-is-default-page-size"]
        }
      });
    } finally {
      rmSync(directory, { force: true, recursive: true });
    }
  });

  it("treats legacy comma-line skills as estimated and warns conservatively", () => {
    const directory = mkdtempSync(join(tmpdir(), "linkedin-profile-output-"));
    const textPath = join(directory, "legacy-comma-skills.txt");
    try {
      const legacySkills = [
        "Strategy, Planning",
        ...Array.from(
          { length: 19 },
          (_, index) => `Legacy Skill ${String(index + 1).padStart(3, "0")}`
        )
      ].join(", ");
      writeFileSync(
        textPath,
        syntheticMarkdown.replace(
          Array.from(
            { length: 20 },
            (_, index) => `- Skill ${String(index + 1).padStart(3, "0")}`
          ).join("\n"),
          legacySkills
        ),
        "utf8"
      );
      const output = profileOutputFromFile(textPath);
      expect(output).toMatchObject({
        kind: "markdown",
        summary: {
          sectionCounts: {
            skills: 21
          },
          warnings: expect.arrayContaining(["skills-count-may-be-default-page-size"])
        }
      });
    } finally {
      rmSync(directory, { force: true, recursive: true });
    }
  });

  it("does not count empty skills fallback text or echo untrusted coverage labels", () => {
    const directory = mkdtempSync(join(tmpdir(), "linkedin-profile-output-"));
    const textPath = join(directory, "empty-skills.txt");
    try {
      writeFileSync(
        textPath,
        `---
schema: linkedin-profile-exporter.profile.v1
sourceUrl: https://www.linkedin.com/in/fixture-person/
formats:
  - markdown
---

# Fixture Person

## Skills
No accessible skills captured.

## Coverage Diagnostics
- Private Client Name: unavailable (1)
- Skills: capped (0)
`,
        "utf8"
      );
      const output = profileOutputFromFile(textPath);
      expect(output).toMatchObject({
        kind: "markdown",
        summary: {
          coverageDiagnostics: ["skills:capped:0"],
          sectionCounts: {
            skills: 0
          }
        }
      });
    } finally {
      rmSync(directory, { force: true, recursive: true });
    }
  });
});
