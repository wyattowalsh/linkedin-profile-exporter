import { readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";

const targets = ["chrome-mv3", "edge-mv3", "firefox-mv2", "safari-mv2"];
const linkedInProfileMatch = "https://www.linkedin.com/in/*";
const backgroundBudgetBytes = 16 * 1024;
const failures: string[] = [];

interface ManifestAction {
  default_popup?: string;
  default_state?: string;
}

for (const target of targets) {
  const path = join("apps/extension/.output", target, "manifest.json");
  try {
    if (!statSync(path).isFile()) {
      failures.push(`${path}: missing`);
      continue;
    }
  } catch {
    failures.push(`${path}: missing`);
    continue;
  }

  const manifest = JSON.parse(readFileSync(path, "utf8")) as {
    name?: string;
    version?: string;
    manifest_version?: number;
    permissions?: string[];
    host_permissions?: string[];
    content_scripts?: Array<{ js?: string[]; matches?: string[] }>;
    action?: ManifestAction;
    page_action?: ManifestAction;
    browser_action?: ManifestAction;
    options_ui?: unknown;
    icons?: Record<string, string>;
    browser_specific_settings?: {
      gecko?: {
        data_collection_permissions?: {
          required?: string[];
        };
      };
    };
  };

  if (!manifest.name) failures.push(`${path}: name missing`);
  if (!manifest.version) failures.push(`${path}: version missing`);
  if (!manifest.manifest_version) failures.push(`${path}: manifest_version missing`);
  if (!manifest.content_scripts?.length) failures.push(`${path}: content scripts missing`);
  const linkedInContentScripts = manifest.content_scripts?.filter((entry) =>
    entry.matches?.includes(linkedInProfileMatch)
  );
  if (!linkedInContentScripts?.length)
    failures.push(`${path}: LinkedIn profile content script missing`);
  const linkedInContentScriptFiles = new Set(
    linkedInContentScripts?.flatMap((entry) => entry.js ?? []) ?? []
  );
  if (!linkedInContentScriptFiles.has("content-scripts/linkedin.js")) {
    failures.push(`${path}: LinkedIn content script must include content-scripts/linkedin.js`);
  }
  const manifestAction = manifest.action ?? manifest.page_action ?? manifest.browser_action;
  if (!manifestAction) failures.push(`${path}: action/page_action missing`);
  else if (manifestAction.default_popup !== "popup.html")
    failures.push(`${path}: action default_popup must be popup.html`);
  if (manifest.action?.default_state === "disabled") {
    failures.push(`${path}: action.default_state must not be disabled`);
  }
  if (!manifest.options_ui) failures.push(`${path}: options_ui missing`);
  for (const size of ["16", "32", "48", "128"]) {
    const iconPath = manifest.icons?.[size];
    if (!iconPath) {
      failures.push(`${path}: ${size} icon missing`);
      continue;
    }
    if (!iconPath.endsWith(".png")) failures.push(`${path}: ${size} icon must be a PNG`);
    try {
      if (!statSync(join(dirname(path), iconPath)).isFile())
        failures.push(`${path}: ${size} icon file missing`);
    } catch {
      failures.push(`${path}: ${size} icon file missing`);
    }
  }

  const permissions = new Set(manifest.permissions ?? []);
  for (const permission of ["activeTab", "downloads", "storage"]) {
    if (!permissions.has(permission)) failures.push(`${path}: ${permission} permission missing`);
  }
  if (target === "chrome-mv3" || target === "edge-mv3") {
    if (!permissions.has("scripting")) failures.push(`${path}: scripting permission missing`);
    if (!permissions.has("tabs")) failures.push(`${path}: tabs permission missing`);
  } else if (permissions.has("scripting")) {
    failures.push(`${path}: scripting permission should be limited to Chrome/Edge MV3 targets`);
  } else if (permissions.has("tabs")) {
    failures.push(`${path}: tabs permission should be limited to Chrome/Edge MV3 targets`);
  }

  const hostPermissions = new Set([
    ...(manifest.host_permissions ?? []),
    ...(manifest.permissions ?? []).filter((permission) => permission.includes("://"))
  ]);
  if (!hostPermissions.has(linkedInProfileMatch)) {
    failures.push(`${path}: LinkedIn profile host permission missing`);
  }
  for (const hostPermission of hostPermissions) {
    if (hostPermission !== linkedInProfileMatch) {
      failures.push(`${path}: unexpected host permission ${hostPermission}`);
    }
  }

  if (target === "firefox-mv2") {
    const required =
      manifest.browser_specific_settings?.gecko?.data_collection_permissions?.required ?? [];
    if (!required.includes("none"))
      failures.push(`${path}: Firefox data_collection_permissions.required must include none`);
  }

  const targetDir = dirname(path);
  const popupHtml = readFileSync(join(targetDir, "popup.html"), "utf8");
  const bootShellIndex = popupHtml.indexOf('id="popup-boot-shell"');
  if (bootShellIndex === -1) {
    failures.push(`${path}: popup.html must include the static popup boot shell`);
  }
  const stylesheetIndex = popupHtml.indexOf('rel="stylesheet"');
  if (stylesheetIndex !== -1 && stylesheetIndex < bootShellIndex) {
    failures.push(`${path}: popup boot shell must not wait on render-blocking stylesheets`);
  }
  for (const blockedPreload of [
    "use-profile-exporter-controller",
    "profile-delivery",
    "export-download",
    "exceljs"
  ]) {
    if (popupHtml.includes(blockedPreload)) {
      failures.push(`${path}: popup.html must not preload ${blockedPreload}`);
    }
  }
  const backgroundPath = join(targetDir, "background.js");
  const backgroundSize = statSync(backgroundPath).size;
  if (backgroundSize > backgroundBudgetBytes) {
    failures.push(
      `${path}: background.js is ${backgroundSize} bytes, above ${backgroundBudgetBytes} byte budget`
    );
  }
  const background = readFileSync(backgroundPath, "utf8");
  for (const blockedSymbol of ["exceljs", "XMLBuilder", "exportProfile", "fast-xml-parser"]) {
    if (background.includes(blockedSymbol)) {
      failures.push(`${path}: background.js unexpectedly includes ${blockedSymbol}`);
    }
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}
