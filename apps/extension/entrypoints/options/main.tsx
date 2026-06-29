import { Check, Clipboard, Download, Trash2 } from "lucide-react";
import { StrictMode, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { toast, Toaster } from "sonner";
import { EXPORT_FORMATS } from "@linkedin-profile-exporter/core/export-formats";
import type { ExportFormat } from "@linkedin-profile-exporter/core/schema";
import {
  defaultSettings,
  settingsSchema,
  type Settings
} from "@linkedin-profile-exporter/core/settings";
import { Button } from "../../src/components/button";
import { ProductMark } from "../../src/components/product-mark";
import "../../src/styles.css";
import { clearExtractedState, loadSettings, saveSettings } from "../../src/storage";

function OptionsApp() {
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const settingsRef = useRef<Settings>(defaultSettings);
  const changedBeforeLoadRef = useRef(false);

  useEffect(() => {
    void loadSettings()
      .then((loaded) => {
        if (changedBeforeLoadRef.current) return;
        settingsRef.current = loaded;
        setSettings(loaded);
      })
      .catch(() => {
        if (changedBeforeLoadRef.current) return;
        settingsRef.current = defaultSettings;
        setSettings(defaultSettings);
      });
  }, []);

  async function save(next: Settings | ((current: Settings) => Settings)) {
    changedBeforeLoadRef.current = true;
    const candidate = typeof next === "function" ? next(settingsRef.current) : next;
    const parsed = settingsSchema.parse(candidate);
    settingsRef.current = parsed;
    setSettings(parsed);
    await saveSettings(parsed);
    toast.success("Settings saved locally");
  }

  function withFormat(current: Settings, format: ExportFormat, checked: boolean): Settings {
    const outputFormats = checked
      ? Array.from(new Set([...current.outputFormats, format]))
      : current.outputFormats.filter((item) => item !== format);
    return {
      ...current,
      outputFormats: outputFormats.length ? outputFormats : current.outputFormats
    };
  }

  return (
    <main className="mx-auto min-h-dvh max-w-5xl space-y-5 bg-[#f2f6f4] p-5 text-[#17201b] sm:p-6">
      <header className="flex items-center gap-3">
        <ProductMark
          className="rounded-lg shadow-[0_10px_24px_-20px_rgba(23,32,27,0.75)]"
          size={48}
        />
        <div className="min-w-0">
          <h1 className="text-xl font-semibold">Settings</h1>
          <p className="text-sm text-[#58665f]">
            Local-only controls for extraction, review, delivery, and diagnostics.
          </p>
        </div>
      </header>

      <section className="rounded-lg border border-[#cbd8d1] bg-white p-5 shadow-[0_18px_40px_-34px_rgba(23,32,27,0.65)]">
        <h2 className="text-base font-medium">Workflow</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-sm">
            Automation
            <select
              className="min-h-11 rounded-md border border-[#cbd8d1] bg-white p-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#225c4a]"
              value={settings.automationMode}
              onChange={(event) => {
                const automationMode = event.currentTarget.value as Settings["automationMode"];
                void save((current) => ({ ...current, automationMode }));
              }}
            >
              <option value="manual">Manual extraction</option>
              <option value="review-before-export">Review before export</option>
              <option value="auto-export">Auto-export after extraction</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            Delivery
            <select
              className="min-h-11 rounded-md border border-[#cbd8d1] bg-white p-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#225c4a]"
              value={settings.deliveryMode}
              onChange={(event) => {
                const deliveryMode = event.currentTarget.value as Settings["deliveryMode"];
                void save((current) => ({ ...current, deliveryMode }));
              }}
            >
              <option value="download">Download files</option>
              <option value="clipboard">Copy text to clipboard</option>
            </select>
          </label>
        </div>
        <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <Toggle
            checked={settings.autoScroll}
            label="Scroll before extraction"
            onChange={(checked) => save((current) => ({ ...current, autoScroll: checked }))}
          />
          <Toggle
            checked={settings.expandShowMore}
            label="Expand show-more controls"
            onChange={(checked) => save((current) => ({ ...current, expandShowMore: checked }))}
          />
        </div>
      </section>

      <section className="rounded-lg border border-[#cbd8d1] bg-white p-5 shadow-[0_18px_40px_-34px_rgba(23,32,27,0.65)]">
        <h2 className="text-base font-medium">Export</h2>
        <label className="mt-3 grid gap-1 text-sm">
          Filename template
          <input
            className="min-h-11 rounded-md border border-[#cbd8d1] bg-white p-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#225c4a]"
            value={settings.filenameTemplate}
            onChange={(event) =>
              setSettings((current) => ({
                ...current,
                filenameTemplate: event.currentTarget.value
              }))
            }
            onBlur={(event) => {
              const filenameTemplate = event.currentTarget.value;
              void save((current) => ({ ...current, filenameTemplate }));
            }}
          />
        </label>
        <div className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          {EXPORT_FORMATS.map((format) => (
            <Toggle
              key={format}
              checked={settings.outputFormats.includes(format)}
              label={format}
              onChange={(checked) => save((current) => withFormat(current, format, checked))}
            />
          ))}
        </div>
        <p className="mt-2 text-xs text-[#58665f]">
          <Download size={13} className="inline align-[-2px]" /> downloads all formats.{" "}
          <Clipboard size={13} className="inline align-[-2px]" /> clipboard supports text formats;
          XLSX stays download-only.
        </p>
      </section>

      <section className="rounded-lg border border-[#cbd8d1] bg-white p-5 shadow-[0_18px_40px_-34px_rgba(23,32,27,0.65)]">
        <h2 className="text-base font-medium">Data Scope</h2>
        <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          {Object.entries(settings.dataScope).map(([key, value]) => (
            <Toggle
              key={key}
              checked={value}
              label={labelize(key)}
              onChange={(checked) =>
                save((current) => ({
                  ...current,
                  dataScope: { ...current.dataScope, [key]: checked }
                }))
              }
            />
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-[#cbd8d1] bg-white p-5 shadow-[0_18px_40px_-34px_rgba(23,32,27,0.65)]">
        <h2 className="text-base font-medium">Privacy And Diagnostics</h2>
        <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <Toggle
            checked={settings.privacy.persistExtractedData}
            label="Keep extracted profile locally"
            onChange={(checked) =>
              save((current) => ({
                ...current,
                privacy: { ...current.privacy, persistExtractedData: checked }
              }))
            }
          />
          <Toggle
            checked={settings.diagnostics.includeAllFields}
            label="Include all fields"
            onChange={(checked) =>
              save((current) => ({
                ...current,
                diagnostics: {
                  ...current.diagnostics,
                  includeAllFields: checked
                }
              }))
            }
          />
          <Toggle
            checked={
              settings.diagnostics.includeAllFields || settings.diagnostics.includeProvenance
            }
            label="Include provenance"
            onChange={(checked) =>
              save((current) => ({
                ...current,
                diagnostics: { ...current.diagnostics, includeProvenance: checked }
              }))
            }
          />
          <Toggle
            checked={
              settings.diagnostics.includeAllFields || settings.diagnostics.includeConfidence
            }
            label="Include confidence"
            onChange={(checked) =>
              save((current) => ({
                ...current,
                diagnostics: { ...current.diagnostics, includeConfidence: checked }
              }))
            }
          />
          <Toggle
            checked={settings.diagnostics.verbose}
            label="Verbose diagnostics"
            onChange={(checked) =>
              save((current) => ({
                ...current,
                diagnostics: { ...current.diagnostics, verbose: checked }
              }))
            }
          />
        </div>
        <ul className="mt-3 space-y-1 text-xs text-[#58665f]">
          <li>Analytics: {String(settings.privacy.analyticsEnabled)}</li>
          <li>Remote upload: {String(settings.privacy.remoteUploadEnabled)}</li>
          <li>Credential storage: false</li>
        </ul>
        <Button
          className="mt-4"
          variant="secondary"
          onClick={() =>
            void clearExtractedState().then(() => toast.success("Local extracted state cleared"))
          }
        >
          <Trash2 size={16} />
          Clear local extracted data
        </Button>
      </section>
      <Toaster position="top-center" />
    </main>
  );
}

function Toggle({
  checked,
  disabled = false,
  label,
  onChange
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onChange: (checked: boolean) => void | Promise<void>;
}) {
  return (
    <label
      aria-disabled={disabled}
      className={`flex min-h-11 touch-manipulation items-center gap-2 rounded-md border border-[#cbd8d1] bg-[#f8faf8] p-2 text-sm transition-[background-color,border-color,opacity,transform] duration-200 ease-out ${
        disabled
          ? "cursor-not-allowed opacity-70 active:scale-100"
          : "cursor-pointer active:scale-[0.98]"
      }`}
    >
      <input
        className="size-4"
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => void onChange(event.currentTarget.checked)}
      />
      <Check size={14} className={checked ? "text-[#2f7d64]" : "text-transparent"} />
      <span className="text-sm">{label}</span>
    </label>
  );
}

function labelize(value: string): string {
  return value
    .replace(/[A-Z]/g, (letter) => ` ${letter.toLowerCase()}`)
    .replace(/^./, (letter) => letter.toUpperCase());
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <OptionsApp />
  </StrictMode>
);
