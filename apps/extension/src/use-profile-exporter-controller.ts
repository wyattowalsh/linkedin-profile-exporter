import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { ReadinessResult } from "@linkedin-profile-exporter/core/extraction";
import type { ExportFormat, Profile } from "@linkedin-profile-exporter/core/schema";
import { defaultSettings, type Settings } from "@linkedin-profile-exporter/core/settings";
import { sendToActiveProfileTab } from "./active-tab";
import { deliverProfileFormats, formatsForDelivery } from "./profile-delivery";
import { clearExtractedState, loadExtractedProfile, loadSettings, saveExtractedProfile, saveSettings } from "./storage";

export function useProfileExporterController() {
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [readiness, setReadiness] = useState<ReadinessResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [fallbackText, setFallbackText] = useState("");
  const [extractionError, setExtractionError] = useState("");

  useEffect(() => {
    void loadSettings().then(setSettings).catch(() => setSettings(defaultSettings));
    void loadExtractedProfile().then(setProfile);
    void sendToActiveProfileTab({ type: "profile-readiness" }).then((response) => {
      if (response.ok && "readiness" in response) setReadiness(response.readiness);
      else if (!response.ok) setReadiness({ state: "needs-action", reason: response.error });
    });
  }, []);

  async function extract() {
    if (settings.automationMode === "manual" && readiness?.state !== "ready") {
      toast.error("Open a ready LinkedIn profile before manual extraction");
      return;
    }

    setBusy(true);
    setFallbackText("");
    setExtractionError("");
    const response = await sendToActiveProfileTab({ type: "extract-profile", settings });
    setBusy(false);

    if (!response.ok) {
      setExtractionError(response.error);
      toast.error(response.error);
      return;
    }
    if ("profile" in response) {
      setProfile(response.profile);
      await saveExtractedProfile(response.profile, settings);
      toast.success(settings.privacy.persistExtractedData ? "Profile extracted and kept locally" : "Profile extracted locally");
      if (settings.automationMode === "auto-export") await deliverCurrentProfile(response.profile, settings.deliveryMode);
    }
  }

  async function updateDeliveryMode(deliveryMode: Settings["deliveryMode"]) {
    const next = { ...settings, deliveryMode };
    setSettings(next);
    await saveSettings(next);
    toast.success(deliveryMode === "clipboard" ? "Clipboard delivery selected" : "Download delivery selected");
  }

  async function toggleFormat(format: ExportFormat) {
    const outputFormats = settings.outputFormats.includes(format)
      ? settings.outputFormats.filter((item) => item !== format)
      : [...settings.outputFormats, format];
    if (!outputFormats.length) return;

    const next = { ...settings, outputFormats };
    setSettings(next);
    await saveSettings(next);
  }

  async function deliverCurrentProfile(sourceProfile: Profile | null = profile, deliveryMode = settings.deliveryMode) {
    if (!sourceProfile) return;
    const formats = formatsForDelivery(deliveryMode, settings.outputFormats);
    if (!formats.length) {
      toast.error("No copyable text formats are selected");
      return;
    }

    const results = await deliverProfileFormats(sourceProfile, settings, deliveryMode);
    const fallback = results.find((result) => result.fallbackText)?.fallbackText;
    setFallbackText(fallback ?? "");

    const failures = results.filter((result) => !result.ok);
    if (failures.length) {
      toast.error(failures[0]?.error ?? "Export failed");
      return;
    }

    toast.success(deliveryMode === "clipboard" ? "Copied selected formats" : "Downloaded selected formats");
  }

  async function clearLocal() {
    setProfile(null);
    setFallbackText("");
    setExtractionError("");
    await clearExtractedState();
    toast.success("Local extracted profile cleared");
  }

  return {
    busy,
    clearLocal,
    deliverCurrentProfile,
    extractionError,
    extract,
    fallbackText,
    profile,
    readiness,
    settings,
    toggleFormat,
    updateDeliveryMode
  };
}
