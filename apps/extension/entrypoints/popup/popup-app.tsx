import { AlertCircle, Check, CheckCircle2, Clipboard, Download, FileText, RefreshCcw, Settings, Trash2, XCircle } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { browser } from "wxt/browser";
import { detectLinkedInProfileReadiness } from "@linkedin-profile-exporter/core/extraction";
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
      else if (!response.ok) setReadiness({ state: "needs-action", reason: response.error });
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

  const status = statusMeta(readiness?.state);
  const deliveryIcon = settings.deliveryMode === "clipboard" ? <Clipboard size={16} /> : <Download size={16} />;

  return (
    <main className="w-[420px] bg-[#f4f7f6] text-[#17201b]">
      <header className="border-b border-[#dde6e2] bg-white px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-[#163c35] text-white">
              <FileText size={18} />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-base font-semibold">Profile Exporter</h1>
              <p className="mt-0.5 truncate text-xs text-[#5f6d66]">{profile?.identity.name ?? workflowLabel(settings.automationMode)}</p>
            </div>
          </div>
          <Button className="size-9 shrink-0 px-0" variant="ghost" title="Open settings" onClick={() => browser.runtime.openOptionsPage()}>
            <Settings size={17} />
          </Button>
        </div>
      </header>

      <div className="space-y-3 p-4">
        <motion.section initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="rounded-md border border-[#d3ded9] bg-white p-3 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs font-medium ${status.className}`}>
                  {status.icon}
                  {status.label}
                </span>
                <span className="truncate text-xs text-[#6a766f]">{deliveryLabel(settings.deliveryMode)}</span>
              </div>
              <p className="mt-2 line-clamp-2 text-sm leading-5 text-[#46554e]">{readiness?.reason ?? "Checking the active tab."}</p>
            </div>
            <Button className="h-10 shrink-0 px-3" disabled={busy || readiness?.state === "unavailable"} onClick={extract}>
              <RefreshCcw size={16} className={busy ? "animate-spin" : undefined} />
              {busy ? "Extracting" : "Extract"}
            </Button>
          </div>
        </motion.section>

        {profile ? (
          <section className="rounded-md border border-[#d3ded9] bg-white p-3 shadow-sm">
            <div className="min-w-0">
              <h2 className="truncate text-sm font-semibold">{profile.identity.name}</h2>
              {profile.identity.headline ? <p className="mt-1 line-clamp-2 text-xs leading-5 text-[#5f6d66]">{profile.identity.headline}</p> : null}
            </div>
            <dl className="mt-3 grid grid-cols-4 gap-2">
              <Metric label="Roles" value={profile.work.length} />
              <Metric label="Schools" value={profile.education.length} />
              <Metric label="Skills" value={profile.skills.length} />
              <Metric label="Notes" value={profile.diagnostics.length} tone={profile.diagnostics.length ? "amber" : "neutral"} />
            </dl>
          </section>
        ) : (
          <section className="rounded-md border border-dashed border-[#c7d5ce] bg-white px-3 py-4 text-center shadow-sm">
            <p className="text-sm font-medium">No profile loaded</p>
            <p className="mt-1 text-xs text-[#6a766f]">Use a LinkedIn profile tab, then extract.</p>
          </section>
        )}

        <section className="rounded-md border border-[#d3ded9] bg-white p-3 shadow-sm">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Formats</h2>
            <span className="text-xs text-[#6a766f]">
              {selectedFormats.length}/{EXPORT_FORMATS.length}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {EXPORT_FORMATS.map((format) => (
              <FormatToggle
                key={format}
                checked={selectedFormats.includes(format)}
                disabled={settings.deliveryMode === "clipboard" && !isTextExportFormat(format)}
                format={format}
                onChange={() => toggleFormat(format)}
              />
            ))}
          </div>
          {copyBlockedFormats.length ? (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-[#8a5b21]">
              <AlertCircle size={13} />
              XLSX stays download-only.
            </p>
          ) : null}
        </section>

        {fallbackText ? (
          <textarea
            className="h-28 w-full resize-none rounded-md border border-[#cbd8d1] bg-white p-2 text-xs text-[#24322c]"
            readOnly
            value={fallbackText}
            aria-label="Clipboard fallback text"
          />
        ) : null}

        <footer className="grid grid-cols-[auto_1fr] gap-2">
          <Button className="size-10 px-0" variant="secondary" title="Clear local profile" onClick={() => void clearLocal()}>
            <Trash2 size={16} />
          </Button>
          <Button className="h-10 justify-center" disabled={!profile} onClick={() => void deliverAll()}>
            {deliveryIcon}
            {settings.deliveryMode === "clipboard" ? "Copy selected" : "Download selected"}
          </Button>
        </footer>
      </div>
    </main>
  );
}

async function sendToActiveTab(message: RuntimeMessage): Promise<RuntimeResponse> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return { ok: false, error: "No active tab is available." };
  const tabReadiness = detectLinkedInProfileReadiness(tab.url ?? "");
  if (tabReadiness.state === "unavailable") {
    if (message.type === "profile-readiness") return { ok: true, readiness: tabReadiness };
    return { ok: false, error: tabReadiness.reason };
  }

  try {
    return (await browser.tabs.sendMessage(tab.id, message)) as RuntimeResponse;
  } catch {
    return {
      ok: false,
      error: "LinkedIn profile tab is open, but the exporter content script is not available yet. Reload the profile tab, then try again."
    };
  }
}

function statusMeta(state: "ready" | "unavailable" | "needs-action" | undefined) {
  if (state === "ready") {
    return {
      label: "Ready",
      className: "border-[#a8d5c3] bg-[#eaf7f1] text-[#14543f]",
      icon: <CheckCircle2 size={13} />
    };
  }
  if (state === "unavailable") {
    return {
      label: "Not LinkedIn",
      className: "border-[#efc0bb] bg-[#fff1ef] text-[#8a332b]",
      icon: <XCircle size={13} />
    };
  }
  return {
    label: "Needs Action",
    className: "border-[#e7d29a] bg-[#fff7df] text-[#76561a]",
    icon: <AlertCircle size={13} />
  };
}

function workflowLabel(mode: string): string {
  if (mode === "auto-export") return "Auto export";
  if (mode === "manual") return "Manual extraction";
  return "Review before export";
}

function deliveryLabel(mode: string): string {
  return mode === "clipboard" ? "Clipboard" : "Downloads";
}

function formatLabel(format: ExportFormat): string {
  if (format === "json-resume") return "Resume";
  return format.toUpperCase();
}

function Metric({ label, value, tone = "neutral" }: { label: string; value: number; tone?: "neutral" | "amber" }) {
  return (
    <div className={`rounded-md border px-2 py-2 ${tone === "amber" ? "border-[#ead9a6] bg-[#fff8e6]" : "border-[#e0e8e4] bg-[#f7faf9]"}`}>
      <dt className="truncate text-[11px] text-[#68766f]">{label}</dt>
      <dd className="mt-0.5 text-base font-semibold leading-none">{value}</dd>
    </div>
  );
}

function FormatToggle({
  checked,
  disabled,
  format,
  onChange
}: {
  checked: boolean;
  disabled: boolean;
  format: ExportFormat;
  onChange: () => void;
}) {
  return (
    <label
      className={`flex h-10 cursor-pointer items-center justify-between gap-1 rounded-md border px-2 text-xs font-medium transition ${
        checked ? "border-[#1f6b54] bg-[#e8f5ef] text-[#174c3c]" : "border-[#d6e0dc] bg-[#f8faf9] text-[#46554e]"
      } ${disabled ? "cursor-not-allowed opacity-45" : "hover:border-[#9bbdaf]"}`}
      title={disabled ? "Clipboard supports text formats only" : format}
    >
      <input className="sr-only" type="checkbox" checked={checked} disabled={disabled} onChange={onChange} />
      <span className="truncate">{formatLabel(format)}</span>
      <Check size={13} className={checked ? "opacity-100" : "opacity-0"} />
    </label>
  );
}
