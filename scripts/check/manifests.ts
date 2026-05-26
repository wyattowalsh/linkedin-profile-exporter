import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const targets = ["chrome-mv3", "edge-mv3", "firefox-mv2", "safari-mv2"];
const failures: string[] = [];

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
    content_scripts?: unknown[];
    action?: unknown;
    page_action?: unknown;
    browser_action?: unknown;
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
  if (!manifest.action && !manifest.page_action && !manifest.browser_action) failures.push(`${path}: action/page_action missing`);
  if (!manifest.options_ui) failures.push(`${path}: options_ui missing`);
  if (!manifest.icons?.["128"]) failures.push(`${path}: 128 icon missing`);

  const permissions = new Set(manifest.permissions ?? []);
  for (const permission of ["activeTab", "downloads", "storage"]) {
    if (!permissions.has(permission)) failures.push(`${path}: ${permission} permission missing`);
  }

  if (target === "firefox-mv2") {
    const required = manifest.browser_specific_settings?.gecko?.data_collection_permissions?.required ?? [];
    if (!required.includes("none")) failures.push(`${path}: Firefox data_collection_permissions.required must include none`);
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}
