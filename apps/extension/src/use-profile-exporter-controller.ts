import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  detectLinkedInProfileReadiness,
  type ReadinessResult
} from "@linkedin-profile-exporter/core/extraction";
import type { ExportFormat, Profile } from "@linkedin-profile-exporter/core/schema";
import { defaultSettings, type Settings } from "@linkedin-profile-exporter/core/settings";
import { browser } from "wxt/browser";
import { currentProfileTabForExtensionContext, sendToActiveProfileTab } from "./active-tab";
import { formatsForDelivery } from "./delivery-formats";
import { createExtractionRequestId } from "./extraction-request-id";
import type { ExtractionStatus, RuntimeMessage, RuntimeResponse } from "./messaging";
import {
  hasIncompleteCoverageDiagnostics,
  normalizeProfileUrl,
  profileUrlsMatch,
  shouldRefreshIncompleteCachedProfile
} from "./profile-cache";
import {
  clearExtractedState,
  loadExtractedProfile,
  loadSettings,
  saveExtractedProfile,
  saveSettings
} from "./storage";

const EXTRACT_PROFILE_TIMEOUT_MS = 90_000;
const initialAutoExtracts = new Map<string, Promise<Profile | null>>();
const incompleteCacheRefreshes = new Map<string, number>();
const activeProfileExtractions = new Map<
  string,
  { promise: Promise<RuntimeResponse>; requestId: string }
>();

type ExtractOptions = {
  allowIncompleteCachedProfile?: boolean;
  preferCachedProfile?: boolean;
  refreshPolicy?: "force-refresh" | "prefer-cache";
};

export function useProfileExporterController(options: { autoExtractOnReady?: boolean } = {}) {
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [readiness, setReadiness] = useState<ReadinessResult | null>(null);
  const [readinessChecked, setReadinessChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fallbackText, setFallbackText] = useState("");
  const [extractionError, setExtractionError] = useState("");
  const [extractionStatus, setExtractionStatus] = useState<ExtractionStatus | null>(null);
  const [firstPaintReady, setFirstPaintReady] = useState(false);
  const clearLocalPromiseRef = useRef<Promise<void>>(Promise.resolve());
  const extractionRequestIdRef = useRef<string | null>(null);
  const initialAutoExtractStartedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    void loadSettings()
      .then(setSettings)
      .catch(() => setSettings(defaultSettings))
      .finally(() => setSettingsLoaded(true));
    void loadExtractedProfile()
      .then(setProfile)
      .finally(() => setProfileLoaded(true));

    void refreshReadiness();

    const handleRuntimeMessage = (message: RuntimeMessage) => {
      if (message.type !== "extraction-status") return undefined;
      if (message.status.requestId !== extractionRequestIdRef.current) return undefined;
      setExtractionStatus(message.status);
      return undefined;
    };
    browser.runtime.onMessage.addListener(handleRuntimeMessage);
    return () => browser.runtime.onMessage.removeListener(handleRuntimeMessage);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const frame = requestAnimationFrame(() => {
      if (!cancelled) setFirstPaintReady(true);
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    if (!options.autoExtractOnReady) return;
    if (settings.automationMode === "manual") return;
    if (!settingsLoaded || !profileLoaded || !firstPaintReady || !readinessChecked) return;
    if (readiness?.state !== "ready") return;
    const autoExtractKey = normalizeProfileUrl(readiness.profileUrl);
    if (!autoExtractKey) return;
    if (busy || initialAutoExtractStartedRef.current.has(autoExtractKey)) return;
    const cachedProfile = cachedCurrentProfile(profile, readiness.profileUrl, {
      allowIncompleteCachedProfile: true
    });
    if (cachedProfile) return;
    let cancelled = false;
    void (async () => {
      const storedProfile = cachedCurrentProfile(
        await loadExtractedProfile(),
        readiness.profileUrl,
        {
          allowIncompleteCachedProfile: true
        }
      );
      if (cancelled) return;
      if (storedProfile) {
        setProfile(storedProfile);
        return;
      }
      if (busy || initialAutoExtractStartedRef.current.has(autoExtractKey)) return;
      initialAutoExtractStartedRef.current.add(autoExtractKey);
      const existing = initialAutoExtracts.get(autoExtractKey);
      const autoExtract =
        existing ?? extract({ allowIncompleteCachedProfile: true, preferCachedProfile: true });
      if (!existing) {
        initialAutoExtracts.set(autoExtractKey, autoExtract);
        void autoExtract.finally(() => {
          window.setTimeout(() => {
            if (initialAutoExtracts.get(autoExtractKey) === autoExtract) {
              initialAutoExtracts.delete(autoExtractKey);
            }
          }, 5_000);
        });
      } else {
        setBusy(true);
      }
      void autoExtract
        .then((extracted) => {
          if (!cancelled && extracted) setProfile(extracted);
        })
        .finally(() => {
          if (!cancelled && existing) setBusy(false);
        });
    })();
    return () => {
      cancelled = true;
    };
  }, [
    busy,
    firstPaintReady,
    options.autoExtractOnReady,
    profile,
    profileLoaded,
    readiness?.profileUrl,
    readiness?.state,
    readinessChecked,
    settings.automationMode,
    settingsLoaded
  ]);

  async function refreshReadiness(): Promise<ReadinessResult | null> {
    setReadinessChecked(false);
    try {
      const response = await sendToActiveProfileTab({ type: "profile-readiness" });
      if (response.ok && "readiness" in response) {
        setReadiness(response.readiness);
        return response.readiness;
      }
      if (!response.ok) {
        const nextReadiness: ReadinessResult = { state: "needs-action", reason: response.error };
        setReadiness(nextReadiness);
        return nextReadiness;
      }
      return null;
    } catch (error) {
      const nextReadiness: ReadinessResult = {
        state: "needs-action",
        reason: error instanceof Error ? error.message : String(error)
      };
      setReadiness(nextReadiness);
      return nextReadiness;
    } finally {
      setReadinessChecked(true);
    }
  }

  async function extract(options: ExtractOptions = {}): Promise<Profile | null> {
    const extractionOptions: ExtractOptions = {};
    if (options.preferCachedProfile ?? true) extractionOptions.preferCachedProfile = true;
    if (options.allowIncompleteCachedProfile ?? true) {
      extractionOptions.allowIncompleteCachedProfile = true;
    }
    if (options.refreshPolicy) {
      extractionOptions.refreshPolicy = options.refreshPolicy;
    }
    const extracted = await extractFromActiveProfileTab(extractionOptions);
    if (extracted && settings.automationMode === "auto-export") {
      await deliverCurrentProfile(extracted, settings.deliveryMode);
    }
    return extracted;
  }

  async function extractFromActiveProfileTab(
    options: ExtractOptions & { requireReady?: boolean } = {}
  ): Promise<Profile | null> {
    const requireReady = options.requireReady ?? settings.automationMode === "manual";
    if (requireReady && readiness?.state !== "ready") {
      toast.error("Open a ready LinkedIn profile before manual extraction");
      return null;
    }
    const currentProfileUrl = (await currentProfileUrlForCache()) ?? readiness?.profileUrl;
    if (requireReady && !currentProfileUrl) {
      toast.error("Open a ready LinkedIn profile before manual extraction");
      return null;
    }
    const cachedProfile =
      cachedCurrentProfile(profile, currentProfileUrl, options) ??
      cachedCurrentProfile(await loadExtractedProfile(), currentProfileUrl, options);
    if (options.preferCachedProfile && cachedProfile) {
      setExtractionError("");
      setExtractionStatus(null);
      return cachedProfile;
    }

    setBusy(true);
    setFallbackText("");
    setExtractionError("");
    const activeExtractionKey = normalizeProfileUrl(currentProfileUrl);
    const activeExtraction = activeExtractionKey
      ? activeProfileExtractions.get(activeExtractionKey)
      : undefined;
    if (activeExtraction) {
      extractionRequestIdRef.current = activeExtraction.requestId;
      setExtractionStatus({
        detail: "A previous extraction is still reading LinkedIn detail pages.",
        label: "Extraction still running",
        phase: "recovering-sections",
        requestId: activeExtraction.requestId
      });
      try {
        const response = await withTimeout(
          activeExtraction.promise,
          EXTRACT_PROFILE_TIMEOUT_MS,
          "LinkedIn profile extraction is still finishing. Wait for the current extraction to complete before starting another."
        );
        return await handleExtractionResponse(response, activeExtraction.requestId);
      } catch (error) {
        clearActiveProfileExtraction(activeExtractionKey, activeExtraction.requestId);
        const message = error instanceof Error ? error.message : String(error);
        setExtractionStatus({
          detail: message,
          label: "Extraction still running",
          phase: "recovering-sections",
          requestId: activeExtraction.requestId
        });
        setExtractionError(message);
        toast.error(message);
        return null;
      } finally {
        if (extractionRequestIdRef.current === activeExtraction.requestId) {
          extractionRequestIdRef.current = null;
        }
        setBusy(false);
      }
    }
    const requestId = createExtractionRequestId();
    extractionRequestIdRef.current = requestId;
    setExtractionStatus({
      detail: "Confirming the active LinkedIn tab.",
      label: "Checking profile",
      phase: "checking-readiness",
      requestId
    });

    try {
      const extractionPromise = sendToActiveProfileTab({
        type: "extract-profile",
        requestId,
        settings
      });
      if (activeExtractionKey) {
        activeProfileExtractions.set(activeExtractionKey, {
          promise: extractionPromise,
          requestId
        });
        void extractionPromise
          .finally(() => {
            if (activeProfileExtractions.get(activeExtractionKey)?.requestId === requestId) {
              activeProfileExtractions.delete(activeExtractionKey);
            }
          })
          .catch(() => undefined);
      }
      const response = await withTimeout(
        extractionPromise,
        EXTRACT_PROFILE_TIMEOUT_MS,
        "LinkedIn profile extraction timed out before the exporter could finish reading the page."
      );

      return await handleExtractionResponse(response, requestId);
    } catch (error) {
      clearActiveProfileExtraction(activeExtractionKey, requestId);
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

  async function handleExtractionResponse(
    response: RuntimeResponse,
    requestId: string
  ): Promise<Profile | null> {
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
      recordIncompleteCacheRefresh(response.profile);
      toast.success(
        settings.privacy.persistExtractedData
          ? "Profile extracted and kept locally"
          : "Profile extracted locally"
      );
      return response.profile;
    }
    return null;
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

    const { deliverProfileFormats } = await import("./profile-delivery");
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
    clearIncompleteCacheRefreshes();
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
    const cachedProfile = cachedCurrentProfile(sourceProfile, await currentProfileUrlForCache());
    if (cachedProfile) return cachedProfile;

    const freshProfile = await extractFromActiveProfileTab({ requireReady: false });
    if (freshProfile) return freshProfile;
    if (!sourceProfile) return null;

    toast.warning("Using cached profile because fresh extraction failed");
    return sourceProfile;
  }

  function cachedCurrentProfile(
    candidate = profile,
    currentProfileUrl = readiness?.profileUrl,
    options: Pick<ExtractOptions, "allowIncompleteCachedProfile" | "refreshPolicy"> = {}
  ): Profile | null {
    if (!candidate || !currentProfileUrl) return null;
    if (readiness?.state === "unavailable") return null;
    const candidateUrl = candidate.identity.profileUrl ?? candidate.metadata.sourceUrl;
    if (!profileUrlsMatch(candidateUrl, currentProfileUrl)) return null;
    if (options.refreshPolicy === "force-refresh") {
      return null;
    }
    const normalizedUrl = normalizeProfileUrl(currentProfileUrl);
    if (
      !options.allowIncompleteCachedProfile &&
      normalizedUrl &&
      shouldRefreshIncompleteCachedProfile(candidate, incompleteCacheRefreshes.get(normalizedUrl))
    ) {
      return null;
    }
    return candidate;
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
    readinessChecked,
    refreshReadiness,
    settings,
    settingsLoaded,
    toggleFormat,
    updateDeliveryMode
  };
}

async function currentProfileUrlForCache(): Promise<string | undefined> {
  const profileTab = await currentProfileTabForExtensionContext();
  return detectLinkedInProfileReadiness(profileTab?.url ?? "").profileUrl;
}

function recordIncompleteCacheRefresh(profile: Profile): void {
  if (!hasIncompleteCoverageDiagnostics(profile)) return;
  const normalizedUrl = normalizeProfileUrl(
    profile.identity.profileUrl ?? profile.metadata.sourceUrl
  );
  if (normalizedUrl) incompleteCacheRefreshes.set(normalizedUrl, Date.now());
}

function clearIncompleteCacheRefreshes(): void {
  incompleteCacheRefreshes.clear();
}

function clearActiveProfileExtraction(
  activeExtractionKey: string | undefined,
  requestId: string
): void {
  if (!activeExtractionKey) return;
  if (activeProfileExtractions.get(activeExtractionKey)?.requestId === requestId) {
    activeProfileExtractions.delete(activeExtractionKey);
  }
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
