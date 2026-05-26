import { Clipboard, Download, RefreshCcw, Settings, Trash2 } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { browser } from "wxt/browser";
import { EXPORT_FORMATS } from "@linkedin-profile-exporter/core/exporters";
import type { ExportFormat, Profile } from "@linkedin-profile-exporter/core/schema";
import { defaultSettings } from "@linkedin-profile-exporter/core/settings";
import { Button } from "../../src/components/button";
import { copyProfileExport, isTextExportFormat, profileToClipboardText } from "../../src/export-download";
import type { RuntimeMessage, RuntimeResponse } from "../../src/messaging";
import { clearExtractedState, loadExtractedProfile, loadSettings, saveExtractedProfile } from "../../src/storage";
import { useExtensionStore } from "../../src/state/store";

export function PopupApp() {
  const { readiness, profile, selectedFormats, settings, setReadiness, setProfile, setSettings, toggleFormat, clear } =
    useExtensionStore();
  const [busy, setBusy] = useState(false);
  const [fallbackText, setFallbackText] = useState("");

  const copyBlockedFormats = useMemo(
    () => (settings.deliveryMode === "clipboard" ? selectedFormats.filter((format) => !isTextExportFormat(format)) : []),
    [selectedFormats, settings.deliveryMode]
  );

  useEffect(() => {
    void loadSettings()
      .then(setSettings)
      .catch(() => setSettings(defaultSettings));
    void loadExtractedProfile().then((stored) => {
      if (stored) setProfile(stored);
    });
    void sendToActiveTab({ type: "profile-readiness" }).then((response) => {
      if (response.ok && "readiness" in response) setReadiness(response.readiness);
    });
  }, [setProfile, setReadiness, setSettings]);

  async function extract() {
    if (settings.automationMode === "manual" && readiness?.state !== "ready") {
      toast.error("Open a ready LinkedIn profile before manual extraction");
      return;
    }
    setBusy(true);
    setFallbackText("");
    const response = await sendToActiveTab({ type: "extract-profile", settings });
    setBusy(false);
    if (!response.ok) {
      toast.error(response.error);
      return;
    }
    if ("profile" in response) {
      setProfile(response.profile);
      await saveExtractedProfile(response.profile, settings);
      toast.success(settings.privacy.persistExtractedData ? "Profile extracted and kept locally" : "Profile extracted locally");
      if (settings.automationMode === "auto-export") await deliverAll(response.profile);
    }
  }

  async function deliver(format: ExportFormat, sourceProfile: Profile = profile!) {
    if (!sourceProfile) return;
    if (settings.deliveryMode === "clipboard") {
      if (!isTextExportFormat(format)) {
        toast.error("XLSX is a binary workbook and must be downloaded");
        return;
      }
      try {
        await copyProfileExport(sourceProfile, format, settings.filenameTemplate);
        toast.success(`Copied ${format}`);
      } catch (error) {
        const text = await profileToClipboardText(sourceProfile, format, settings.filenameTemplate);
        setFallbackText(text);
        toast.error(error instanceof Error ? error.message : "Clipboard access was denied");
      }
      return;
    }

    const response = (await browser.runtime.sendMessage({
      type: "download-export",
      profile: sourceProfile,
      format,
      filenameTemplate: settings.filenameTemplate
    } satisfies RuntimeMessage)) as RuntimeResponse;
    if (response.ok) toast.success(`Downloaded ${format}`);
    else toast.error(response.error);
  }

  async function deliverAll(sourceProfile: Profile = profile!) {
    const formats = settings.deliveryMode === "clipboard" ? selectedFormats.filter(isTextExportFormat) : selectedFormats;
    await Promise.all(formats.map((format) => deliver(format, sourceProfile)));
  }

  async function clearLocal() {
    clear();
    setFallbackText("");
    await clearExtractedState();
    toast.success("Local extracted profile cleared");
  }

  return (
    <main className="w-[380px] space-y-4 p-4">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-base font-semibold">Profile Exporter</h1>
          <p className="text-xs text-[#58665f]">{readiness?.reason ?? "Checking active tab"}</p>
        </div>
        <Button variant="ghost" title="Open settings" onClick={() => browser.runtime.openOptionsPage()}>
          <Settings size={16} />
        </Button>
      </header>

      <motion.section initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="rounded-md border border-[#cbd8d1] bg-white p-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <span className="text-sm font-medium">{readiness?.state ?? "needs-action"}</span>
            <div className="text-xs text-[#58665f]">
              {settings.automationMode} / {settings.deliveryMode}
            </div>
          </div>
          <Button disabled={busy || readiness?.state === "unavailable"} onClick={extract}>
            <RefreshCcw size={16} />
            {busy ? "Extracting" : "Extract"}
          </Button>
        </div>
        {profile ? (
          <div className="mt-3 space-y-1 text-sm">
            <div className="font-medium">{profile.identity.name}</div>
            <div className="text-[#58665f]">{profile.identity.headline}</div>
            <div className="text-xs text-[#58665f]">
              {profile.work.length} roles, {profile.education.length} schools, {profile.skills.length} skills, {profile.diagnostics.length} diagnostics
            </div>
          </div>
        ) : null}
      </motion.section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium">Formats</h2>
        <div className="grid grid-cols-2 gap-2">
          {EXPORT_FORMATS.map((format) => (
            <label key={format} className="flex items-center gap-2 rounded-md border border-[#cbd8d1] bg-white p-2 text-sm">
              <input
                type="checkbox"
                checked={selectedFormats.includes(format)}
                disabled={settings.deliveryMode === "clipboard" && !isTextExportFormat(format)}
                onChange={() => toggleFormat(format)}
              />
              {format}
            </label>
          ))}
        </div>
        {copyBlockedFormats.length ? <p className="text-xs text-[#8a5b21]">XLSX is binary and remains download-only.</p> : null}
      </section>

      {fallbackText ? (
        <textarea className="h-28 w-full rounded-md border border-[#cbd8d1] p-2 text-xs" readOnly value={fallbackText} aria-label="Clipboard fallback text" />
      ) : null}

      <footer className="flex items-center justify-between gap-2">
        <Button variant="secondary" onClick={() => void clearLocal()}>
          <Trash2 size={16} />
          Clear
        </Button>
        <Button disabled={!profile} onClick={() => void deliverAll()}>
          {settings.deliveryMode === "clipboard" ? <Clipboard size={16} /> : <Download size={16} />}
          {settings.deliveryMode === "clipboard" ? "Copy" : "Download"}
        </Button>
      </footer>
    </main>
  );
}

async function sendToActiveTab(message: RuntimeMessage): Promise<RuntimeResponse> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return { ok: false, error: "No active tab is available." };
  return (await browser.tabs.sendMessage(tab.id, message)) as RuntimeResponse;
}
