import { readFileSync, statSync } from "node:fs";

const failures: string[] = [];

const requiredFiles = [
  "scripts/release/github-release-assets.ts",
  "apps/docs/content/docs/release.mdx",
  "openspec/changes/ship-linkedin-exporter-v0-1-0/specs/release-validation/spec.md",
  "openspec/changes/ship-linkedin-exporter-v0-1-0/validation-matrix.md"
];

for (const file of requiredFiles) {
  try {
    if (!statSync(file).isFile()) failures.push(`${file}: not a file`);
  } catch {
    failures.push(`${file}: missing`);
  }
}

const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
  scripts: Record<string, string>;
};

if (!packageJson.scripts["release:github:package"]) {
  failures.push("package.json: release:github:package script missing");
}

for (const [scriptName, script] of Object.entries(packageJson.scripts)) {
  if (/gh\s+release\s+(create|upload|edit|delete|delete-asset)\b/.test(script)) {
    failures.push(
      `package.json: ${scriptName} must not run credentialed gh release mutations directly`
    );
  }
}

const justfile = readFileSync("Justfile", "utf8");
if (!/github-release-package:/.test(justfile)) {
  failures.push("Justfile: github-release-package command missing");
}

const releaseDocs = readFileSync("apps/docs/content/docs/release.mdx", "utf8");
for (const expected of ["release:github:package", "gh release create", "--draft", "--verify-tag"]) {
  if (!releaseDocs.includes(expected)) {
    failures.push(`release docs must mention ${expected}`);
  }
}

const spec = readFileSync(
  "openspec/changes/ship-linkedin-exporter-v0-1-0/specs/release-validation/spec.md",
  "utf8"
);
if (!/GitHub Release/.test(spec)) {
  failures.push("release-validation spec must cover GitHub Release packaging");
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}
