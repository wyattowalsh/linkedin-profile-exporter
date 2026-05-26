import { Check, Clipboard, Download, Trash2 } from "lucide-react";
import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { toast, Toaster } from "sonner";
import { EXPORT_FORMATS } from "@linkedin-profile-exporter/core/exporters";
import type { ExportFormat } from "@linkedin-profile-exporter/core/schema";
import { defaultSettings, settingsSchema, type Settings } from "@linkedin-profile-exporter/core/settings";
import { Button } from "../../src/components/button";
import "../../src/styles.css";
import { clearExtractedState, loadSettings, saveSettings } from "../../src/storage";

function OptionsApp() {
  const [settings, setSettings] = useState<Settings>(defaultSettings);

  useEffect(() => {
    void loadSettings()
      .then(setSettings)
      .catch(() => setSettings(defaultSettings));
  }, []);

  async function save(next: Settings) {
    const parsed = settingsSchema.parse(next);
    setSettings(parsed);
    await saveSettings(parsed);
    toast.success("Settings saved locally");
  }

  function withFormat(format: ExportFormat, checked: boolean): Settings {
    const outputFormats = checked
      ? Array.from(new Set([...settings.outputFormats, format]))
      : settings.outputFormats.filter((item) => item !== format);
    return { ...settings, outputFormats: outputFormats.length ? outputFormats : settings.outputFormats };
  }

  return (
    <main className="mx-auto max-w-4xl space-y-5 p-6">
      <header>
        <h1 className="text-xl font-semibold">Settings</h1>
        <p className="text-sm text-[#58665f]">Local-only controls for extraction, review, delivery, and diagnostics.</p>
      </header>

      <section className="rounded-md border border-[#cbd8d1] bg-white p-4">
        <h2 className="text-base font-medium">Workflow</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-sm">
            Automation
            <select
              className="rounded-md border border-[#cbd8d1] p-2"
              value={settings.automationMode}
              onChange={(event) => void save({ ...settings, automationMode: event.currentTarget.value as Settings["automationMode"] })}
            >
              <option value="manual">Manual extraction</option>
              <option value="review-before-export">Review before export</option>
              <option value="auto-export">Auto-export after extraction</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            Delivery
            <select
              className="rounded-md border border-[#cbd8d1] p-2"
              value={settings.deliveryMode}
              onChange={(event) => void save({ ...settings, deliveryMode: event.currentTarget.value as Settings["deliveryMode"] })}
            >
              <option value="download">Download files</option>
              <option value="clipboard">Copy text to clipboard</option>
            </select>
          </label>
        </div>
        <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <Toggle checked={settings.autoScroll} label="Scroll before extraction" onChange={(checked) => save({ ...settings, autoScroll: checked })} />
          <Toggle checked={settings.expandShowMore} label="Expand show-more controls" onChange={(checked) => save({ ...settings, expandShowMore: checked })} />
        </div>
      </section>

      <section className="rounded-md border border-[#cbd8d1] bg-white p-4">
        <h2 className="text-base font-medium">Export</h2>
        <label className="mt-3 grid gap-1 text-sm">
          Filename template
          <input
            className="rounded-md border border-[#cbd8d1] p-2"
            value={settings.filenameTemplate}
            onChange={(event) => setSettings({ ...settings, filenameTemplate: event.currentTarget.value })}
            onBlur={() => void save(settings)}
          />
        </label>
        <div className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          {EXPORT_FORMATS.map((format) => (
            <Toggle key={format} checked={settings.outputFormats.includes(format)} label={format} onChange={(checked) => save(withFormat(format, checked))} />
          ))}
        </div>
        <p className="mt-2 text-xs text-[#58665f]">
          <Download size={13} className="inline align-[-2px]" /> downloads all formats. <Clipboard size={13} className="inline align-[-2px]" /> clipboard supports text formats; XLSX stays download-only.
        </p>
      </section>

      <section className="rounded-md border border-[#cbd8d1] bg-white p-4">
        <h2 className="text-base font-medium">Data Scope</h2>
        <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          {Object.entries(settings.dataScope).map(([key, value]) => (
            <Toggle
              key={key}
              checked={value}
              label={labelize(key)}
              onChange={(checked) => save({ ...settings, dataScope: { ...settings.dataScope, [key]: checked } })}
            />
          ))}
        </div>
      </section>

      <section className="rounded-md border border-[#cbd8d1] bg-white p-4">
        <h2 className="text-base font-medium">Privacy And Diagnostics</h2>
        <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <Toggle
            checked={settings.privacy.persistExtractedData}
            label="Keep extracted profile locally"
            onChange={(checked) => save({ ...settings, privacy: { ...settings.privacy, persistExtractedData: checked } })}
          />
          <Toggle
            checked={settings.diagnostics.includeProvenance}
            label="Include provenance"
            onChange={(checked) => save({ ...settings, diagnostics: { ...settings.diagnostics, includeProvenance: checked } })}
          />
          <Toggle
            checked={settings.diagnostics.includeConfidence}
            label="Include confidence"
            onChange={(checked) => save({ ...settings, diagnostics: { ...settings.diagnostics, includeConfidence: checked } })}
          />
          <Toggle
            checked={settings.diagnostics.verbose}
            label="Verbose diagnostics"
            onChange={(checked) => save({ ...settings, diagnostics: { ...settings.diagnostics, verbose: checked } })}
          />
        </div>
        <ul className="mt-3 space-y-1 text-xs text-[#58665f]">
          <li>Analytics: {String(settings.privacy.analyticsEnabled)}</li>
          <li>Remote upload: {String(settings.privacy.remoteUploadEnabled)}</li>
          <li>Credential storage: false</li>
        </ul>
        <Button className="mt-4" variant="secondary" onClick={() => void clearExtractedState().then(() => toast.success("Local extracted state cleared"))}>
          <Trash2 size={16} />
          Clear local extracted data
        </Button>
      </section>
      <Toaster position="bottom-center" />
    </main>
  );
}

function Toggle({ checked, label, onChange }: { checked: boolean; label: string; onChange: (checked: boolean) => void | Promise<void> }) {
  return (
    <label className="flex min-h-10 items-center gap-2 rounded-md border border-[#cbd8d1] bg-[#f8faf8] p-2">
      <input type="checkbox" checked={checked} onChange={(event) => void onChange(event.currentTarget.checked)} />
      <Check size={14} className={checked ? "text-[#2f7d64]" : "text-transparent"} />
      <span className="text-sm">{label}</span>
    </label>
  );
}

function labelize(value: string): string {
  return value.replace(/[A-Z]/g, (letter) => ` ${letter.toLowerCase()}`).replace(/^./, (letter) => letter.toUpperCase());
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <OptionsApp />
  </StrictMode>
);
