import { z } from "zod";

export const SCHEMA_VERSION = "linkedin-profile-exporter.profile.v1" as const;

export const sourceTypeSchema = z.enum([
  "dom",
  "client-state",
  "metadata",
  "automation",
  "manual",
  "fixture"
]);

export const provenanceSchema = z.object({
  sourceType: sourceTypeSchema,
  source: z.string(),
  selector: z.string().optional(),
  capturedAt: z.string().datetime(),
  notes: z.string().optional()
});

export const confidenceSchema = z.number().min(0).max(1);

export const diagnosticSchema = z.object({
  code: z.string(),
  level: z.enum(["info", "warning", "error"]),
  message: z.string(),
  source: z.string().optional()
});

const provenanceFields = {
  provenance: provenanceSchema.optional(),
  confidence: confidenceSchema.optional()
};

export const linkSchema = z.object({
  label: z.string(),
  url: z.string().url(),
  ...provenanceFields
});

export const imagerySchema = z.object({
  profileImageUrl: z.string().url().optional(),
  backgroundImageUrl: z.string().url().optional(),
  alt: z.string().optional(),
  ...provenanceFields
});

export const identitySchema = z.object({
  name: z.string().min(1),
  headline: z.string().optional(),
  location: z.string().optional(),
  industry: z.string().optional(),
  connections: z.string().optional(),
  followers: z.string().optional(),
  memberUrn: z.string().optional(),
  profileUrl: z.string().url(),
  about: z.string().optional(),
  links: z.array(linkSchema).default([]),
  imagery: imagerySchema.optional(),
  ...provenanceFields
});

export const nestedRoleSchema = z.object({
  title: z.string(),
  employmentType: z.string().optional(),
  location: z.string().optional(),
  dates: z.string().optional(),
  description: z.string().optional(),
  ...provenanceFields
});

export const workExperienceSchema = z.object({
  company: z.string().optional(),
  title: z.string(),
  employmentType: z.string().optional(),
  location: z.string().optional(),
  dates: z.string().optional(),
  description: z.string().optional(),
  companyUrl: z.string().url().optional(),
  companyLogoUrl: z.string().url().optional(),
  companyIndustry: z.string().optional(),
  roles: z.array(nestedRoleSchema).default([]),
  ...provenanceFields
});

export const educationSchema = z.object({
  school: z.string(),
  degree: z.string().optional(),
  field: z.string().optional(),
  dates: z.string().optional(),
  description: z.string().optional(),
  activities: z.string().optional(),
  schoolUrl: z.string().url().optional(),
  schoolLogoUrl: z.string().url().optional(),
  ...provenanceFields
});

export const skillSchema = z.object({
  name: z.string(),
  endorsements: z.number().int().nonnegative().optional(),
  ...provenanceFields
});

export const certificationSchema = z.object({
  name: z.string(),
  issuer: z.string().optional(),
  issuerUrl: z.string().url().optional(),
  issuerLogoUrl: z.string().url().optional(),
  date: z.string().optional(),
  credentialId: z.string().optional(),
  credentialUrl: z.string().url().optional(),
  ...provenanceFields
});

export const projectSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  url: z.string().url().optional(),
  dates: z.string().optional(),
  associatedWith: z.string().optional(),
  contributors: z.array(z.string()).optional(),
  ...provenanceFields
});

export const publicationSchema = z.object({
  name: z.string(),
  publisher: z.string().optional(),
  date: z.string().optional(),
  url: z.string().url().optional(),
  description: z.string().optional(),
  authors: z.array(z.string()).optional(),
  ...provenanceFields
});

export const volunteeringSchema = z.object({
  role: z.string().optional(),
  organization: z.string(),
  organizationUrl: z.string().url().optional(),
  organizationLogoUrl: z.string().url().optional(),
  cause: z.string().optional(),
  description: z.string().optional(),
  dates: z.string().optional(),
  ...provenanceFields
});

export const honorAwardSchema = z.object({
  title: z.string(),
  issuer: z.string().optional(),
  date: z.string().optional(),
  description: z.string().optional(),
  associatedWith: z.string().optional(),
  ...provenanceFields
});

export const testScoreSchema = z.object({
  name: z.string(),
  score: z.string().optional(),
  date: z.string().optional(),
  description: z.string().optional(),
  ...provenanceFields
});

export const patentSchema = z.object({
  title: z.string(),
  issuer: z.string().optional(),
  patentNumber: z.string().optional(),
  applicationNumber: z.string().optional(),
  date: z.string().optional(),
  url: z.string().url().optional(),
  description: z.string().optional(),
  status: z.string().optional(),
  inventors: z.array(z.string()).default([]),
  ...provenanceFields
});

export const languageSchema = z.object({
  language: z.string(),
  fluency: z.string().optional(),
  ...provenanceFields
});

export const courseSchema = z.object({
  name: z.string(),
  number: z.string().optional(),
  provider: z.string().optional(),
  ...provenanceFields
});

export const recommendationSchema = z.object({
  name: z.string(),
  relationship: z.string().optional(),
  text: z.string(),
  ...provenanceFields
});

export const featuredItemSchema = z.object({
  title: z.string(),
  type: z.string().optional(),
  url: z.string().url().optional(),
  imageUrl: z.string().url().optional(),
  description: z.string().optional(),
  ...provenanceFields
});

export const organizationSchema = z.object({
  name: z.string(),
  role: z.string().optional(),
  dates: z.string().optional(),
  description: z.string().optional(),
  url: z.string().url().optional(),
  logoUrl: z.string().url().optional(),
  ...provenanceFields
});

export const interestSchema = z.object({
  name: z.string(),
  url: z.string().url().optional(),
  ...provenanceFields
});

export const exportFormatSchema = z.enum([
  "json",
  "json-resume",
  "yaml",
  "csv",
  "xlsx",
  "xml",
  "markdown"
]);

export const profileSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  identity: identitySchema,
  work: z.array(workExperienceSchema).default([]),
  education: z.array(educationSchema).default([]),
  skills: z.array(skillSchema).default([]),
  licensesCertifications: z.array(certificationSchema).default([]),
  projects: z.array(projectSchema).default([]),
  publications: z.array(publicationSchema).default([]),
  volunteering: z.array(volunteeringSchema).default([]),
  honorsAwards: z.array(honorAwardSchema).default([]),
  testScores: z.array(testScoreSchema).default([]),
  patents: z.array(patentSchema).default([]),
  languages: z.array(languageSchema).default([]),
  courses: z.array(courseSchema).default([]),
  recommendations: z.array(recommendationSchema).default([]),
  featured: z.array(featuredItemSchema).default([]),
  organizations: z.array(organizationSchema).default([]),
  interests: z.array(interestSchema).default([]),
  metadata: z.object({
    capturedAt: z.string().datetime(),
    sourceUrl: z.string().url(),
    locale: z.string().optional(),
    generator: z.string().default("linkedin-profile-exporter"),
    referenceBuild: z.string().optional()
  }),
  diagnostics: z.array(diagnosticSchema).default([]),
  exportMetadata: z
    .object({
      formats: z.array(exportFormatSchema).default(["json", "markdown"]),
      filenameTemplate: z.string().default("{name}-{date}")
    })
    .default({ formats: ["json", "markdown"], filenameTemplate: "{name}-{date}" })
});

export type ExportFormat = z.infer<typeof exportFormatSchema>;
export type Profile = z.infer<typeof profileSchema>;
export type Provenance = z.infer<typeof provenanceSchema>;
export type Diagnostic = z.infer<typeof diagnosticSchema>;

export function validateProfile(input: unknown): Profile {
  return profileSchema.parse(input);
}
