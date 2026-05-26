import {
  SCHEMA_VERSION,
  type Diagnostic,
  type Profile,
  type Provenance,
  profileSchema
} from "./schema";

export interface VoyagerExtractionOptions {
  now?: string;
  source?: string;
  supplementalPayloads?: unknown[];
  url?: string;
}

type JsonRecord = Record<string, unknown>;

const PROFILE_KEYS = ["*profile"];
const PROFILE_TYPES = ["com.linkedin.voyager.identity.profile.Profile", "com.linkedin.voyager.dash.identity.profile.Profile"];
const EDUCATION_KEYS = ["*educationView", "*profileEducations"];
const EDUCATION_TYPES = ["com.linkedin.voyager.identity.profile.Education", "com.linkedin.voyager.dash.identity.profile.Education"];
const POSITION_KEYS = ["*positionView", "*profilePositions"];
const POSITION_TYPES = ["com.linkedin.voyager.identity.profile.Position", "com.linkedin.voyager.dash.identity.profile.Position"];
const SKILL_KEYS = ["*skillView", "*profileSkills"];
const SKILL_TYPES = ["com.linkedin.voyager.identity.profile.Skill", "com.linkedin.voyager.dash.identity.profile.Skill"];
const CERTIFICATION_KEYS = ["*certificationView", "*profileCertifications"];
const CERTIFICATION_TYPES = ["com.linkedin.voyager.dash.identity.profile.Certification", "com.linkedin.voyager.identity.profile.Certification"];
const PROJECT_KEYS = ["*projectView", "*profileProjects"];
const PROJECT_TYPES = ["com.linkedin.voyager.identity.profile.Project", "com.linkedin.voyager.dash.identity.profile.Project"];
const VOLUNTEER_KEYS = ["*volunteerExperienceView", "*profileVolunteerExperiences"];
const VOLUNTEER_TYPES = ["com.linkedin.voyager.dash.identity.profile.VolunteerExperience"];
const HONOR_KEYS = ["*honorView", "*profileHonors"];
const HONOR_TYPES = ["com.linkedin.voyager.identity.profile.Honor", "com.linkedin.voyager.dash.identity.profile.Honor"];
const PUBLICATION_KEYS = ["*publicationView", "*profilePublications"];
const PUBLICATION_TYPES = ["com.linkedin.voyager.identity.profile.Publication", "com.linkedin.voyager.dash.identity.profile.Publication"];
const LANGUAGE_KEYS = ["*languageView", "*profileLanguages"];
const LANGUAGE_TYPES = ["com.linkedin.voyager.identity.profile.Language"];

export function extractProfileFromVoyagerPayload(payload: unknown, options: VoyagerExtractionOptions = {}): Profile {
  const now = options.now ?? new Date().toISOString();
  const sourceName = options.source ?? "linkedin-voyager";
  const dbs = [payload, ...(options.supplementalPayloads ?? [])].map(buildVoyagerDb).filter((db) => db.entities.length || Object.keys(db.tableOfContents).length);
  const primaryDb = dbs[0];
  if (!primaryDb) throw new Error("LinkedIn profile API response did not contain normalized profile data.");

  const diagnostics: Diagnostic[] = [
    {
      code: "linkedin-voyager.parsed",
      level: "info",
      message: "LinkedIn internal profile JSON was parsed.",
      source: sourceName
    }
  ];
  const provenance = (section: string): Provenance => ({
    sourceType: "client-state",
    source: `${sourceName}.${section}`,
    capturedAt: now
  });

  const profileEntity = firstValue(dbs, PROFILE_KEYS, PROFILE_TYPES) ?? primaryDb.data;
  const profileId = stringValue(profileEntity.publicIdentifier) ?? profileIdFromUrl(options.url);
  const profileUrl = options.url ?? (profileId ? `https://www.linkedin.com/in/${profileId}/` : undefined);

  const work = uniqueBy(
    valuesFrom(dbs, POSITION_KEYS, POSITION_TYPES).map((position) => {
      const db = dbForEntity(dbs, position) ?? primaryDb;
      return {
        title: stringValue(position.title) ?? "Role",
        company: stringValue(position.companyName) ?? linkedName(db, position.companyUrn) ?? linkedName(db, position["*company"]),
        location: stringValue(position.locationName),
        dates: dateRange(position),
        description: stringValue(position.description),
        roles: [],
        provenance: provenance("work"),
        confidence: 0.92
      };
    }),
    (item) => `${item.title}|${item.company ?? ""}|${item.dates ?? ""}`
  );

  const education = uniqueBy(
    valuesFrom(dbs, EDUCATION_KEYS, EDUCATION_TYPES).map((education) => {
      const db = dbForEntity(dbs, education) ?? primaryDb;
      return {
        school: stringValue(education.schoolName) ?? linkedName(db, education.schoolUrn) ?? linkedName(db, education["*school"]) ?? "School",
        degree: stringValue(education.degreeName),
        field: stringValue(education.fieldOfStudy),
        dates: dateRange(education),
        description: stringValue(education.description),
        activities: stringValue(education.activities),
        provenance: provenance("education"),
        confidence: 0.92
      };
    }),
    (item) => `${item.school}|${item.degree ?? ""}|${item.field ?? ""}|${item.dates ?? ""}`
  );

  const skills = uniqueBy(
    valuesFrom(dbs, SKILL_KEYS, SKILL_TYPES)
      .map((skill) => stringValue(skill.name))
      .filter(isPresent)
      .map((name) => ({ name, provenance: provenance("skills"), confidence: 0.9 })),
    (skill) => skill.name.toLowerCase()
  );

  const recommendations = valuesFrom(dbs, ["*recommendationView", "*profileRecommendations"], ["com.linkedin.voyager.identity.profile.Recommendation"])
    .filter((recommendation) => stringValue(recommendation.recommendationText))
    .map((recommendation) => {
      const db = dbForEntity(dbs, recommendation) ?? primaryDb;
      const recommender = objectRecord(db.getElementByUrn(stringValue(recommendation["*recommender"]))) ?? {};
      return {
        name: [stringValue(recommender.firstName), stringValue(recommender.lastName)].filter(isPresent).join(" ") || "LinkedIn recommendation",
        relationship: stringValue(recommendation.recommendationContext),
        text: stringValue(recommendation.recommendationText)!,
        provenance: provenance("recommendations"),
        confidence: 0.85
      };
    });

  const profile = profileSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    identity: {
      name: [stringValue(profileEntity.firstName), stringValue(profileEntity.lastName)].filter(isPresent).join(" ") || "Unknown LinkedIn Profile",
      headline: stringValue(profileEntity.headline),
      location: stringValue(profileEntity.locationName) ?? stringValue(profileEntity.address),
      profileUrl: profileUrl ?? "https://www.linkedin.com/in/unknown/",
      about: stringValue(profileEntity.summary),
      links: [],
      provenance: provenance("identity"),
      confidence: 0.95
    },
    work,
    education,
    skills,
    licensesCertifications: valuesFrom(dbs, CERTIFICATION_KEYS, CERTIFICATION_TYPES).map((certification) => ({
      name: stringValue(certification.name) ?? "Certification",
      issuer: stringValue(certification.authority) ?? stringValue(certification.companyName),
      date: dateRange(certification),
      credentialUrl: urlValue(certification.url),
      provenance: provenance("licensesCertifications"),
      confidence: 0.88
    })),
    projects: valuesFrom(dbs, PROJECT_KEYS, PROJECT_TYPES).map((project) => ({
      name: stringValue(project.title) ?? stringValue(project.name) ?? "Project",
      description: stringValue(project.description),
      url: urlValue(project.url),
      dates: dateRange(project),
      provenance: provenance("projects"),
      confidence: 0.88
    })),
    publications: valuesFrom(dbs, PUBLICATION_KEYS, PUBLICATION_TYPES).map((publication) => ({
      name: stringValue(publication.name) ?? "Publication",
      publisher: stringValue(publication.publisher),
      date: dateValue(publication.date) ?? dateValue(publication.publishedOn),
      url: urlValue(publication.url),
      provenance: provenance("publications"),
      confidence: 0.88
    })),
    volunteering: valuesFrom(dbs, VOLUNTEER_KEYS, VOLUNTEER_TYPES).map((volunteering) => ({
      role: stringValue(volunteering.role),
      organization: stringValue(volunteering.companyName) ?? "Volunteer organization",
      description: stringValue(volunteering.description),
      dates: dateRange(volunteering),
      provenance: provenance("volunteering"),
      confidence: 0.88
    })),
    honorsAwards: valuesFrom(dbs, HONOR_KEYS, HONOR_TYPES).map((honor) => ({
      title: stringValue(honor.title) ?? "Honor",
      issuer: stringValue(honor.issuer),
      date: dateValue(honor.issueDate) ?? dateValue(honor.issuedOn),
      description: stringValue(honor.description),
      provenance: provenance("honorsAwards"),
      confidence: 0.88
    })),
    languages: valuesFrom(dbs, LANGUAGE_KEYS, LANGUAGE_TYPES).map((language) => ({
      language: stringValue(language.name) ?? "Language",
      fluency: languageFluency(stringValue(language.proficiency)),
      provenance: provenance("languages"),
      confidence: 0.85
    })),
    courses: [],
    recommendations,
    featured: [],
    organizations: [],
    interests: [],
    metadata: {
      capturedAt: now,
      sourceUrl: profileUrl ?? options.url ?? "https://www.linkedin.com/in/unknown/",
      locale: localeLabel(profileEntity),
      generator: "linkedin-profile-exporter"
    },
    diagnostics,
    exportMetadata: { formats: ["json", "markdown"], filenameTemplate: "{name}-{date}-{format}" }
  });

  if (!profile.work.length) diagnostics.push(emptySectionDiagnostic("work", sourceName));
  if (!profile.education.length) diagnostics.push(emptySectionDiagnostic("education", sourceName));
  if (!profile.skills.length) diagnostics.push(emptySectionDiagnostic("skills", sourceName));
  return profileSchema.parse({ ...profile, diagnostics });
}

function buildVoyagerDb(payload: unknown) {
  const root = objectRecord(payload) ?? {};
  const data = objectRecord(root.data) ?? {};
  const included = Array.isArray(root.included)
    ? root.included.flatMap((item) => {
        const record = objectRecord(item);
        return record ? [record] : [];
      })
    : [];
  const entitiesByUrn: Record<string, JsonRecord> = {};
  for (const entity of included) {
    const entityUrn = stringValue(entity.entityUrn) ?? stringValue(entity.key);
    if (entityUrn) entitiesByUrn[entityUrn] = entity;
  }
  return {
    data,
    entities: included,
    entitiesByUrn,
    tableOfContents: data,
    getElementByUrn(urn: string | undefined) {
      return urn ? entitiesByUrn[urn] : undefined;
    },
    getElementsByType(types: string | string[]) {
      const expected = Array.isArray(types) ? types : [types];
      return included.filter((entity) => expected.includes(stringValue(entity.$type) ?? ""));
    },
    getValuesByKey(keys: string | string[]) {
      return keysArray(keys).flatMap((key) => valuesForKey(data[key], entitiesByUrn));
    }
  };
}

type VoyagerDb = ReturnType<typeof buildVoyagerDb>;

function valuesFrom(dbs: VoyagerDb[], keys: string[], types: string[]): JsonRecord[] {
  return uniqueBy(
    dbs.flatMap((db) => [...db.getValuesByKey(keys), ...db.getElementsByType(types)]),
    (entity) => stringValue(entity.entityUrn) ?? JSON.stringify(entity)
  );
}

function firstValue(dbs: VoyagerDb[], keys: string[], types: string[]): JsonRecord | undefined {
  return valuesFrom(dbs, keys, types)[0];
}

function dbForEntity(dbs: VoyagerDb[], entity: JsonRecord): VoyagerDb | undefined {
  const urn = stringValue(entity.entityUrn);
  return urn ? dbs.find((db) => db.entitiesByUrn[urn] === entity) : undefined;
}

function valuesForKey(value: unknown, entitiesByUrn: Record<string, JsonRecord>): JsonRecord[] {
  if (typeof value === "string") return entityOrCollection(entitiesByUrn[value], entitiesByUrn);
  if (Array.isArray(value)) return value.flatMap((item) => valuesForKey(item, entitiesByUrn));
  const record = objectRecord(value);
  if (!record) return [];
  const nested = record["*elements"] ?? record.elements;
  if (Array.isArray(nested)) return nested.flatMap((item) => valuesForKey(item, entitiesByUrn));
  return [record];
}

function entityOrCollection(entity: JsonRecord | undefined, entitiesByUrn: Record<string, JsonRecord>): JsonRecord[] {
  if (!entity) return [];
  const elements = entity["*elements"] ?? entity.elements;
  if (Array.isArray(elements)) return elements.flatMap((item) => valuesForKey(item, entitiesByUrn));
  return [entity];
}

function dateRange(entity: JsonRecord): string | undefined {
  const range = objectRecord(entity.timePeriod) ?? objectRecord(entity.dateRange);
  if (!range) return undefined;
  const start = dateValue(range.startDate) ?? dateValue(range.start);
  const end = dateValue(range.endDate) ?? dateValue(range.end);
  if (start && end) return `${start} - ${end}`;
  if (start) return `${start} - Present`;
  return end;
}

function dateValue(value: unknown): string | undefined {
  const record = objectRecord(value);
  const year = numberValue(record?.year);
  if (!year) return undefined;
  const month = numberValue(record?.month);
  const day = numberValue(record?.day);
  if (month && day) return `${year}-${pad(month)}-${pad(day)}`;
  if (month) return `${year}-${pad(month)}`;
  return String(year);
}

function stringValue(value: unknown): string | undefined {
  if (typeof value === "string") return clean(value);
  if (typeof value === "number") return String(value);
  const record = objectRecord(value);
  if (!record) return undefined;
  return (
    stringValue(record.text) ??
    stringValue(record.localized) ??
    stringValue(record.name) ??
    stringValue(Object.values(record).find((item) => typeof item === "string"))
  );
}

function urlValue(value: unknown): string | undefined {
  const candidate = stringValue(value);
  if (!candidate) return undefined;
  try {
    return new URL(candidate).toString();
  } catch {
    return undefined;
  }
}

function linkedName(db: VoyagerDb, urn: unknown): string | undefined {
  const entity = objectRecord(db.getElementByUrn(stringValue(urn)));
  return stringValue(entity?.name) ?? stringValue(entity?.universalName);
}

function localeLabel(profileEntity: JsonRecord): string | undefined {
  const locale = objectRecord(profileEntity.defaultLocale) ?? objectRecord(profileEntity.primaryLocale);
  const language = stringValue(locale?.language);
  const country = stringValue(locale?.country);
  return language && country ? `${language}_${country}` : language;
}

function languageFluency(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const label: Record<string, string> = {
    NATIVE_OR_BILINGUAL: "Native or bilingual",
    FULL_PROFESSIONAL: "Full professional",
    PROFESSIONAL_WORKING: "Professional working",
    LIMITED_WORKING: "Limited working",
    ELEMENTARY: "Elementary"
  };
  return label[value.toUpperCase()] ?? value;
}

function profileIdFromUrl(url: string | undefined): string | undefined {
  return url?.match(/linkedin\.com\/in\/([^/?#]+)/i)?.[1];
}

function emptySectionDiagnostic(section: string, sourceName: string): Diagnostic {
  return {
    code: `linkedin-voyager.${section}.empty`,
    level: "info",
    message: `LinkedIn internal profile JSON did not include ${section}.`,
    source: sourceName
  };
}

function keysArray(value: string | string[]): string[] {
  return Array.isArray(value) ? value : [value];
}

function objectRecord(value: unknown): JsonRecord | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function clean(value: string): string | undefined {
  const cleaned = value.replace(/\s+/g, " ").trim();
  return cleaned || undefined;
}

function pad(value: number): string {
  return value.toString().padStart(2, "0");
}

function isPresent<T>(value: T | undefined | null | ""): value is T {
  return Boolean(value);
}

function uniqueBy<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const marker = key(item);
    if (seen.has(marker)) return false;
    seen.add(marker);
    return true;
  });
}
