import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from "node:fs";
import { basename, join, relative } from "node:path";

interface ReleaseAsset {
  path: string;
  label: string;
}

const root = process.cwd();
const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
  version: string;
};
const version = packageJson.version;
const tag = readArg("--tag") ?? `v${version}`;

if (!/^v\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(tag)) {
  fail(`Release tag must look like v0.1.0, got ${tag}`);
}

const releaseRoot = join(root, ".release", "github", tag);
const assetsDir = join(releaseRoot, "assets");
const notesPath = join(releaseRoot, "release-notes.md");
const commandPath = join(releaseRoot, "gh-release-command.txt");
const checksumsPath = join(assetsDir, "SHA256SUMS.txt");

rmSync(releaseRoot, { recursive: true, force: true });
mkdirSync(assetsDir, { recursive: true });

const assets: ReleaseAsset[] = [];

for (const target of [
  {
    outputDir: "apps/extension/.output/chrome-mv3",
    filename: `linkedin-profile-exporter-${version}-chrome-mv3.zip`,
    label: "Chrome MV3 extension package"
  },
  {
    outputDir: "apps/extension/.output/edge-mv3",
    filename: `linkedin-profile-exporter-${version}-edge-mv3.zip`,
    label: "Edge MV3 extension package"
  },
  {
    outputDir: "apps/extension/.output/firefox-mv2",
    filename: `linkedin-profile-exporter-${version}-firefox-mv2.zip`,
    label: "Firefox MV2 extension package"
  },
  {
    outputDir: "apps/extension/.output/safari-mv2",
    filename: `linkedin-profile-exporter-${version}-safari-mv2-web-extension.zip`,
    label: "Safari MV2 web extension package"
  }
]) {
  const sourceDir = join(root, target.outputDir);
  assertFile(join(sourceDir, "manifest.json"), `${target.outputDir}/manifest.json`);
  const outPath = join(assetsDir, target.filename);
  zipDirectory(sourceDir, outPath);
  assets.push({ path: outPath, label: target.label });
}

const bookmarkletDir = join(root, "packages/bookmarklet/generated");
assertFile(join(bookmarkletDir, "bookmarklet.js"), "packages/bookmarklet/generated/bookmarklet.js");
assertFile(join(bookmarkletDir, "installer.html"), "packages/bookmarklet/generated/installer.html");
const bookmarkletZip = join(assetsDir, `linkedin-profile-exporter-${version}-bookmarklet.zip`);
zipDirectory(bookmarkletDir, bookmarkletZip);
assets.push({ path: bookmarkletZip, label: "Bookmarklet package" });

const sourceZip = join(assetsDir, `linkedin-profile-exporter-${version}-source-review.zip`);
zipSourceTree(sourceZip);
assets.push({ path: sourceZip, label: "Source review package" });

const checksumRows = assets.map((asset) => `${sha256(asset.path)}  ${basename(asset.path)}`);
writeFileSync(checksumsPath, `${checksumRows.join("\n")}\n`);
assets.push({ path: checksumsPath, label: "SHA-256 checksums" });

writeFileSync(notesPath, buildReleaseNotes(assets));

writeFileSync(commandPath, buildGhReleaseCommand(assets));

console.log(`GitHub Release packet written to ${relative(root, releaseRoot)}`);
console.log(`Review ${relative(root, notesPath)} before running:`);
console.log(`  ${relative(root, commandPath)}`);

function readArg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

function assertFile(path: string, label: string): void {
  try {
    if (!statSync(path).isFile()) fail(`${label} is not a file`);
  } catch {
    fail(`${label} is missing. Run the release builds before packaging GitHub Release assets.`);
  }
}

function zipDirectory(sourceDir: string, outPath: string): void {
  run("zip", ["-qr", outPath, "."], sourceDir);
}

function zipSourceTree(outPath: string): void {
  const files = run("git", ["ls-files", "--cached", "--modified", "--others", "--exclude-standard"], root)
    .stdout.split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .filter((line) => existsSync(join(root, line)) && statSync(join(root, line)).isFile());

  if (files.length === 0) fail("No source files found for source review ZIP");

  run("zip", ["-q", outPath, "-@"], root, `${files.join("\n")}\n`);
}

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function buildReleaseNotes(releaseAssets: ReleaseAsset[]): string {
  const assetList = releaseAssets
    .map((asset) => `- \`${basename(asset.path)}\`: ${asset.label}`)
    .join("\n");

  return `# LinkedIn Profile Exporter ${tag}

Local-explicit LinkedIn profile exporter release package.

## Assets

${assetList}

## Validation

Run \`mise exec node@24 -- just ci\` before publishing this release.

## Publishing Notes

- Create the GitHub Release as a draft first.
- Use \`--verify-tag\` so the release cannot create a tag from an unintended commit.
- Keep browser-store submissions separate from this GitHub Release packet.
- Do not attach credentials, cookies, private profile exports, or live LinkedIn data.
`;
}

function buildGhReleaseCommand(releaseAssets: ReleaseAsset[]): string {
  const args = releaseAssets
    .map((asset) => quote(`${relative(root, asset.path)}#${asset.label}`))
    .map((asset, index, list) => `  ${asset}${index === list.length - 1 ? "" : " \\"}`)
    .join("\n");

  return `# Review release notes and assets before running.
# The tag must already exist on the remote because --verify-tag is set.
gh release create ${quote(tag)} \\
  --draft \\
  --verify-tag \\
  --title ${quote(`LinkedIn Profile Exporter ${tag}`)} \\
  --notes-file ${quote(relative(root, notesPath))} \\
${args}
`;
}

function quote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function run(command: string, args: string[], cwd: string, input?: string): { stdout: string } {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    input,
    stdio: input === undefined ? ["ignore", "pipe", "pipe"] : ["pipe", "pipe", "pipe"]
  });

  if (result.status !== 0) {
    fail(
      `${command} ${args.join(" ")} failed${result.stderr ? `:\n${result.stderr.trim()}` : ""}`
    );
  }

  return { stdout: result.stdout };
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}
