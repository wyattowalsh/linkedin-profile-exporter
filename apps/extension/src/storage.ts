import { profileSchema, type Profile } from "@linkedin-profile-exporter/core/schema";
import { defaultSettings, settingsSchema, type Settings } from "@linkedin-profile-exporter/core/settings";
import { browser } from "wxt/browser";

const SETTINGS_KEY = "linkedin-profile-exporter.settings";
const PROFILE_KEY = "linkedin-profile-exporter.profile";
const SESSION_PROFILE_KEY = "linkedin-profile-exporter.profile.session";

export async function loadSettings(): Promise<Settings> {
  const stored = await browser.storage.local.get(SETTINGS_KEY);
  return settingsSchema.catch(defaultSettings).parse(stored[SETTINGS_KEY]);
}

export async function saveSettings(settings: Settings): Promise<void> {
  await browser.storage.local.set({ [SETTINGS_KEY]: settings });
}

export async function clearExtractedState(): Promise<void> {
  await Promise.all([browser.storage.local.remove(PROFILE_KEY), transientStorage()?.remove(SESSION_PROFILE_KEY)]);
}

export async function loadExtractedProfile(): Promise<Profile | null> {
  const sessionProfile = await loadProfileFrom(transientStorage(), SESSION_PROFILE_KEY);
  if (sessionProfile) return sessionProfile;
  return loadProfileFrom(browser.storage.local, PROFILE_KEY);
}

export async function saveExtractedProfile(profile: Profile, settings: Settings): Promise<void> {
  if (settings.privacy.persistExtractedData) {
    await Promise.all([browser.storage.local.set({ [PROFILE_KEY]: profile }), transientStorage()?.remove(SESSION_PROFILE_KEY)]);
  } else {
    await Promise.all([browser.storage.local.remove(PROFILE_KEY), transientStorage()?.set({ [SESSION_PROFILE_KEY]: profile })]);
  }
}

async function loadProfileFrom(area: StorageArea | undefined, key: string): Promise<Profile | null> {
  if (!area) return null;
  const stored = await area.get(key);
  const parsed = profileSchema.safeParse(stored[key]);
  return parsed.success ? parsed.data : null;
}

function transientStorage(): StorageArea | undefined {
  return (browser.storage as typeof browser.storage & { session?: StorageArea }).session;
}

type StorageArea = typeof browser.storage.local;
