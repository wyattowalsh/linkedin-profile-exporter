import { z } from "zod";
import { exportFormatSchema, profileSchema, type Profile } from "./schema";

export const automationModeSchema = z.enum(["manual", "review-before-export", "auto-export"]);
export const deliveryModeSchema = z.enum(["download", "clipboard"]);

export const settingsSchema = z.object({
  dataScope: z
    .object({
      identity: z.boolean().default(true),
      experience: z.boolean().default(true),
      education: z.boolean().default(true),
      skills: z.boolean().default(true),
      extendedSections: z.boolean().default(true),
      imageryMetadata: z.boolean().default(true)
    })
    .default({
      identity: true,
      experience: true,
      education: true,
      skills: true,
      extendedSections: true,
      imageryMetadata: true
    }),
  automationMode: automationModeSchema.default("review-before-export"),
  deliveryMode: deliveryModeSchema.default("download"),
  autoScroll: z.boolean().default(true),
  expandShowMore: z.boolean().default(true),
  outputFormats: z.array(exportFormatSchema).min(1).default(["json", "markdown"]),
  filenameTemplate: z.string().min(3).default("{name}-{date}-{format}"),
  privacy: z
    .object({
      localOnly: z.literal(true).default(true),
      analyticsEnabled: z.literal(false).default(false),
      remoteUploadEnabled: z.literal(false).default(false),
      persistExtractedData: z.boolean().default(false)
    })
    .default({
      localOnly: true,
      analyticsEnabled: false,
      remoteUploadEnabled: false,
      persistExtractedData: false
    }),
  diagnostics: z
    .object({
      includeProvenance: z.boolean().default(true),
      includeConfidence: z.boolean().default(true),
      verbose: z.boolean().default(false)
    })
    .default({
      includeProvenance: true,
      includeConfidence: true,
      verbose: false
    })
});

export type Settings = z.infer<typeof settingsSchema>;

export const defaultSettings: Settings = settingsSchema.parse({});

export function validateSettings(input: unknown): Settings {
  return settingsSchema.parse(input);
}

export function normalizeSettings(input?: Partial<Settings>): Settings {
  return settingsSchema.parse({
    ...defaultSettings,
    ...input,
    dataScope: { ...defaultSettings.dataScope, ...input?.dataScope },
    privacy: { ...defaultSettings.privacy, ...input?.privacy },
    diagnostics: { ...defaultSettings.diagnostics, ...input?.diagnostics }
  });
}

export function applyProfileSettings(profileInput: unknown, settingsInput?: Partial<Settings>): Profile {
  const profile = profileSchema.parse(profileInput);
  const settings = normalizeSettings(settingsInput);
  const filtered: Profile = structuredClone(profile);

  filtered.exportMetadata = {
    formats: settings.outputFormats,
    filenameTemplate: settings.filenameTemplate
  };

  if (!settings.dataScope.identity) {
    filtered.identity = { name: filtered.identity.name, profileUrl: filtered.identity.profileUrl, links: [] };
    if (settings.diagnostics.includeProvenance && profile.identity.provenance) filtered.identity.provenance = profile.identity.provenance;
    if (settings.diagnostics.includeConfidence && typeof profile.identity.confidence === "number") filtered.identity.confidence = profile.identity.confidence;
  }
  if (!settings.dataScope.imageryMetadata) delete filtered.identity.imagery;
  if (!settings.dataScope.experience) filtered.work = [];
  if (!settings.dataScope.education) filtered.education = [];
  if (!settings.dataScope.skills) filtered.skills = [];
  if (!settings.dataScope.extendedSections) {
    filtered.licensesCertifications = [];
    filtered.projects = [];
    filtered.publications = [];
    filtered.volunteering = [];
    filtered.honorsAwards = [];
    filtered.languages = [];
    filtered.courses = [];
    filtered.recommendations = [];
    filtered.featured = [];
    filtered.organizations = [];
    filtered.interests = [];
  }

  if (!settings.diagnostics.includeProvenance || !settings.diagnostics.includeConfidence) {
    stripFieldMetadata(filtered, {
      provenance: !settings.diagnostics.includeProvenance,
      confidence: !settings.diagnostics.includeConfidence
    });
  }

  return profileSchema.parse(filtered);
}

function stripFieldMetadata(value: unknown, strip: { provenance: boolean; confidence: boolean }): void {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) stripFieldMetadata(item, strip);
    return;
  }
  const record = value as Record<string, unknown>;
  if (strip.provenance) delete record.provenance;
  if (strip.confidence) delete record.confidence;
  for (const item of Object.values(record)) stripFieldMetadata(item, strip);
}
