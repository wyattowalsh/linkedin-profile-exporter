import { AlertCircle, Check, CheckCircle2, Clipboard, Download, FileText, RefreshCcw, Settings, Trash2, XCircle } from "lucide-react";
import { motion } from "motion/react";
import type { ReactNode } from "react";
import type { ReadinessResult } from "@linkedin-profile-exporter/core/extraction";
import { EXPORT_FORMATS } from "@linkedin-profile-exporter/core/exporters";
import type { ExportFormat, Profile } from "@linkedin-profile-exporter/core/schema";
import type { Settings as ProfileSettings } from "@linkedin-profile-exporter/core/settings";
import { blockedClipboardFormats, formatsForDelivery } from "../profile-delivery";
import { isTextExportFormat } from "../export-download";
import { cn } from "../lib/utils";
import { Button } from "./button";

interface ProfileExporterPanelProps {
  busy: boolean;
  extractionError?: string | undefined;
  fallbackText?: string;
  onClear: () => void;
  onDeliver: () => void;
  onDeliveryModeChange: (deliveryMode: ProfileSettings["deliveryMode"]) => void;
  onExtract: () => void;
  onOpenSettings?: () => void;
  onToggleFormat: (format: ExportFormat) => void;
  profile: Profile | null;
  readiness: ReadinessResult | null;
  settings: ProfileSettings;
  surface: "popup" | "sidepanel";
}

export function ProfileExporterPanel({
  busy,
  extractionError,
  fallbackText,
  onClear,
  onDeliver,
  onDeliveryModeChange,
  onExtract,
  onOpenSettings,
  onToggleFormat,
  profile,
  readiness,
  settings,
  surface
}: ProfileExporterPanelProps) {
  const selectedFormats = settings.outputFormats;
  const deliverableFormats = formatsForDelivery(settings.deliveryMode, selectedFormats);
  const copyBlockedFormats = settings.deliveryMode === "clipboard" ? blockedClipboardFormats(selectedFormats) : [];
  const primaryAction = actionMeta(settings.deliveryMode);
  const actionDisabled = !profile || !deliverableFormats.length;
  const shellClass = surface === "popup" ? "w-[420px]" : "min-h-screen min-w-[380px]";
  const contentClass = surface === "popup" ? "space-y-3 p-4" : "mx-auto max-w-xl space-y-3 p-4";
  const status = statusMeta(readiness?.state);

  return (
    <main className={cn(shellClass, "bg-[#f4f6f7] text-[#17201b]")}>
      <header className="border-b border-[#d9e0dd] bg-white px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-[#153a35] text-white shadow-sm">
              <FileText size={18} />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-base font-semibold">Profile Exporter</h1>
              <p className="mt-0.5 truncate text-xs text-[#5f6d66]">{profile?.identity.name ?? workflowLabel(settings.automationMode)}</p>
            </div>
          </div>
          {onOpenSettings ? (
            <Button className="h-9 shrink-0 px-2" variant="ghost" title="Open settings" onClick={onOpenSettings}>
              <Settings size={17} />
              Settings
            </Button>
          ) : null}
        </div>
      </header>

      <div className={contentClass}>
        <motion.section initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="rounded-md border border-[#d1dad6] bg-white p-3 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs font-medium", status.className)}>
                  {status.icon}
                  {status.label}
                </span>
                <span className="truncate text-xs text-[#6a766f]">{deliveryLabel(settings.deliveryMode)}</span>
              </div>
              <p className="mt-2 line-clamp-2 text-sm leading-5 text-[#46554e]">{readiness?.reason ?? "Checking the active tab."}</p>
            </div>
            <Button className="h-10 shrink-0 px-3" disabled={busy || readiness?.state === "unavailable"} onClick={onExtract}>
              <RefreshCcw size={16} className={busy ? "animate-spin" : undefined} />
              {busy ? "Extracting" : "Extract"}
            </Button>
          </div>
        </motion.section>

        {profile ? <ProfileSnapshot profile={profile} /> : <EmptyProfileState extractionError={extractionError} readiness={readiness} />}

        <section className="rounded-md border border-[#d1dad6] bg-white p-3 shadow-sm">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Settings</h2>
            {onOpenSettings ? (
              <Button className="h-8 px-2 text-xs" variant="ghost" title="Open full settings" onClick={onOpenSettings}>
                <Settings size={14} />
                Full
              </Button>
            ) : null}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <DeliveryToggle active={settings.deliveryMode === "download"} icon={<Download size={15} />} label="Download" onClick={() => onDeliveryModeChange("download")} />
            <DeliveryToggle active={settings.deliveryMode === "clipboard"} icon={<Clipboard size={15} />} label="Clipboard" onClick={() => onDeliveryModeChange("clipboard")} />
          </div>
        </section>

        <section className="rounded-md border border-[#d1dad6] bg-white p-3 shadow-sm">
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
                onChange={() => onToggleFormat(format)}
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
          <Button className="size-10 px-0" variant="secondary" title="Clear local profile" onClick={onClear}>
            <Trash2 size={16} />
          </Button>
          <Button className="h-10 justify-center" disabled={actionDisabled} onClick={onDeliver}>
            {primaryAction.icon}
            {primaryAction.label}
          </Button>
        </footer>
      </div>
    </main>
  );
}

function ProfileSnapshot({ profile }: { profile: Profile }) {
  return (
    <section className="rounded-md border border-[#d1dad6] bg-white p-3 shadow-sm">
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
  );
}

function EmptyProfileState({ extractionError, readiness }: { extractionError?: string | undefined; readiness: ReadinessResult | null }) {
  if (extractionError) {
    return (
      <section className="rounded-md border border-[#efc0bb] bg-[#fff7f5] px-3 py-4 shadow-sm">
        <p className="text-sm font-semibold text-[#8a332b]">Extraction failed</p>
        <p className="mt-1 text-xs leading-5 text-[#6a3a34]">{extractionError}</p>
      </section>
    );
  }

  const copy =
    readiness?.state === "ready"
      ? { title: "Ready to extract", body: "Click Extract to load this profile locally." }
      : readiness?.state === "unavailable"
        ? { title: "No LinkedIn profile tab", body: readiness.reason }
        : { title: "Profile not ready", body: readiness?.reason ?? "Checking the active tab." };

  return (
    <section className="rounded-md border border-dashed border-[#c7d5ce] bg-white px-3 py-4 text-center shadow-sm">
      <p className="text-sm font-medium">{copy.title}</p>
      <p className="mt-1 text-xs leading-5 text-[#6a766f]">{copy.body}</p>
    </section>
  );
}

function DeliveryToggle({ active, icon, label, onClick }: { active: boolean; icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      className={cn(
        "inline-flex h-9 items-center justify-center gap-2 rounded-md border px-2 text-xs font-medium transition",
        active ? "border-[#1f6b54] bg-[#e8f5ef] text-[#174c3c]" : "border-[#d6e0dc] bg-[#f8faf9] text-[#46554e] hover:border-[#8db4a6]"
      )}
      type="button"
      onClick={onClick}
    >
      {icon}
      {label}
    </button>
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
      className={cn(
        "flex h-10 cursor-pointer items-center justify-between gap-1 rounded-md border px-2 text-xs font-medium transition",
        checked ? "border-[#1f6b54] bg-[#e8f5ef] text-[#174c3c]" : "border-[#d6e0dc] bg-[#f8faf9] text-[#46554e]",
        disabled ? "cursor-not-allowed opacity-45" : "hover:border-[#8db4a6]"
      )}
      title={disabled ? "Clipboard supports text formats only" : format}
    >
      <input className="sr-only" type="checkbox" checked={checked} disabled={disabled} onChange={onChange} />
      <span className="truncate">{formatLabel(format)}</span>
      <Check size={13} className={checked ? "opacity-100" : "opacity-0"} />
    </label>
  );
}

function Metric({ label, value, tone = "neutral" }: { label: string; value: number; tone?: "neutral" | "amber" }) {
  return (
    <div className={cn("rounded-md border px-2 py-2", tone === "amber" ? "border-[#ead9a6] bg-[#fff8e6]" : "border-[#e0e8e4] bg-[#f7faf9]")}>
      <dt className="truncate text-[11px] text-[#68766f]">{label}</dt>
      <dd className="mt-0.5 text-base font-semibold leading-none">{value}</dd>
    </div>
  );
}

function actionMeta(mode: ProfileSettings["deliveryMode"]) {
  if (mode === "clipboard") {
    return { label: "Copy selected", icon: <Clipboard size={16} /> };
  }
  return { label: "Download selected", icon: <Download size={16} /> };
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
