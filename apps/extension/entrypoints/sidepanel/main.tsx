import { Clipboard, Download, RefreshCcw, Trash2 } from "lucide-react";
import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { toast, Toaster } from "sonner";
import { browser } from "wxt/browser";
import type { ExportFormat, Profile } from "@linkedin-profile-exporter/core/schema";
import { defaultSettings, type Settings } from "@linkedin-profile-exporter/core/settings";
import { Button } from "../../src/components/button";
import { copyProfileExport, isTextExportFormat } from "../../src/export-download";
import type { RuntimeMessage, RuntimeResponse } from "../../src/messaging";
import { clearExtractedState, loadExtractedProfile, loadSettings, saveExtractedProfile } from "../../src/storage";
import "../../src/styles.css";

function SidePanelApp() {
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [format, setFormat] = useState<ExportFormat>("json");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void loadSettings().then(setSettings).catch(() => setSettings(defaultSettings));
    void loadExtractedProfile().then(setProfile);
  }, []);

  async function extract() {
    setBusy(true);
    const response = await sendToActiveTab({ type: "extract-profile", settings });
    setBusy(false);
    if (!response.ok) {
      toast.error(response.error);
      return;
    }
    if ("profile" in response) {
      setProfile(response.profile);
      await saveExtractedProfile(response.profile, settings);
      toast.success("Profile extracted locally");
    }
  }

  async function deliver(delivery: Settings["deliveryMode"]) {
    if (!profile) return;
    if (delivery === "clipboard") {
      if (!isTextExportFormat(format)) {
        toast.error("XLSX is a binary workbook and must be downloaded");
        return;
      }
      await copyProfileExport(profile, format, settings.filenameTemplate);
      toast.success(`Copied ${format}`);
      return;
    }
    const response = (await browser.runtime.sendMessage({
      type: "download-export",
      profile,
      format,
      filenameTemplate: settings.filenameTemplate
    } satisfies RuntimeMessage)) as RuntimeResponse;
    if (response.ok) toast.success(`Downloaded ${format}`);
    else toast.error(response.error);
  }

  async function clearLocal() {
    setProfile(null);
    await clearExtractedState();
    toast.success("Local extracted profile cleared");
  }

  return (
    <main className="min-w-[320px] space-y-4 p-4">
      <header className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-base font-semibold">Review</h1>
          <p className="text-xs text-[#58665f]">{profile ? profile.identity.name : "No profile loaded"}</p>
        </div>
        <Button disabled={busy} onClick={() => void extract()}>
          <RefreshCcw size={16} />
          {busy ? "Extracting" : "Extract"}
        </Button>
      </header>

      {profile ? (
        <>
          <section className="rounded-md border border-[#cbd8d1] bg-white p-3 text-sm">
            <h2 className="font-medium">{profile.identity.name}</h2>
            <p className="text-[#58665f]">{profile.identity.headline}</p>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <Metric label="Work" value={profile.work.length} />
              <Metric label="Education" value={profile.education.length} />
              <Metric label="Skills" value={profile.skills.length} />
              <Metric label="Diagnostics" value={profile.diagnostics.length} />
            </dl>
          </section>

          <section className="rounded-md border border-[#cbd8d1] bg-white p-3 text-sm">
            <label className="grid gap-1">
              Format
              <select className="rounded-md border border-[#cbd8d1] p-2" value={format} onChange={(event) => setFormat(event.currentTarget.value as ExportFormat)}>
                {settings.outputFormats.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button onClick={() => void deliver("download")}>
                <Download size={16} />
                Download
              </Button>
              <Button variant="secondary" disabled={!isTextExportFormat(format)} onClick={() => void deliver("clipboard")}>
                <Clipboard size={16} />
                Copy
              </Button>
              <Button variant="ghost" onClick={() => void clearLocal()}>
                <Trash2 size={16} />
                Clear
              </Button>
            </div>
          </section>

          {profile.diagnostics.length ? (
            <section className="rounded-md border border-[#cbd8d1] bg-white p-3 text-xs">
              <h2 className="text-sm font-medium">Diagnostics</h2>
              <ul className="mt-2 space-y-1">
                {profile.diagnostics.map((diagnostic) => (
                  <li key={`${diagnostic.code}-${diagnostic.message}`}>
                    <span className="font-medium">{diagnostic.level}</span> {diagnostic.code}: {diagnostic.message}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      ) : (
        <p className="rounded-md border border-[#cbd8d1] bg-white p-3 text-sm text-[#58665f]">Run extraction from a LinkedIn profile tab or load a persisted local profile.</p>
      )}
      <Toaster position="bottom-center" />
    </main>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-[#58665f]">{label}</dt>
      <dd className="text-base font-semibold">{value}</dd>
    </div>
  );
}

async function sendToActiveTab(message: RuntimeMessage): Promise<RuntimeResponse> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return { ok: false, error: "No active tab is available." };
  return (await browser.tabs.sendMessage(tab.id, message)) as RuntimeResponse;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <SidePanelApp />
  </StrictMode>
);
