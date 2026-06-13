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
  verboseDiagnostics?: boolean;
}

type JsonRecord = Record<string, unknown>;
type WorkExperience = Profile["work"][number];
type NestedRole = WorkExperience["roles"][number];

const PROFILE_KEYS = ["*profile"];
const PROFILE_TYPES = [
  "com.linkedin.voyager.identity.profile.Profile",
  "com.linkedin.voyager.dash.identity.profile.Profile",
  "com.linkedin.voyager.dash.deco.identity.profile.FullProfileWithEntities"
];
const MINI_PROFILE_TYPES = [
  "com.linkedin.voyager.identity.shared.MiniProfile",
  "com.linkedin.voyager.dash.identity.profile.MiniProfile",
  "com.linkedin.voyager.dash.deco.identity.profile.MiniProfile"
];
const EDUCATION_KEYS = ["*educationView", "*profileEducations"];
const EDUCATION_TYPES = [
  "com.linkedin.voyager.identity.profile.Education",
  "com.linkedin.voyager.dash.identity.profile.Education",
  "com.linkedin.voyager.dash.deco.identity.profile.FullProfileEducation"
];
const COURSE_KEYS = ["*courseView", "*profileCourses"];
const COURSE_TYPES = [
  "com.linkedin.voyager.identity.profile.Course",
  "com.linkedin.voyager.dash.identity.profile.Course",
  "com.linkedin.voyager.dash.deco.identity.profile.FullProfileCourse"
];
const POSITION_KEYS = ["*positionView", "*profilePositions"];
const POSITION_TYPES = [
  "com.linkedin.voyager.identity.profile.Position",
  "com.linkedin.voyager.dash.identity.profile.Position",
  "com.linkedin.voyager.dash.deco.identity.profile.FullProfilePosition"
];
const POSITION_GROUP_KEYS = ["*positionGroupView", "*profilePositionGroups"];
const POSITION_GROUP_TYPES = [
  "com.linkedin.voyager.identity.profile.PositionGroupView",
  "com.linkedin.voyager.dash.identity.profile.PositionGroup",
  "com.linkedin.voyager.dash.deco.identity.profile.FullProfilePositionGroup",
  "com.linkedin.voyager.dash.deco.identity.profile.FullProfilePositionGroupsInjection"
];
const POSITION_IN_GROUP_KEYS = [
  "*profilePositionInPositionGroup",
  "profilePositionInPositionGroup",
  "*positions",
  "positions"
];
const SKILL_KEYS = ["*skillView", "*profileSkills"];
const SKILL_TYPES = [
  "com.linkedin.voyager.identity.profile.Skill",
  "com.linkedin.voyager.dash.identity.profile.Skill",
  "com.linkedin.voyager.dash.deco.identity.profile.FullProfileSkill"
];
const CERTIFICATION_KEYS = ["*certificationView", "*profileCertifications"];
const CERTIFICATION_TYPES = [
  "com.linkedin.voyager.dash.identity.profile.Certification",
  "com.linkedin.voyager.identity.profile.Certification",
  "com.linkedin.voyager.dash.deco.identity.profile.FullProfileCertification"
];
const PROJECT_KEYS = ["*projectView", "*profileProjects"];
const PROJECT_TYPES = [
  "com.linkedin.voyager.identity.profile.Project",
  "com.linkedin.voyager.dash.identity.profile.Project",
  "com.linkedin.voyager.dash.deco.identity.profile.FullProfileProject"
];
const FEATURED_KEYS = [
  "*summaryTreasuryMedias",
  "*profileTreasuryMediaPosition",
  "*profileTreasuryMediaItems",
  "*treasuryMediaItems",
  "*treasuryMedias"
];
const FEATURED_TYPES = [
  "com.linkedin.voyager.dash.identity.profile.treasury.TreasuryMedia",
  "com.linkedin.voyager.dash.identity.profile.treasury.TreasuryMediaItem",
  "com.linkedin.voyager.dash.deco.identity.profile.FullProfileTreasuryMediaItemsInjection",
  "com.linkedin.voyager.dash.deco.identity.profile.FullProfileTreasuryMedia"
];
const VOLUNTEER_KEYS = ["*volunteerExperienceView", "*profileVolunteerExperiences"];
const VOLUNTEER_TYPES = [
  "com.linkedin.voyager.dash.identity.profile.VolunteerExperience",
  "com.linkedin.voyager.dash.deco.identity.profile.FullProfileVolunteerExperience"
];
const HONOR_KEYS = ["*honorView", "*profileHonors"];
const HONOR_TYPES = [
  "com.linkedin.voyager.identity.profile.Honor",
  "com.linkedin.voyager.dash.identity.profile.Honor",
  "com.linkedin.voyager.dash.deco.identity.profile.FullProfileHonor"
];
const TEST_SCORE_KEYS = ["*testScoreView", "*profileTestScores"];
const TEST_SCORE_TYPES = [
  "com.linkedin.voyager.identity.profile.TestScore",
  "com.linkedin.voyager.dash.identity.profile.TestScore",
  "com.linkedin.voyager.dash.deco.identity.profile.FullProfileTestScore"
];
const PATENT_KEYS = ["*patentView", "*profilePatents"];
const PATENT_TYPES = [
  "com.linkedin.voyager.identity.profile.Patent",
  "com.linkedin.voyager.dash.identity.profile.Patent",
  "com.linkedin.voyager.dash.deco.identity.profile.FullProfilePatent"
];
const PUBLICATION_KEYS = ["*publicationView", "*profilePublications"];
const PUBLICATION_TYPES = [
  "com.linkedin.voyager.identity.profile.Publication",
  "com.linkedin.voyager.dash.identity.profile.Publication",
  "com.linkedin.voyager.dash.deco.identity.profile.FullProfilePublication"
];
const LANGUAGE_KEYS = ["*languageView", "*profileLanguages"];
const LANGUAGE_TYPES = [
  "com.linkedin.voyager.identity.profile.Language",
  "com.linkedin.voyager.dash.identity.profile.Language",
  "com.linkedin.voyager.dash.deco.identity.profile.FullProfileLanguage"
];
const ORGANIZATION_KEYS = ["*organizationView", "*profileOrganizations"];
const ORGANIZATION_TYPES = [
  "com.linkedin.voyager.identity.profile.Organization",
  "com.linkedin.voyager.dash.identity.profile.Organization",
  "com.linkedin.voyager.dash.deco.identity.profile.FullProfileOrganization"
];
const INTEREST_KEYS = ["*interestView", "*profileInterests"];
const INTEREST_TYPES = [
  "com.linkedin.voyager.identity.profile.Interest",
  "com.linkedin.voyager.dash.identity.profile.Interest",
  "com.linkedin.voyager.dash.deco.identity.profile.FullProfileInterest"
];

export function extractProfileFromVoyagerPayload(
  payload: unknown,
  options: VoyagerExtractionOptions = {}
): Profile {
  const now = options.now ?? new Date().toISOString();
  const sourceName = options.source ?? "linkedin-voyager";
  const dbs = [payload, ...(options.supplementalPayloads ?? [])]
    .map(buildVoyagerDb)
    .filter((db) => db.entities.length || Object.keys(db.tableOfContents).length);
  const primaryDb = dbs[0];
  if (!primaryDb)
    throw new Error("LinkedIn profile API response did not contain normalized profile data.");

  const diagnostics: Diagnostic[] = [
    {
      code: "linkedin-voyager.parsed",
      level: "info",
      message: "LinkedIn internal profile JSON was parsed.",
      source: sourceName
    }
  ];
  if (options.verboseDiagnostics) {
    diagnostics.push(...voyagerInventoryDiagnostics(dbs, sourceName));
  }
  const provenance = (section: string): Provenance => ({
    sourceType: "client-state",
    source: `${sourceName}.${section}`,
    capturedAt: now
  });

  const urlProfileId = profileIdFromUrl(options.url);
  const profileEntity =
    preferredProfileEntity(dbs, urlProfileId) ??
    firstValue(dbs, PROFILE_KEYS, PROFILE_TYPES) ??
    primaryDb.data;
  const profileId = profileIdFromEntity(profileEntity) ?? urlProfileId;
  const profileMini = miniProfileForProfile(dbs, profileEntity, profileId);
  const profileUrl =
    options.url ?? (profileId ? `https://www.linkedin.com/in/${profileId}/` : undefined);
  const profileName =
    [stringValue(profileEntity.firstName), stringValue(profileEntity.lastName)]
      .filter(isPresent)
      .join(" ") ||
    stringValue(profileEntity.fullName) ||
    stringValue(profileEntity.name) ||
    "Unknown LinkedIn Profile";

  const groupedPositions = groupedPositionEntities(dbs);
  const groupedPositionKeys = new Set(
    groupedPositions.flatMap(({ positions }) => positions.map(positionEntityKey).filter(isPresent))
  );
  const groupedWork = groupedPositions
    .map(({ db, group, positions }) =>
      workFromPositionGroup(group, positions, db, provenance("work"))
    )
    .filter(isPresent);
  const standaloneWork = valuesFrom(dbs, POSITION_KEYS, POSITION_TYPES)
    .filter((position) => {
      const key = positionEntityKey(position);
      return !key || !groupedPositionKeys.has(key);
    })
    .map((position) =>
      workFromPosition(position, dbForEntity(dbs, position) ?? primaryDb, provenance("work"))
    );
  const work = uniqueBy(
    [...groupedWork, ...standaloneWork],
    (item) => `${item.title}|${item.company ?? ""}|${item.dates ?? ""}`
  );

  const education = uniqueBy(
    valuesFrom(dbs, EDUCATION_KEYS, EDUCATION_TYPES).map((education) => {
      const db = dbForEntity(dbs, education) ?? primaryDb;
      const schoolEntity = linkedEntity(
        db,
        education.schoolUrn,
        education["*school"],
        education.school,
        education["*miniSchool"]
      );
      return {
        school:
          stringValue(education.schoolName) ??
          stringValue(education.multiLocaleSchoolName) ??
          linkedName(db, education.schoolUrn) ??
          linkedName(db, education["*school"]) ??
          "School",
        degree:
          stringValue(education.degreeName) ??
          stringValue(education.multiLocaleDegreeName) ??
          linkedName(db, education.standardizedDegreeUrn) ??
          linkedName(db, education["*standardizedDegree"]),
        field:
          stringValue(education.fieldOfStudy) ?? stringValue(education.multiLocaleFieldOfStudy),
        dates: dateRange(education),
        description:
          stringValue(education.description) ?? stringValue(education.multiLocaleDescription),
        activities:
          stringValue(education.activities) ?? stringValue(education.multiLocaleActivities),
        schoolUrl: linkedUrl(schoolEntity, "school"),
        schoolLogoUrl: imageUrlFromEntity(schoolEntity),
        provenance: provenance("education"),
        confidence: 0.92
      };
    }),
    (item) => `${item.school}|${item.degree ?? ""}|${item.field ?? ""}|${item.dates ?? ""}`
  );

  const skills = uniqueBy(
    valuesFrom(dbs, SKILL_KEYS, SKILL_TYPES)
      .map((skill) => {
        const name = stringValue(skill.name) ?? stringValue(skill.multiLocaleName);
        if (!name) return null;
        return {
          name,
          endorsements: numberValue(skill.endorsementCount ?? skill.endorsementsCount),
          provenance: provenance("skills"),
          confidence: 0.9
        };
      })
      .filter(isPresent),
    (skill) => skill.name.toLowerCase()
  );

  const recommendations = valuesFrom(
    dbs,
    ["*recommendationView", "*profileRecommendations"],
    [
      "com.linkedin.voyager.identity.profile.Recommendation",
      "com.linkedin.voyager.dash.identity.profile.Recommendation",
      "com.linkedin.voyager.dash.deco.identity.profile.FullProfileRecommendation"
    ]
  )
    .filter((recommendation) => recommendationText(recommendation))
    .map((recommendation) => {
      const db = dbForEntity(dbs, recommendation) ?? primaryDb;
      const inlineRecommender = objectRecord(recommendation.recommender);
      const recommender =
        inlineRecommender ??
        objectRecord(db.getElementByUrn(stringValue(recommendation["*recommender"]))) ??
        {};
      return {
        name:
          [stringValue(recommender.firstName), stringValue(recommender.lastName)]
            .filter(isPresent)
            .join(" ") || "LinkedIn recommendation",
        relationship: stringValue(recommendation.recommendationContext),
        text: recommendationText(recommendation)!,
        provenance: provenance("recommendations"),
        confidence: 0.85
      };
    });

  const courses = uniqueBy(
    valuesFrom(dbs, COURSE_KEYS, COURSE_TYPES)
      .map((course) => {
        const db = dbForEntity(dbs, course) ?? primaryDb;
        const name = courseName(course);
        if (!name) return null;
        return {
          name,
          number: courseNumber(course),
          provider: courseProvider(course, db),
          provenance: provenance("courses"),
          confidence: 0.85
        };
      })
      .filter(isPresent),
    (course) => `${course.name}|${course.provider ?? ""}`.toLowerCase()
  );

  const featured = uniqueBy(
    valuesFrom(dbs, FEATURED_KEYS, FEATURED_TYPES)
      .map((item) => featuredItemFromEntity(item, provenance("featured")))
      .filter(isPresent),
    (item) => `${item.title}|${item.url ?? ""}`.toLowerCase()
  );

  const organizations = uniqueBy(
    valuesFrom(dbs, ORGANIZATION_KEYS, ORGANIZATION_TYPES).map((organization) => {
      const db = dbForEntity(dbs, organization) ?? primaryDb;
      const organizationEntity = companyEntityForRecord(organization, db);
      return {
        name:
          stringValue(organization.name) ??
          stringValue(organization.organizationName) ??
          stringValue(organization.companyName) ??
          stringValue(organizationEntity?.name) ??
          linkedName(db, organization.companyUrn) ??
          linkedName(db, organization["*company"]) ??
          "Organization",
        role:
          stringValue(organization.role) ??
          stringValue(organization.position) ??
          stringValue(organization.title),
        dates: dateRange(organization),
        description: stringValue(organization.description),
        url: urlValue(organization.url) ?? linkedUrl(organizationEntity, "company"),
        logoUrl: imageUrlFromEntity(organizationEntity),
        provenance: provenance("organizations"),
        confidence: 0.85
      };
    }),
    (organization) => `${organization.name}|${organization.role ?? ""}`.toLowerCase()
  );

  const interests = uniqueBy(
    valuesFrom(dbs, INTEREST_KEYS, INTEREST_TYPES)
      .map((interest) => {
        const name =
          stringValue(interest.name) ??
          stringValue(interest.title) ??
          stringValue(interest.interestName);
        if (!name) return null;
        return {
          name,
          url: urlValue(interest.url) ?? urlValue(interest.navigationUrl),
          provenance: provenance("interests"),
          confidence: 0.8
        };
      })
      .filter(isPresent),
    (interest) => interest.name.toLowerCase()
  );

  const testScores = uniqueBy(
    valuesFrom(dbs, TEST_SCORE_KEYS, TEST_SCORE_TYPES)
      .map((testScore) => testScoreFromEntity(testScore, provenance("testScores")))
      .filter(isPresent),
    (testScore) =>
      `${testScore.name}|${testScore.score ?? ""}|${testScore.date ?? ""}`.toLowerCase()
  );

  const patents = uniqueBy(
    valuesFrom(dbs, PATENT_KEYS, PATENT_TYPES)
      .map((patent) => {
        const db = dbForEntity(dbs, patent) ?? primaryDb;
        return patentFromEntity(patent, db, provenance("patents"));
      })
      .filter(isPresent),
    (patent) =>
      `${patent.title}|${patent.patentNumber ?? ""}|${patent.applicationNumber ?? ""}`.toLowerCase()
  );

  const profile = profileSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    identity: {
      name: profileName,
      headline:
        stringValue(profileEntity.headline) ?? stringValue(profileEntity.multiLocaleHeadline),
      location:
        stringValue(profileEntity.locationName) ??
        stringValue(profileEntity.address) ??
        linkedGeoName(primaryDb, profileEntity),
      industry: industryNameForEntity(profileEntity, primaryDb),
      connections: socialCountLabel(profileEntity, "connection"),
      followers: socialCountLabel(profileEntity, "follower"),
      memberUrn: stringValue(profileEntity.entityUrn),
      profileUrl: profileUrl ?? "https://www.linkedin.com/in/unknown/",
      about: stringValue(profileEntity.summary) ?? stringValue(profileEntity.multiLocaleSummary),
      links: linksFromProfileEntity(profileEntity),
      imagery: identityImagery(profileEntity, profileMini),
      provenance: provenance("identity"),
      confidence: 0.95
    },
    work,
    education,
    skills,
    licensesCertifications: valuesFrom(dbs, CERTIFICATION_KEYS, CERTIFICATION_TYPES).map(
      (certification) => {
        const db = dbForEntity(dbs, certification) ?? primaryDb;
        const issuerEntity = companyEntityForRecord(certification, db);
        return {
          name: stringValue(certification.name) ?? "Certification",
          issuer: stringValue(certification.authority) ?? stringValue(certification.companyName),
          issuerUrl: linkedUrl(issuerEntity, "company"),
          issuerLogoUrl: imageUrlFromEntity(issuerEntity),
          date: dateRange(certification),
          credentialId:
            stringValue(certification.licenseNumber) ??
            stringValue(certification.credentialId) ??
            stringValue(certification.certificationId),
          credentialUrl: urlValue(certification.url),
          provenance: provenance("licensesCertifications"),
          confidence: 0.88
        };
      }
    ),
    projects: valuesFrom(dbs, PROJECT_KEYS, PROJECT_TYPES).map((project) => {
      const db = dbForEntity(dbs, project) ?? primaryDb;
      return {
        name: stringValue(project.title) ?? stringValue(project.name) ?? "Project",
        description: stringValue(project.description),
        url: urlValue(project.url),
        dates: dateRange(project),
        associatedWith: occupationLabel(project, db),
        contributors: personNames(
          project.contributors ?? project.members ?? project["*contributors"],
          db
        ),
        provenance: provenance("projects"),
        confidence: 0.88
      };
    }),
    publications: valuesFrom(dbs, PUBLICATION_KEYS, PUBLICATION_TYPES).map((publication) => {
      const db = dbForEntity(dbs, publication) ?? primaryDb;
      return {
        name: stringValue(publication.name) ?? "Publication",
        publisher: stringValue(publication.publisher),
        date: dateValue(publication.date) ?? dateValue(publication.publishedOn),
        url: urlValue(publication.url),
        description: stringValue(publication.description),
        authors: personNames(publication.authors ?? publication["*authors"], db),
        provenance: provenance("publications"),
        confidence: 0.88
      };
    }),
    volunteering: valuesFrom(dbs, VOLUNTEER_KEYS, VOLUNTEER_TYPES).map((volunteering) => {
      const db = dbForEntity(dbs, volunteering) ?? primaryDb;
      const organizationEntity = companyEntityForRecord(volunteering, db);
      return {
        role: stringValue(volunteering.role),
        organization:
          stringValue(volunteering.companyName) ??
          stringValue(volunteering.organizationName) ??
          stringValue(organizationEntity?.name) ??
          "Volunteer organization",
        organizationUrl: linkedUrl(organizationEntity, "company"),
        organizationLogoUrl: imageUrlFromEntity(organizationEntity),
        cause:
          stringValue(volunteering.cause) ??
          stringValue(volunteering.causeName) ??
          stringValue(volunteering.volunteerCause),
        description: stringValue(volunteering.description),
        dates: dateRange(volunteering),
        provenance: provenance("volunteering"),
        confidence: 0.88
      };
    }),
    honorsAwards: valuesFrom(dbs, HONOR_KEYS, HONOR_TYPES).map((honor) => {
      const db = dbForEntity(dbs, honor) ?? primaryDb;
      return {
        title: stringValue(honor.title) ?? "Honor",
        issuer: stringValue(honor.issuer),
        date: dateValue(honor.issueDate) ?? dateValue(honor.issuedOn),
        description: stringValue(honor.description),
        associatedWith: occupationLabel(honor, db),
        provenance: provenance("honorsAwards"),
        confidence: 0.88
      };
    }),
    testScores,
    patents,
    languages: valuesFrom(dbs, LANGUAGE_KEYS, LANGUAGE_TYPES).map((language) => ({
      language: stringValue(language.name) ?? "Language",
      fluency: languageFluency(stringValue(language.proficiency)),
      provenance: provenance("languages"),
      confidence: 0.85
    })),
    courses,
    recommendations,
    featured,
    organizations,
    interests,
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
    for (const entityUrn of entityKeysForIndex(entity)) {
      entitiesByUrn[entityUrn] = entity;
    }
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
      return included.filter((entity) => entityMatchesTypes(entity, expected));
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
    (entity) => entityKey(entity) ?? JSON.stringify(entity)
  );
}

function workFromPositionGroup(
  group: JsonRecord,
  positions: JsonRecord[],
  db: VoyagerDb,
  provenance: Provenance
): WorkExperience | null {
  const roles = positions
    .map((position) => nestedRoleFromPosition(position, db, provenance))
    .filter(isPresent);
  const firstPosition = positions[0];
  const companyEntity =
    companyEntityForPosition(group, db) ?? companyEntityForPosition(firstPosition, db);
  const title =
    stringValue(group.title) ??
    stringValue(group.profilePositionGroupTitle) ??
    stringValue(group.multiLocaleTitle) ??
    roles[0]?.title;
  const company =
    companyNameForPosition(group, db) ??
    (firstPosition ? companyNameForPosition(firstPosition, db) : undefined);
  if (!title && !company && !roles.length) return null;

  const work: WorkExperience = {
    title: title ?? roles[0]?.title ?? "Role",
    company,
    employmentType:
      employmentTypeForPosition(group, db) ??
      (firstPosition ? employmentTypeForPosition(firstPosition, db) : undefined),
    location:
      stringValue(group.locationName) ??
      stringValue(group.location) ??
      (firstPosition
        ? (stringValue(firstPosition.locationName) ?? stringValue(firstPosition.location))
        : undefined),
    dates: dateRange(group) ?? dateRangeFromRoles(roles),
    description: stringValue(group.description) ?? stringValue(group.multiLocaleDescription),
    companyUrl: linkedUrl(companyEntity, "company"),
    companyLogoUrl: imageUrlFromEntity(companyEntity),
    companyIndustry: industryNameForEntity(companyEntity, db),
    roles,
    provenance,
    confidence: 0.92
  };

  return work;
}

function workFromPosition(
  position: JsonRecord,
  db: VoyagerDb,
  provenance: Provenance
): WorkExperience {
  const companyEntity = companyEntityForPosition(position, db);
  return {
    title: stringValue(position.title) ?? stringValue(position.multiLocaleTitle) ?? "Role",
    employmentType: employmentTypeForPosition(position, db),
    company: companyNameForPosition(position, db),
    location: stringValue(position.locationName) ?? stringValue(position.location),
    dates: dateRange(position),
    description: stringValue(position.description) ?? stringValue(position.multiLocaleDescription),
    companyUrl: linkedUrl(companyEntity, "company"),
    companyLogoUrl: imageUrlFromEntity(companyEntity),
    companyIndustry: industryNameForEntity(companyEntity, db),
    roles: [],
    provenance,
    confidence: 0.92
  };
}

function nestedRoleFromPosition(
  position: JsonRecord,
  db: VoyagerDb,
  provenance: Provenance
): NestedRole | null {
  const title = stringValue(position.title) ?? stringValue(position.multiLocaleTitle);
  if (!title) return null;
  return {
    title,
    employmentType: employmentTypeForPosition(position, db),
    location: stringValue(position.locationName) ?? stringValue(position.location),
    dates: dateRange(position),
    description: stringValue(position.description) ?? stringValue(position.multiLocaleDescription),
    provenance,
    confidence: 0.9
  };
}

function companyEntityForPosition(
  position: JsonRecord | undefined,
  db: VoyagerDb
): JsonRecord | undefined {
  if (!position) return undefined;
  return companyEntityForRecord(position, db);
}

function companyEntityForRecord(
  record: JsonRecord | undefined,
  db: VoyagerDb
): JsonRecord | undefined {
  if (!record) return undefined;
  const company = objectRecord(record.company);
  return (
    company ??
    linkedEntity(
      db,
      record.companyUrn,
      record.organizationUrn,
      record["*company"],
      record["*organization"],
      record.company,
      record.organization,
      record["*miniCompany"],
      record.miniCompany,
      record.companyMiniProfile,
      record["*companyMiniProfile"]
    )
  );
}

function companyNameForPosition(position: JsonRecord, db: VoyagerDb): string | undefined {
  const company = objectRecord(position.company);
  return (
    stringValue(position.companyName) ??
    stringValue(position.multiLocaleCompanyName) ??
    stringValue(company?.name) ??
    linkedName(db, position.companyUrn) ??
    linkedName(db, position["*company"]) ??
    linkedName(db, position["*miniCompany"])
  );
}

function employmentTypeForPosition(position: JsonRecord, db: VoyagerDb): string | undefined {
  return (
    stringValue(position.employmentType) ??
    linkedName(db, position["*employmentType"]) ??
    linkedName(db, position.employmentTypeUrn)
  );
}

function occupationLabel(record: JsonRecord, db: VoyagerDb): string | undefined {
  const occupationUnion = objectRecord(record.occupationUnion);
  const linked = linkedEntity(
    db,
    occupationUnion?.profilePosition,
    occupationUnion?.profileEducation,
    record.profilePosition,
    record.profileEducation,
    record["*profilePosition"],
    record["*profileEducation"],
    record.position,
    record.education
  );
  if (!linked) return undefined;
  const title = stringValue(linked.title) ?? stringValue(linked.name);
  const company = companyNameForPosition(linked, db);
  if (title && company) return `${title}, ${company}`;
  return (
    title ??
    company ??
    stringValue(linked.schoolName) ??
    stringValue(linked.degreeName) ??
    linkedName(db, linked.schoolUrn) ??
    linkedName(db, linked["*school"])
  );
}

function groupedPositionEntities(
  dbs: VoyagerDb[]
): Array<{ db: VoyagerDb; group: JsonRecord; positions: JsonRecord[] }> {
  return uniqueBy(
    dbs.flatMap((db) => {
      const groups = uniqueBy(
        [...db.getValuesByKey(POSITION_GROUP_KEYS), ...db.getElementsByType(POSITION_GROUP_TYPES)],
        (group) => stringValue(group.entityUrn) ?? JSON.stringify(group)
      );
      return groups
        .map((group) => ({
          db,
          group,
          positions: uniqueBy(
            POSITION_IN_GROUP_KEYS.flatMap((key) => valuesForKey(group[key], db.entitiesByUrn)),
            (position) => positionEntityKey(position) ?? JSON.stringify(position)
          )
        }))
        .filter(
          ({ group, positions }) => positions.length || Boolean(companyNameForPosition(group, db))
        );
    }),
    ({ group }) => stringValue(group.entityUrn) ?? JSON.stringify(group)
  );
}

function positionsFromGroups(dbs: VoyagerDb[]): JsonRecord[] {
  return uniqueBy(
    groupedPositionEntities(dbs).flatMap(({ positions }) => positions),
    (position) => positionEntityKey(position) ?? JSON.stringify(position)
  );
}

function positionEntityKey(position: JsonRecord): string | undefined {
  return entityKey(position);
}

function voyagerInventoryDiagnostics(dbs: VoyagerDb[], sourceName: string): Diagnostic[] {
  const sectionCounts = {
    profile: valuesFrom(dbs, PROFILE_KEYS, PROFILE_TYPES).length,
    work: uniqueBy(
      [...valuesFrom(dbs, POSITION_KEYS, POSITION_TYPES), ...positionsFromGroups(dbs)],
      (position) => entityKey(position) ?? JSON.stringify(position)
    ).length,
    workPositionGroups: valuesFrom(dbs, POSITION_GROUP_KEYS, POSITION_GROUP_TYPES).length,
    education: valuesFrom(dbs, EDUCATION_KEYS, EDUCATION_TYPES).length,
    skills: valuesFrom(dbs, SKILL_KEYS, SKILL_TYPES).length,
    licensesCertifications: valuesFrom(dbs, CERTIFICATION_KEYS, CERTIFICATION_TYPES).length,
    projects: valuesFrom(dbs, PROJECT_KEYS, PROJECT_TYPES).length,
    publications: valuesFrom(dbs, PUBLICATION_KEYS, PUBLICATION_TYPES).length,
    volunteering: valuesFrom(dbs, VOLUNTEER_KEYS, VOLUNTEER_TYPES).length,
    honorsAwards: valuesFrom(dbs, HONOR_KEYS, HONOR_TYPES).length,
    testScores: valuesFrom(dbs, TEST_SCORE_KEYS, TEST_SCORE_TYPES).length,
    patents: valuesFrom(dbs, PATENT_KEYS, PATENT_TYPES).length,
    languages: valuesFrom(dbs, LANGUAGE_KEYS, LANGUAGE_TYPES).length,
    courses: valuesFrom(dbs, COURSE_KEYS, COURSE_TYPES).length,
    recommendations: valuesFrom(
      dbs,
      ["*recommendationView", "*profileRecommendations"],
      [
        "com.linkedin.voyager.identity.profile.Recommendation",
        "com.linkedin.voyager.dash.identity.profile.Recommendation",
        "com.linkedin.voyager.dash.deco.identity.profile.FullProfileRecommendation"
      ]
    ).length,
    featured: valuesFrom(dbs, FEATURED_KEYS, FEATURED_TYPES).length,
    organizations: valuesFrom(dbs, ORGANIZATION_KEYS, ORGANIZATION_TYPES).length,
    interests: valuesFrom(dbs, INTEREST_KEYS, INTEREST_TYPES).length
  };
  const tocKeys = sortedCounts(dbs.flatMap((db) => voyagerKeyCounts(db.tableOfContents)));
  const entityTypes = sortedCounts(
    dbs.flatMap((db) =>
      db.entities.flatMap((entity) => {
        const type = stringValue(entity.$type);
        return type ? [[type, 1] as const] : [];
      })
    )
  );
  const recipeTypes = sortedCounts(
    dbs.flatMap((db) =>
      db.entities.flatMap((entity) =>
        recipeTypesForEntity(entity).map((recipeType) => [recipeType, 1] as const)
      )
    )
  );
  const entityFields = entityFieldInventory(dbs);

  return [
    {
      code: "linkedin-voyager.inventory.sections",
      level: "info",
      message: `Voyager mapped section candidate counts: ${JSON.stringify(sectionCounts)}`,
      source: sourceName
    },
    {
      code: "linkedin-voyager.inventory.toc",
      level: "info",
      message: `Voyager table-of-contents key counts: ${JSON.stringify(tocKeys)}`,
      source: sourceName
    },
    {
      code: "linkedin-voyager.inventory.entities",
      level: "info",
      message: `Voyager entity counts: ${JSON.stringify({ entityTypes, recipeTypes })}`,
      source: sourceName
    },
    {
      code: "linkedin-voyager.inventory.fields",
      level: "info",
      message: `Voyager entity field keys: ${JSON.stringify(entityFields)}`,
      source: sourceName
    }
  ];
}

function recommendationText(recommendation: JsonRecord): string | undefined {
  return (
    stringValue(recommendation.recommendationText) ??
    stringValue(recommendation.text) ??
    stringValue(recommendation.description)
  );
}

function courseName(course: JsonRecord): string | undefined {
  const number = courseNumber(course);
  const name = stringValue(course.name) ?? stringValue(course.title);
  if (number && name && !name.includes(number)) return `${number} - ${name}`;
  return name ?? number;
}

function courseNumber(course: JsonRecord): string | undefined {
  return stringValue(course.number) ?? stringValue(course.courseNumber);
}

function courseProvider(course: JsonRecord, db: VoyagerDb): string | undefined {
  const occupationUnion = objectRecord(course.occupationUnion);
  const educationUrn =
    stringValue(occupationUnion?.profileEducation) ??
    stringValue(course.profileEducation) ??
    stringValue(course["*profileEducation"]);
  const education = objectRecord(db.getElementByUrn(educationUrn));
  return (
    stringValue(course.providerName) ??
    stringValue(course.schoolName) ??
    stringValue(education?.schoolName) ??
    linkedName(db, education?.schoolUrn) ??
    linkedName(db, education?.["*school"])
  );
}

function featuredItemFromEntity(
  item: JsonRecord,
  provenance: Provenance
): {
  title: string;
  type?: string;
  url?: string;
  imageUrl?: string;
  description?: string;
  provenance: Provenance;
  confidence: number;
} | null {
  const data = objectRecord(item.data) ?? {};
  const title =
    stringValue(item.title) ??
    stringValue(item.mediaTitle) ??
    stringValue(data.title) ??
    stringValue(data.mediaTitle) ??
    stringValue(item.name);
  if (!title) return null;
  const featuredItem: {
    title: string;
    type?: string;
    url?: string;
    imageUrl?: string;
    description?: string;
    provenance: Provenance;
    confidence: number;
  } = {
    title,
    provenance,
    confidence: 0.85
  };
  const type =
    stringValue(item.mediaType) ??
    stringValue(item.contentType) ??
    stringValue(item.category) ??
    stringValue(data.mediaType) ??
    stringValue(data.contentType) ??
    stringValue(data.category);
  if (type) featuredItem.type = type;
  const url = urlValue(data.url) ?? urlValue(data.Url) ?? urlValue(item.url);
  if (url) featuredItem.url = url;
  const imageUrl = imageUrlFromEntity(data) ?? imageUrlFromEntity(item);
  if (imageUrl) featuredItem.imageUrl = imageUrl;
  const description =
    stringValue(item.description) ??
    stringValue(item.mediaDescription) ??
    stringValue(data.description) ??
    stringValue(data.mediaDescription);
  if (description) featuredItem.description = description;
  return featuredItem;
}

function testScoreFromEntity(
  testScore: JsonRecord,
  provenance: Provenance
): {
  name: string;
  score?: string;
  date?: string;
  description?: string;
  provenance: Provenance;
  confidence: number;
} | null {
  const name =
    stringValue(testScore.name) ?? stringValue(testScore.title) ?? stringValue(testScore.testName);
  const score =
    stringValue(testScore.score) ??
    stringValue(testScore.result) ??
    stringValue(testScore.scoreText);
  if (!name && !score) return null;

  const item: {
    name: string;
    score?: string;
    date?: string;
    description?: string;
    provenance: Provenance;
    confidence: number;
  } = {
    name: name ?? "Test score",
    provenance,
    confidence: 0.85
  };
  if (score) item.score = score;
  const date =
    dateValue(testScore.dateOn) ??
    dateValue(testScore.date) ??
    dateValue(testScore.issuedOn) ??
    dateRange(testScore);
  if (date) item.date = date;
  const description = stringValue(testScore.description);
  if (description) item.description = description;
  return item;
}

function patentFromEntity(
  patent: JsonRecord,
  db: VoyagerDb,
  provenance: Provenance
): {
  title: string;
  issuer?: string;
  patentNumber?: string;
  applicationNumber?: string;
  date?: string;
  url?: string;
  description?: string;
  status?: string;
  inventors: string[];
  provenance: Provenance;
  confidence: number;
} | null {
  const title = stringValue(patent.title) ?? stringValue(patent.name);
  if (!title) return null;

  const item: {
    title: string;
    issuer?: string;
    patentNumber?: string;
    applicationNumber?: string;
    date?: string;
    url?: string;
    description?: string;
    status?: string;
    inventors: string[];
    provenance: Provenance;
    confidence: number;
  } = {
    title,
    inventors: personNames(patent.inventors ?? patent["*inventors"], db),
    provenance,
    confidence: 0.85
  };
  const issuer =
    stringValue(patent.issuer) ?? stringValue(patent.authority) ?? stringValue(patent.patentOffice);
  if (issuer) item.issuer = issuer;
  const patentNumber = stringValue(patent.patentNumber) ?? stringValue(patent.number);
  if (patentNumber) item.patentNumber = patentNumber;
  const applicationNumber = stringValue(patent.applicationNumber);
  if (applicationNumber) item.applicationNumber = applicationNumber;
  const date =
    dateValue(patent.issueDate) ??
    dateValue(patent.issuedOn) ??
    dateValue(patent.filingDate) ??
    dateRange(patent);
  if (date) item.date = date;
  const url = urlValue(patent.url);
  if (url) item.url = url;
  const description = stringValue(patent.description);
  if (description) item.description = description;
  const status = stringValue(patent.status);
  if (status) item.status = status;
  return item;
}

function personNames(value: unknown, db: VoyagerDb): string[] {
  return uniqueBy(personNameValues(value, db), (name) => name.toLowerCase());
}

function personNameValues(value: unknown, db: VoyagerDb): string[] {
  if (Array.isArray(value)) return value.flatMap((item) => personNameValues(item, db));
  if (typeof value === "string") {
    const linked = valuesForKey(value, db.entitiesByUrn).map(personDisplayName).filter(isPresent);
    if (linked.length) return linked;
    const directName = clean(value);
    return directName && !directName.startsWith("urn:li:") ? [directName] : [];
  }
  const record = objectRecord(value);
  if (!record) return [];
  return [personDisplayName(record)].filter(isPresent);
}

function personDisplayName(person: JsonRecord): string | undefined {
  return (
    [stringValue(person.firstName), stringValue(person.lastName)].filter(isPresent).join(" ") ||
    stringValue(person.fullName) ||
    stringValue(person.name)
  );
}

function preferredProfileEntity(
  dbs: VoyagerDb[],
  profileId: string | undefined
): JsonRecord | undefined {
  if (!profileId) return undefined;
  return valuesFrom(dbs, PROFILE_KEYS, PROFILE_TYPES).find((entity) =>
    profileIdsEqual(profileIdFromEntity(entity), profileId)
  );
}

function profileIdFromEntity(entity: JsonRecord): string | undefined {
  return (
    stringValue(entity.publicIdentifier) ??
    profileIdFromUrn(stringValue(entity.entityUrn)) ??
    profileIdFromUrn(stringValue(entity.key))
  );
}

function firstValue(dbs: VoyagerDb[], keys: string[], types: string[]): JsonRecord | undefined {
  return valuesFrom(dbs, keys, types)[0];
}

function dbForEntity(dbs: VoyagerDb[], entity: JsonRecord): VoyagerDb | undefined {
  const urn = entityKey(entity);
  return dbs.find(
    (db) => (urn ? db.entitiesByUrn[urn] === entity : false) || db.entities.includes(entity)
  );
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

function entityOrCollection(
  entity: JsonRecord | undefined,
  entitiesByUrn: Record<string, JsonRecord>
): JsonRecord[] {
  if (!entity) return [];
  const elements = entity["*elements"] ?? entity.elements;
  if (Array.isArray(elements)) return elements.flatMap((item) => valuesForKey(item, entitiesByUrn));
  return [entity];
}

function entityMatchesTypes(entity: JsonRecord, expected: string[]): boolean {
  const type = stringValue(entity.$type);
  if (type && expected.includes(type)) return true;

  return recipeTypesForEntity(entity).some((candidate) => expected.includes(candidate));
}

function recipeTypesForEntity(entity: JsonRecord): string[] {
  const recipeTypes = Array.isArray(entity.$recipeTypes)
    ? entity.$recipeTypes.flatMap((item) => {
        const recipeType = stringValue(item);
        return recipeType ? [recipeType] : [];
      })
    : [];
  const recipeType = stringValue(entity.$recipeType);
  if (recipeType) recipeTypes.push(recipeType);
  return recipeTypes;
}

function countVoyagerValue(value: unknown): number {
  if (Array.isArray(value))
    return value.reduce((total, item) => total + countVoyagerValue(item), 0);
  if (typeof value === "string") return 1;
  const record = objectRecord(value);
  if (!record) return value === undefined ? 0 : 1;
  const elements = record["*elements"] ?? record.elements;
  if (Array.isArray(elements)) return elements.length;
  return 1;
}

function voyagerKeyCounts(record: JsonRecord): (readonly [string, number])[] {
  return Object.entries(record).flatMap(([key, value]) => {
    const nested = objectRecord(value);
    return [[key, countVoyagerValue(value)] as const, ...(nested ? voyagerKeyCounts(nested) : [])];
  });
}

function sortedCounts(items: readonly (readonly [string, number])[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const [key, count] of items) {
    counts[key] = (counts[key] ?? 0) + count;
  }
  return Object.fromEntries(
    Object.entries(counts).sort(([left], [right]) => left.localeCompare(right))
  );
}

function entityFieldInventory(dbs: VoyagerDb[]): Record<string, string[]> {
  const fieldsByType = new Map<string, Set<string>>();
  for (const entity of dbs.flatMap((db) => db.entities)) {
    const types = [stringValue(entity.$type), ...recipeTypesForEntity(entity)].filter(isPresent);
    for (const type of types) {
      const fields = fieldsByType.get(type) ?? new Set<string>();
      for (const key of Object.keys(entity)) fields.add(key);
      fieldsByType.set(type, fields);
    }
  }
  return Object.fromEntries(
    Array.from(fieldsByType.entries())
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([type, fields]) => [type, Array.from(fields).sort()])
  );
}

function dateRange(entity: JsonRecord): string | undefined {
  const range = objectRecord(entity.timePeriod) ?? objectRecord(entity.dateRange);
  const start =
    dateValue(range?.startDate) ??
    dateValue(range?.start) ??
    dateValue(entity.startDate) ??
    dateValue(entity.startDateOn);
  const end =
    dateValue(range?.endDate) ??
    dateValue(range?.end) ??
    dateValue(entity.endDate) ??
    dateValue(entity.endDateOn);
  if (start && end) return `${start} - ${end}`;
  if (start) return `${start} - Present`;
  return end;
}

function dateRangeFromRoles(roles: NestedRole[]): string | undefined {
  const ranges = roles.flatMap((role) => (role.dates ? [role.dates] : []));
  const starts = ranges.flatMap((range) => range.split(" - ")[0] || []);
  const ends = ranges.flatMap((range) => range.split(" - ")[1] || []);
  const start = starts.sort(compareDateLabels)[0];
  const end = ends.some((value) => value === "Present")
    ? "Present"
    : ends.sort(compareDateLabels).at(-1);
  if (start && end) return `${start} - ${end}`;
  return start ?? end;
}

function compareDateLabels(left: string, right: string): number {
  return left.localeCompare(right);
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
    if (candidate.startsWith("/")) {
      try {
        return new URL(candidate, "https://www.linkedin.com").toString();
      } catch {
        return undefined;
      }
    }
    if (/^(?:www\.)?linkedin\.com\//i.test(candidate)) {
      try {
        return new URL(`https://${candidate}`).toString();
      } catch {
        return undefined;
      }
    }
    return undefined;
  }
}

function linkedName(db: VoyagerDb, urn: unknown): string | undefined {
  const entity = objectRecord(db.getElementByUrn(stringValue(urn)));
  return stringValue(entity?.name) ?? stringValue(entity?.universalName);
}

function linkedEntity(db: VoyagerDb, ...values: unknown[]): JsonRecord | undefined {
  for (const value of values) {
    const record = objectRecord(value);
    if (record) return record;
    const entity = objectRecord(db.getElementByUrn(stringValue(value)));
    if (entity) return entity;
  }
  return undefined;
}

function linkedUrl(entity: JsonRecord | undefined, kind: "company" | "school"): string | undefined {
  if (!entity) return undefined;
  const direct =
    urlValue(entity.url) ??
    urlValue(entity.navigationUrl) ??
    urlValue(entity.companyPageUrl) ??
    urlValue(entity.schoolPageUrl) ??
    urlValue(entity.websiteUrl);
  if (direct) return direct;
  const universalName = stringValue(entity.universalName) ?? stringValue(entity.publicIdentifier);
  if (!universalName) return undefined;
  return `https://www.linkedin.com/${kind}/${encodeURIComponent(universalName)}/`;
}

function linkedGeoName(db: VoyagerDb, profileEntity: JsonRecord): string | undefined {
  const inlineGeo = objectRecord(profileEntity.geoLocation);
  const linkedGeo =
    objectRecord(db.getElementByUrn(stringValue(profileEntity["*geo"]))) ??
    objectRecord(db.getElementByUrn(stringValue(profileEntity["*geoLocation"]))) ??
    objectRecord(db.getElementByUrn(stringValue(profileEntity["*location"]))) ??
    objectRecord(db.getElementByUrn(stringValue(profileEntity.geoUrn))) ??
    objectRecord(db.getElementByUrn(stringValue(profileEntity.geoLocationUrn)));
  const geo = inlineGeo ?? linkedGeo;
  return (
    stringValue(geo?.defaultLocalizedName) ??
    stringValue(geo?.defaultLocalizedNameWithoutCountryName) ??
    stringValue(geo?.name)
  );
}

function miniProfileForProfile(
  dbs: VoyagerDb[],
  profileEntity: JsonRecord,
  profileId: string | undefined
): JsonRecord | undefined {
  const linked = dbForEntity(dbs, profileEntity);
  const preferredDb = linked ?? dbs[0];
  if (preferredDb) {
    const linkedMini = linkedEntity(
      preferredDb,
      profileEntity["*miniProfile"],
      profileEntity.miniProfile,
      profileEntity.miniProfileUrn
    );
    if (linkedMini) return linkedMini;
  }

  const profileIdentifier = profileId?.toLowerCase();
  return valuesFrom(dbs, [], MINI_PROFILE_TYPES).find((miniProfile) => {
    if (!profileIdentifier) return true;
    const publicIdentifier =
      stringValue(miniProfile.publicIdentifier) ??
      stringValue(miniProfile.publicProfileUrl)?.match(/linkedin\.com\/in\/([^/?#]+)/i)?.[1];
    return publicIdentifier?.toLowerCase() === profileIdentifier;
  });
}

function identityImagery(
  profileEntity: JsonRecord,
  miniProfile: JsonRecord | undefined
): Profile["identity"]["imagery"] | undefined {
  const profileImageUrl = imageUrlFromEntity(profileEntity) ?? imageUrlFromEntity(miniProfile);
  const backgroundImageUrl =
    imageUrlValue(profileEntity.backgroundPicture) ??
    imageUrlValue(profileEntity.backgroundImage) ??
    imageUrlValue(profileEntity.coverImage);
  if (!profileImageUrl && !backgroundImageUrl) return undefined;
  const imagery: NonNullable<Profile["identity"]["imagery"]> = {};
  if (profileImageUrl) imagery.profileImageUrl = profileImageUrl;
  if (backgroundImageUrl) imagery.backgroundImageUrl = backgroundImageUrl;
  return imagery;
}

function linksFromProfileEntity(profileEntity: JsonRecord): Profile["identity"]["links"] {
  const candidates = [
    profileEntity.websites,
    profileEntity.website,
    profileEntity.contactInfo,
    profileEntity["*websites"]
  ];
  return uniqueBy(
    candidates.flatMap((candidate) => linksFromValue(candidate)),
    (link) => link.url.toLowerCase()
  );
}

function linksFromValue(value: unknown): Profile["identity"]["links"] {
  if (Array.isArray(value)) return value.flatMap(linksFromValue);
  const url = urlValue(value);
  if (url) return [{ label: "Website", url }];
  const record = objectRecord(value);
  if (!record) return [];
  const directUrl =
    urlValue(record.url) ??
    urlValue(record.websiteUrl) ??
    urlValue(record.companyPageUrl) ??
    urlValue(record.navigationUrl);
  const nested = [record.websites, record.website, record.elements, record["*elements"]].flatMap(
    linksFromValue
  );
  if (!directUrl) return nested;
  return [
    {
      label: stringValue(record.label) ?? stringValue(record.category) ?? "Website",
      url: directUrl
    },
    ...nested
  ];
}

function industryNameForEntity(entity: JsonRecord | undefined, db: VoyagerDb): string | undefined {
  if (!entity) return undefined;
  const linkedIndustry = linkedEntity(db, entity["*industry"], entity.industryUrn, entity.industry);
  return (
    stringValue(entity.industryName) ??
    stringValue(entity.industry) ??
    stringValue(linkedIndustry?.name) ??
    stringValue(linkedIndustry?.localizedName)
  );
}

function socialCountLabel(entity: JsonRecord, kind: "connection" | "follower"): string | undefined {
  const keys =
    kind === "connection"
      ? ["connectionsCount", "connectionCount", "numConnections"]
      : ["followersCount", "followerCount", "numFollowers"];
  for (const key of keys) {
    const value = entity[key];
    const number = numberValue(value);
    if (typeof number === "number") return String(number);
    const text = stringValue(value);
    if (text) return text;
  }
  return undefined;
}

function imageUrlFromEntity(entity: JsonRecord | undefined): string | undefined {
  if (!entity) return undefined;
  return (
    imageUrlValue(entity.profilePicture) ??
    imageUrlValue(entity.picture) ??
    imageUrlValue(entity.logo) ??
    imageUrlValue(entity.logoResolutionResult) ??
    imageUrlValue(entity.image) ??
    imageUrlValue(entity.imageUrl) ??
    imageUrlValue(entity.displayImageReference) ??
    imageUrlValue(entity.vectorImage)
  );
}

function imageUrlValue(value: unknown, depth = 0): string | undefined {
  if (depth > 6) return undefined;
  const direct = urlValue(value);
  if (direct) return direct;
  const record = objectRecord(value);
  if (!record) return undefined;

  const vectorImage = objectRecord(record.vectorImage) ?? record;
  const rootUrl = stringValue(vectorImage.rootUrl);
  const artifacts = Array.isArray(vectorImage.artifacts) ? vectorImage.artifacts : [];
  const artifact = artifacts
    .flatMap((item) => {
      const artifactRecord = objectRecord(item);
      return artifactRecord ? [artifactRecord] : [];
    })
    .at(-1);
  const path = stringValue(artifact?.fileIdentifyingUrlPathSegment);
  if (rootUrl && path) {
    try {
      return new URL(path, rootUrl).toString();
    } catch {
      return undefined;
    }
  }

  for (const key of [
    "url",
    "imageUrl",
    "displayImageReference",
    "displayImage",
    "profilePicture",
    "picture",
    "logo",
    "logoResolutionResult",
    "image",
    "originalImage"
  ]) {
    const nested = imageUrlValue(record[key], depth + 1);
    if (nested) return nested;
  }
  return undefined;
}

function localeLabel(profileEntity: JsonRecord): string | undefined {
  const locale =
    objectRecord(profileEntity.defaultLocale) ?? objectRecord(profileEntity.primaryLocale);
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

function profileIdFromUrn(value: string | undefined): string | undefined {
  const match = value?.match(/^urn:li:(?:fsd_profile|fs_profile):([^?#]+)/i);
  return match?.[1];
}

function profileIdsEqual(left: string | undefined, right: string | undefined): boolean {
  return Boolean(left && right && safeDecode(left) === safeDecode(right));
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
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
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function entityKeysForIndex(entity: JsonRecord): string[] {
  return [
    stringValue(entity.entityUrn),
    stringValue(entity.backendUrn),
    stringValue(entity.key)
  ].filter(isPresent);
}

function entityKey(entity: JsonRecord): string | undefined {
  return entityKeysForIndex(entity)[0];
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
