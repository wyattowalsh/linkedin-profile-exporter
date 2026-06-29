import {
  AlertCircle,
  Check,
  CheckCircle2,
  Clipboard,
  Download,
  RefreshCcw,
  Settings,
  Trash2,
  XCircle
} from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import type { ReadinessResult } from "@linkedin-profile-exporter/core/extraction";
import { EXPORT_FORMATS, isTextExportFormat } from "@linkedin-profile-exporter/core/export-formats";
import type { ExportFormat, Profile } from "@linkedin-profile-exporter/core/schema";
import type { Settings as ProfileSettings } from "@linkedin-profile-exporter/core/settings";
import { blockedClipboardFormats, formatsForDelivery } from "../delivery-formats";
import { cn } from "../lib/utils";
import type { ExtractionStatus } from "../messaging";
import { Button } from "./button";
import { ProductMark } from "./product-mark";

interface ProfileExporterPanelProps {
  busy: boolean;
  extractionError?: string | undefined;
  extractionStatus?: ExtractionStatus | null;
  fallbackText?: string;
  onClear: () => void;
  onDeliver: () => void;
  onDeliveryModeChange: (deliveryMode: ProfileSettings["deliveryMode"]) => void;
  onExtract: () => void;
  onOpenSettings?: () => void;
  onRefresh?: () => void;
  onToggleFormat: (format: ExportFormat) => void;
  profile: Profile | null;
  readiness: ReadinessResult | null;
  settings: ProfileSettings;
  surface: "popup" | "sidepanel";
}

export function ProfileExporterPanel({
  busy,
  extractionError,
  extractionStatus,
  fallbackText,
  onClear,
  onDeliver,
  onDeliveryModeChange,
  onExtract,
  onOpenSettings,
  onRefresh,
  onToggleFormat,
  profile,
  readiness,
  settings,
  surface
}: ProfileExporterPanelProps) {
  const reduceMotion = useReducedMotion();
  const selectedFormats = settings.outputFormats;
  const deliverableFormats = formatsForDelivery(settings.deliveryMode, selectedFormats);
  const copyBlockedFormats =
    settings.deliveryMode === "clipboard" ? blockedClipboardFormats(selectedFormats) : [];
  const primaryAction = actionMeta(settings.deliveryMode);
  const actionDisabled =
    busy || !deliverableFormats.length || (!profile && readiness?.state !== "ready");
  const shellClass = surface === "popup" ? "w-screen max-w-[420px]" : "min-h-dvh min-w-[380px]";
  const contentClass = surface === "popup" ? "space-y-3 p-4" : "mx-auto max-w-xl space-y-4 p-5";
  const status =
    busy && extractionStatus
      ? extractionStatusMeta(extractionStatus)
      : statusMeta(readiness?.state);
  const statusDescription =
    busy && extractionStatus
      ? (extractionStatus.detail ?? readiness?.reason ?? "Extracting this profile locally.")
      : (readiness?.reason ?? "Connecting to the active tab.");

  return (
    <main
      aria-busy={busy}
      className={cn(
        shellClass,
        "bg-[#f2f6f4] text-[#17201b] [background-image:linear-gradient(180deg,rgba(255,255,255,0.86),rgba(242,246,244,0.98))]"
      )}
    >
      <header className="border-b border-[#d9e0dd] bg-white/95 px-4 py-3 shadow-[0_12px_24px_-24px_rgba(23,32,27,0.65)]">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <ProductMark
              className="rounded-lg shadow-[0_10px_24px_-20px_rgba(23,32,27,0.75)]"
              size={40}
            />
            <div className="min-w-0">
              <h1 className="truncate text-base font-semibold">Profile Exporter</h1>
              <p className="mt-0.5 truncate text-xs text-[#5f6d66]">
                {profile?.identity.name ?? workflowLabel(settings.automationMode)}
              </p>
            </div>
          </div>
          {onOpenSettings ? (
            <Button
              className="min-h-10 shrink-0 px-2"
              variant="ghost"
              title="Open settings"
              onClick={onOpenSettings}
            >
              <Settings size={17} />
              Settings
            </Button>
          ) : null}
        </div>
      </header>

      <div className={contentClass}>
        <motion.section
          initial={reduceMotion ? false : { opacity: 0, y: 4 }}
          animate={reduceMotion ? false : { opacity: 1, y: 0 }}
          transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
          className="overflow-hidden rounded-lg border border-[#d1dad6] bg-white shadow-[0_18px_40px_-30px_rgba(23,32,27,0.55)]"
        >
          <div className="flex items-start justify-between gap-3 p-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  aria-live="polite"
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs font-medium",
                    status.className
                  )}
                >
                  {status.icon}
                  {status.label}
                </span>
                <span className="truncate text-xs text-[#6a766f]">
                  {deliveryLabel(settings.deliveryMode)}
                </span>
              </div>
              <p className="mt-2 line-clamp-2 text-sm leading-5 text-[#46554e]">
                {statusDescription}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              {profile && onRefresh ? (
                <Button
                  aria-label="Refresh from LinkedIn"
                  className="h-10 min-h-10 px-2"
                  disabled={busy || !readiness || readiness.state === "unavailable"}
                  onClick={onRefresh}
                  title="Refresh from LinkedIn"
                  variant="secondary"
                >
                  <RefreshCcw size={15} />
                </Button>
              ) : null}
              <Button
                className="h-10 shrink-0 px-3"
                disabled={busy || !readiness || readiness.state === "unavailable"}
                onClick={onExtract}
              >
                <RefreshCcw size={16} className={busy ? "animate-spin" : undefined} />
                {busy ? "Extracting" : "Extract"}
              </Button>
            </div>
          </div>
          {busy ? <BusyBar /> : null}
        </motion.section>

        {profile ? (
          <ProfileSnapshot profile={profile} />
        ) : (
          <EmptyProfileState extractionError={extractionError} readiness={readiness} />
        )}

        <section className="rounded-md border border-[#d1dad6] bg-white p-3 shadow-sm">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Settings</h2>
            {onOpenSettings ? (
              <Button
                className="min-h-9 px-2 text-xs"
                variant="ghost"
                title="Open full settings"
                onClick={onOpenSettings}
              >
                <Settings size={14} />
                Full
              </Button>
            ) : null}
          </div>
          <div aria-label="Delivery mode" className="grid grid-cols-2 gap-2" role="group">
            <DeliveryToggle
              active={settings.deliveryMode === "download"}
              icon={<Download size={15} />}
              label="Download"
              onClick={() => onDeliveryModeChange("download")}
            />
            <DeliveryToggle
              active={settings.deliveryMode === "clipboard"}
              icon={<Clipboard size={15} />}
              label="Clipboard"
              onClick={() => onDeliveryModeChange("clipboard")}
            />
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
            className="h-28 w-full resize-none rounded-md border border-[#cbd8d1] bg-white p-2 font-mono text-xs text-[#24322c]"
            readOnly
            value={fallbackText}
            aria-label="Clipboard fallback text"
          />
        ) : null}

        <footer className="grid grid-cols-[auto_1fr] gap-2">
          <Button
            className="size-11 px-0"
            variant="secondary"
            title="Clear local profile"
            onClick={onClear}
          >
            <Trash2 size={16} />
          </Button>
          <Button className="min-h-11 justify-center" disabled={actionDisabled} onClick={onDeliver}>
            {primaryAction.icon}
            {primaryAction.label}
          </Button>
        </footer>
      </div>
    </main>
  );
}

function ProfileSnapshot({ profile }: { profile: Profile }) {
  const stats = profileStats(profile);
  const completenessNotes = profileCompletenessNotes(profile);

  return (
    <section className="rounded-md border border-[#d1dad6] bg-white p-3 shadow-sm">
      <div className="min-w-0">
        <h2 className="truncate text-sm font-semibold">{profile.identity.name}</h2>
        {profile.identity.headline ? (
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-[#5f6d66]">
            {profile.identity.headline}
          </p>
        ) : null}
      </div>
      <dl aria-label="Profile stats" className="mt-2 grid grid-cols-5 gap-1">
        {stats.map((stat) => (
          <Metric
            key={stat.label}
            label={stat.label}
            title={stat.title}
            value={stat.value}
            tone={stat.tone}
          />
        ))}
      </dl>
      {completenessNotes.length ? (
        <ul className="mt-2 grid grid-cols-1 gap-1 text-[10px] font-medium leading-4 text-[#6c4d13]">
          {completenessNotes.map((note) => (
            <li key={note} className="truncate rounded border border-[#ead9a6] bg-[#fff8e6] px-1.5">
              {note}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function EmptyProfileState({
  extractionError,
  readiness
}: {
  extractionError?: string | undefined;
  readiness: ReadinessResult | null;
}) {
  if (extractionError) {
    return (
      <section className="rounded-md border border-[#efc0bb] bg-[#fff7f5] px-3 py-4 shadow-sm">
        <p className="text-sm font-semibold text-[#8a332b]">Extraction failed</p>
        <p className="mt-1 text-xs leading-5 text-[#6a3a34]">{extractionError}</p>
      </section>
    );
  }

  const copy = !readiness
    ? { title: "Connecting", body: "Checking the active tab." }
    : readiness.state === "ready"
      ? { title: "Ready to extract", body: "Click Extract to load this profile locally." }
      : readiness.state === "unavailable"
        ? { title: "No LinkedIn profile tab", body: readiness.reason }
        : { title: "Profile not ready", body: readiness.reason };

  return (
    <section className="rounded-md border border-dashed border-[#c7d5ce] bg-white px-3 py-4 text-center shadow-sm">
      <p className="text-sm font-medium">{copy.title}</p>
      <p className="mt-1 text-xs leading-5 text-[#6a766f]">{copy.body}</p>
    </section>
  );
}

function BusyBar() {
  return (
    <div className="h-1 overflow-hidden border-t border-[#dce5e1] bg-[#edf4f1]" aria-hidden="true">
      <div className="h-full w-1/2 origin-left animate-[lpe-progress_1.35s_ease-in-out_infinite] bg-[#225c4a]" />
    </div>
  );
}

function DeliveryToggle({
  active,
  icon,
  label,
  onClick
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-pressed={active}
      className={cn(
        "inline-flex min-h-11 touch-manipulation cursor-pointer items-center justify-center gap-2 rounded-md border px-2 text-xs font-semibold transition-[background-color,border-color,color,transform] duration-200 ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#225c4a] active:scale-[0.98]",
        active
          ? "border-[#1f6b54] bg-[#e8f5ef] text-[#174c3c]"
          : "border-[#d6e0dc] bg-[#f8faf9] text-[#46554e] hover:border-[#8db4a6]"
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
        "flex min-h-11 touch-manipulation cursor-pointer items-center justify-between gap-1 rounded-md border px-2 text-xs font-semibold transition-[background-color,border-color,color,opacity,transform] duration-200 ease-out focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[#225c4a] active:scale-[0.98]",
        checked
          ? "border-[#1f6b54] bg-[#e8f5ef] text-[#174c3c]"
          : "border-[#d6e0dc] bg-[#f8faf9] text-[#46554e]",
        disabled ? "cursor-not-allowed opacity-45 active:scale-100" : "hover:border-[#8db4a6]"
      )}
      title={disabled ? "Clipboard supports text formats only" : format}
    >
      <input
        className="sr-only"
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={onChange}
      />
      <span className="truncate">{formatLabel(format)}</span>
      <Check size={13} className={checked ? "opacity-100" : "opacity-0"} />
    </label>
  );
}

function Metric({
  label,
  title,
  value,
  tone = "neutral"
}: {
  label: string;
  title?: string | undefined;
  value: string;
  tone?: "neutral" | "amber" | undefined;
}) {
  return (
    <div
      className={cn(
        "min-w-0 rounded border px-1.5 py-1",
        tone === "amber" ? "border-[#ead9a6] bg-[#fff8e6]" : "border-[#e0e8e4] bg-[#f7faf9]"
      )}
      title={title}
    >
      <dt className="truncate text-[10px] leading-3 text-[#68766f]">{label}</dt>
      <dd className="mt-0.5 truncate text-sm font-semibold leading-4">{value}</dd>
    </div>
  );
}

function profileStats(profile: Profile): Array<{
  label: string;
  title?: string | undefined;
  tone?: "neutral" | "amber" | undefined;
  value: string;
}> {
  const nestedRoles = profile.work.reduce((count, item) => count + item.roles.length, 0);
  const imageCount =
    Number(Boolean(profile.identity.imagery?.profileImageUrl)) +
    Number(Boolean(profile.identity.imagery?.backgroundImageUrl));
  const skillWarning = sectionHasActiveCoverageWarning(profile, "skills");
  const courseWarning = sectionHasActiveCoverageWarning(profile, "courses");
  const diagnosticsPresent = profile.diagnostics.length > 0;
  return [
    { label: "Work", value: statValue(profile.work.length) },
    { label: "Roles", value: statValue(nestedRoles) },
    { label: "Edu", value: statValue(profile.education.length) },
    {
      label: "Skills",
      title: skillWarning ? "Skill section may be capped or partial" : undefined,
      tone: skillWarning ? "amber" : "neutral",
      value: statValue(profile.skills.length)
    },
    { label: "Certs", value: statValue(profile.licensesCertifications.length) },
    { label: "Proj", value: statValue(profile.projects.length) },
    { label: "Pubs", value: statValue(profile.publications.length) },
    { label: "Vol", value: statValue(profile.volunteering.length) },
    { label: "Honors", value: statValue(profile.honorsAwards.length) },
    { label: "Scores", value: statValue(profile.testScores.length) },
    { label: "Patents", value: statValue(profile.patents.length) },
    { label: "Lang", value: statValue(profile.languages.length) },
    {
      label: "Courses",
      title: courseWarning ? "Course section has recovery or dedupe diagnostics" : undefined,
      tone: courseWarning ? "amber" : "neutral",
      value: statValue(profile.courses.length)
    },
    { label: "Recs", value: statValue(profile.recommendations.length) },
    { label: "Feat", value: statValue(profile.featured.length) },
    { label: "Orgs", value: statValue(profile.organizations.length) },
    { label: "Int", value: statValue(profile.interests.length) },
    { label: "Links", value: statValue(profile.identity.links.length) },
    { label: "Img", value: statValue(imageCount) },
    {
      label: "Diag",
      tone: diagnosticsPresent ? "amber" : "neutral",
      value: statValue(profile.diagnostics.length)
    },
    { label: "Fmts", value: statValue(profile.exportMetadata.formats.length) },
    { label: "Conn", value: statValue(profile.identity.connections) },
    { label: "Foll", value: statValue(profile.identity.followers) }
  ];
}

function profileCompletenessNotes(profile: Profile): string[] {
  const notes: Array<{ priority: number; text: string }> = [];
  const coverageSections = new Set<string>();
  const coverageStates = new Set<string>();
  for (const diagnostic of profile.diagnostics) {
    const match = /^coverage\.([^.]+)\.([^.]+)$/.exec(diagnostic.code);
    if (match?.[1] && match[2]) {
      coverageSections.add(match[1]);
      coverageStates.add(`${match[1]}:${match[2]}`);
    }
    const note = coverageDiagnosticNote(diagnostic.code, profile);
    if (note) notes.push(note);
  }
  if (
    !coverageSections.has("skills") &&
    !sectionCoverageResolved(profile, "skills") &&
    hasDiagnosticCode(profile, ["linkedin-voyager.skills.recovered"])
  ) {
    notes.push({ priority: 50, text: "skills recovered" });
  }
  if (
    !coverageSections.has("skills") &&
    !sectionCoverageResolved(profile, "skills") &&
    hasDiagnosticCode(profile, ["linkedin-voyager.skills.partial"])
  ) {
    notes.push({ priority: 10, text: "skills partial" });
  }
  if (
    !coverageSections.has("skills") &&
    !sectionCoverageResolved(profile, "skills") &&
    hasDiagnosticCode(profile, ["linkedin-voyager.skills.possibly-capped"])
  ) {
    notes.push({ priority: 10, text: "skills may be capped" });
  }
  if (
    profileCoverageCount(profile, "courses") > 0 &&
    !coverageStates.has("courses:deduplicated") &&
    hasDiagnosticCode(profile, ["linkedin-voyager.courses.deduplicated"])
  ) {
    notes.push({ priority: 30, text: "courses deduped" });
  }
  const higherPrioritySections = new Set(
    notes.flatMap((note) => {
      const match = /^(\S+)\s+(?:partial|(?:may be )?capped|unavailable|deduped)$/.exec(note.text);
      return match?.[1] ? [match[1]] : [];
    })
  );
  const seen = new Set<string>();
  return notes
    .sort((left, right) => left.priority - right.priority)
    .flatMap((note) => {
      const recoveredMatch = /^(\S+)\s+recovered$/.exec(note.text);
      if (recoveredMatch?.[1] && higherPrioritySections.has(recoveredMatch[1])) return [];
      if (seen.has(note.text)) return [];
      seen.add(note.text);
      return [note.text];
    })
    .slice(0, 5);
}

function coverageDiagnosticNote(
  code: string,
  profile: Profile
): { priority: number; text: string } | undefined {
  const match = /^coverage\.([^.]+)\.([^.]+)$/.exec(code);
  if (!match) {
    if (code === "coverage.pagination.exhausted") {
      return { priority: 60, text: "pagination exhausted" };
    }
    if (code === "coverage.budget.exhausted") return { priority: 20, text: "recovery budget hit" };
    return undefined;
  }
  const rawSection = match[1] ?? "";
  const section = compactSectionLabel(rawSection);
  const state = match[2];
  if (!section) return undefined;
  if (state === "complete") return undefined;
  if (
    (state === "partial" || state === "capped" || state === "recovered") &&
    sectionCoverageResolved(profile, rawSection)
  ) {
    return undefined;
  }
  if (state === "unavailable" && profileCoverageCount(profile, rawSection) > 0) return undefined;
  if (state === "partial")
    return { priority: priorityForSectionState(rawSection, state), text: `${section} partial` };
  if (state === "capped")
    return {
      priority: priorityForSectionState(rawSection, state),
      text: `${section} may be capped`
    };
  if (state === "unavailable") {
    return { priority: priorityForSectionState(rawSection, state), text: `${section} unavailable` };
  }
  if (state === "deduplicated" && profileCoverageCount(profile, rawSection) > 0) {
    return { priority: 30, text: `${section} deduped` };
  }
  if (state === "recovered") return { priority: 50, text: `${section} recovered` };
  return undefined;
}

function priorityForSectionState(section: string, state: string): number {
  if ((section === "skills" || section === "courses") && /partial|capped/.test(state)) return 10;
  if (state === "partial" || state === "capped") return 25;
  if (state === "unavailable") return 70;
  return 50;
}

const COVERAGE_KNOWN_PAGE_CAPS: Record<string, number> = {
  courses: 20,
  featured: 20,
  projects: 20,
  skills: 20
};

function sectionHasActiveCoverageWarning(profile: Profile, section: string): boolean {
  if (sectionCoverageResolved(profile, section)) return false;
  return hasDiagnosticCode(profile, [
    `coverage.${section}.partial`,
    `coverage.${section}.capped`,
    `linkedin-voyager.${section}.partial`,
    `linkedin-voyager.${section}.possibly-capped`
  ]);
}

function sectionCoverageResolved(profile: Profile, section: string): boolean {
  if (hasDiagnosticCode(profile, [`coverage.${section}.complete`])) return true;
  const hasRecovered = hasDiagnosticCode(profile, [
    `coverage.${section}.recovered`,
    `linkedin-voyager.${section}.recovered`
  ]);
  if (!hasRecovered) return false;
  const knownCap = COVERAGE_KNOWN_PAGE_CAPS[section];
  return !knownCap || profileCoverageCount(profile, section) > knownCap;
}

function profileCoverageCount(profile: Profile, section: string): number {
  if (section === "licensesCertifications") return profile.licensesCertifications.length;
  if (section === "honorsAwards") return profile.honorsAwards.length;
  if (section === "testScores") return profile.testScores.length;
  if (section === "links") return profile.identity.links.length;
  if (section === "imagery") {
    return (
      Number(Boolean(profile.identity.imagery?.profileImageUrl)) +
      Number(Boolean(profile.identity.imagery?.backgroundImageUrl))
    );
  }
  if (section === "connections") return profile.identity.connections ? 1 : 0;
  if (section === "followers") return profile.identity.followers ? 1 : 0;
  const value = profile[section as keyof Profile];
  return Array.isArray(value) ? value.length : 0;
}

function compactSectionLabel(section: string): string {
  const labels: Record<string, string> = {
    courses: "courses",
    featured: "featured",
    honorsAwards: "honors",
    licensesCertifications: "certs",
    projects: "projects",
    recommendations: "recs",
    skills: "skills",
    volunteering: "volunteering",
    work: "work"
  };
  return labels[section] ?? section.replace(/([A-Z])/g, " $1").toLowerCase();
}

function hasDiagnosticCode(profile: Profile, codes: string[]): boolean {
  return profile.diagnostics.some((diagnostic) => codes.includes(diagnostic.code));
}

function statValue(value: number | string | undefined): string {
  if (typeof value === "number") return String(value);
  return value?.trim() || "0";
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
  if (state === undefined) {
    return {
      label: "Connecting",
      className: "border-[#a8c6e8] bg-[#edf6ff] text-[#17466f]",
      icon: <RefreshCcw size={13} className="animate-spin" />
    };
  }
  return {
    label: "Needs Action",
    className: "border-[#e7d29a] bg-[#fff7df] text-[#76561a]",
    icon: <AlertCircle size={13} />
  };
}

function extractionStatusMeta(status: ExtractionStatus) {
  if (status.phase === "complete") {
    return {
      label: status.label,
      className: "border-[#a8d5c3] bg-[#eaf7f1] text-[#14543f]",
      icon: <CheckCircle2 size={13} />
    };
  }
  if (status.phase === "failed") {
    return {
      label: status.label,
      className: "border-[#efc0bb] bg-[#fff1ef] text-[#8a332b]",
      icon: <XCircle size={13} />
    };
  }
  return {
    label: status.label,
    className: "border-[#a8c6e8] bg-[#edf6ff] text-[#17466f]",
    icon: <RefreshCcw size={13} className="animate-spin" />
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
