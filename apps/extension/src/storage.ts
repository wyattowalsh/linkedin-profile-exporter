import { profileSchema, type Profile } from "@linkedin-profile-exporter/core/schema";
import { defaultSettings, settingsSchema, type Settings } from "@linkedin-profile-exporter/core/settings";
import { browser } from "wxt/browser";

const SETTINGS_KEY = "linkedin-profile-exporter.settings";
const PROFILE_KEY = "linkedin-profile-exporter.profile";

export async function loadSettings(): Promise<Settings> {
  const stored = await browser.storage.local.get(SETTINGS_KEY);
  return settingsSchema.catch(defaultSettings).parse(stored[SETTINGS_KEY]);
}

export async function saveSettings(settings: Settings): Promise<void> {
  await browser.storage.local.set({ [SETTINGS_KEY]: settings });
}

export async function clearExtractedState(): Promise<void> {
  await browser.storage.local.remove(PROFILE_KEY);
}

export async function loadExtractedProfile(): Promise<Profile | null> {
  const stored = await browser.storage.local.get(PROFILE_KEY);
  const parsed = profileSchema.safeParse(stored[PROFILE_KEY]);
  return parsed.success ? parsed.data : null;
}

export async function saveExtractedProfile(profile: Profile, settings: Settings): Promise<void> {
  if (settings.privacy.persistExtractedData) {
    await browser.storage.local.set({ [PROFILE_KEY]: profile });
  } else {
    await clearExtractedState();
  }
}
