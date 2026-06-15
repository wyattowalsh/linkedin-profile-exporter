import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { ReadinessResult } from "@linkedin-profile-exporter/core/extraction";
import type { ExportFormat, Profile } from "@linkedin-profile-exporter/core/schema";
import { defaultSettings, type Settings } from "@linkedin-profile-exporter/core/settings";
import { browser } from "wxt/browser";
import { activeProfileTabReadiness, sendToActiveProfileTab } from "./active-tab";
import type { ExtractionStatus, RuntimeMessage } from "./messaging";
import { deliverProfileFormats, formatsForDelivery } from "./profile-delivery";
import {
  clearExtractedState,
  loadExtractedProfile,
  loadSettings,
  saveExtractedProfile,
  saveSettings
} from "./storage";

const EXTRACT_PROFILE_TIMEOUT_MS = 10_000;

export function useProfileExporterController() {
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [readiness, setReadiness] = useState<ReadinessResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [fallbackText, setFallbackText] = useState("");
  const [extractionError, setExtractionError] = useState("");
  const [extractionStatus, setExtractionStatus] = useState<ExtractionStatus | null>(null);
  const clearLocalPromiseRef = useRef<Promise<void>>(Promise.resolve());
  const extractionRequestIdRef = useRef<string | null>(null);

  useEffect(() => {
    void loadSettings()
      .then(setSettings)
      .catch(() => setSettings(defaultSettings));
    void loadExtractedProfile().then(setProfile);

    void activeProfileTabReadiness()
      .then((activeReadiness) => {
        setReadiness(activeReadiness);
        if (activeReadiness.state === "unavailable") return null;
        return sendToActiveProfileTab({ type: "profile-readiness" });
      })
      .then((response) => {
        if (!response) return;
        if (response.ok && "readiness" in response) setReadiness(response.readiness);
        else if (!response.ok) setReadiness({ state: "needs-action", reason: response.error });
      })
      .catch(() => undefined);

    const handleRuntimeMessage = (message: RuntimeMessage) => {
      if (message.type !== "extraction-status") return undefined;
      if (message.status.requestId !== extractionRequestIdRef.current) return undefined;
      setExtractionStatus(message.status);
      return undefined;
    };
    browser.runtime.onMessage.addListener(handleRuntimeMessage);
    return () => browser.runtime.onMessage.removeListener(handleRuntimeMessage);
  }, []);

  async function extract() {
    const extracted = await extractFromActiveProfileTab();
    if (extracted && settings.automationMode === "auto-export") {
      await deliverCurrentProfile(extracted, settings.deliveryMode);
    }
  }

  async function extractFromActiveProfileTab(
    options: { requireReady?: boolean } = {}
  ): Promise<Profile | null> {
    const requireReady = options.requireReady ?? settings.automationMode === "manual";
    if (requireReady && readiness?.state !== "ready") {
      toast.error("Open a ready LinkedIn profile before manual extraction");
      return null;
    }

    setBusy(true);
    setFallbackText("");
    setExtractionError("");
    const requestId = createExtractionRequestId();
    extractionRequestIdRef.current = requestId;
    setExtractionStatus({
      detail: "Confirming the active LinkedIn tab.",
      label: "Checking profile",
      phase: "checking-readiness",
      requestId
    });

    try {
      const response = await withTimeout(
        sendToActiveProfileTab({ type: "extract-profile", requestId, settings }),
        EXTRACT_PROFILE_TIMEOUT_MS,
        "LinkedIn profile extraction timed out. Reload the profile tab, then try again."
      );

      if (!response.ok) {
        setExtractionStatus({
          detail: response.error,
          label: "Extraction failed",
          phase: "failed",
          requestId
        });
        setExtractionError(response.error);
        toast.error(response.error);
        return null;
      }
      if ("profile" in response) {
        setExtractionStatus({
          detail: "Profile data is ready for review.",
          label: "Extraction complete",
          phase: "complete",
          requestId
        });
        setProfile(response.profile);
        await saveExtractedProfile(response.profile, settings);
        toast.success(
          settings.privacy.persistExtractedData
            ? "Profile extracted and kept locally"
            : "Profile extracted locally"
        );
        return response.profile;
      }
      return null;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setExtractionStatus({
        detail: message,
        label: "Extraction failed",
        phase: "failed",
        requestId
      });
      setExtractionError(message);
      toast.error(message);
      return null;
    } finally {
      if (extractionRequestIdRef.current === requestId) {
        extractionRequestIdRef.current = null;
      }
      setBusy(false);
    }
  }

  async function updateDeliveryMode(deliveryMode: Settings["deliveryMode"]) {
    const next = { ...settings, deliveryMode };
    setSettings(next);
    await saveSettings(next);
    toast.success(
      deliveryMode === "clipboard" ? "Clipboard delivery selected" : "Download delivery selected"
    );
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

  async function deliverCurrentProfile(
    sourceProfile?: Profile | null,
    deliveryMode = settings.deliveryMode
  ) {
    const formats = formatsForDelivery(deliveryMode, settings.outputFormats);
    if (!formats.length) {
      toast.error("No copyable text formats are selected");
      return;
    }

    const profileToDeliver = await profileForDelivery(sourceProfile ?? profile, {
      refreshFromActiveTab: sourceProfile === undefined
    });
    if (!profileToDeliver) return;

    const results = await deliverProfileFormats(profileToDeliver, settings, deliveryMode);
    const fallback = results.find((result) => result.fallbackText)?.fallbackText;
    setFallbackText(fallback ?? "");

    const failures = results.filter((result) => !result.ok);
    if (failures.length) {
      toast.error(failures[0]?.error ?? "Export failed");
      return;
    }

    toast.success(
      deliveryMode === "clipboard" ? "Copied selected formats" : "Downloaded selected formats"
    );
  }

  async function clearLocal() {
    setProfile(null);
    setFallbackText("");
    setExtractionError("");
    setExtractionStatus(null);
    const clearLocalPromise = clearExtractedState();
    clearLocalPromiseRef.current = clearLocalPromise;
    await clearLocalPromise;
    toast.success("Local extracted profile cleared");
  }

  async function profileForDelivery(
    sourceProfile: Profile | null,
    options: { refreshFromActiveTab: boolean }
  ): Promise<Profile | null> {
    if (!options.refreshFromActiveTab) {
      return sourceProfile ?? (await extractFromActiveProfileTab({ requireReady: false }));
    }

    await clearLocalPromiseRef.current.catch(() => undefined);
    const freshProfile = await extractFromActiveProfileTab({ requireReady: false });
    if (freshProfile) return freshProfile;
    if (!sourceProfile) return null;

    toast.warning("Using cached profile because fresh extraction failed");
    return sourceProfile;
  }

  return {
    busy,
    clearLocal,
    deliverCurrentProfile,
    extractionError,
    extractionStatus,
    extract,
    fallbackText,
    profile,
    readiness,
    settings,
    toggleFormat,
    updateDeliveryMode
  };
}

function createExtractionRequestId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `extract-${Date.now()}-${Math.random()}`;
}

async function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(message)), ms);
      })
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
