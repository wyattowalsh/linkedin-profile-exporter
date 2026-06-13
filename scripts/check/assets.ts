import { readFileSync, statSync } from "node:fs";

interface AssetMetadata {
  icon: {
    path: string;
    width: number;
    height: number;
    transparent: boolean;
    noTextManualReview: boolean;
    variants?: AssetVariant[];
  };
  social: AssetVariant[];
}

interface AssetVariant {
  path: string;
  width: number;
  height: number;
}

const metadata = JSON.parse(readFileSync("assets/metadata.json", "utf8")) as AssetMetadata;
const failures: string[] = [];

checkFile(metadata.icon.path);
checkDimensions(metadata.icon);
if (metadata.icon.width < 128 || metadata.icon.height < 128)
  failures.push("icon dimensions must be at least 128x128");
if (!metadata.icon.transparent) failures.push("icon metadata must declare transparent background");
if (!metadata.icon.noTextManualReview) failures.push("icon must have manual no-text review");
if (readFileSync(metadata.icon.path, "utf8").includes("<text"))
  failures.push("icon SVG must not contain text nodes");
for (const variant of metadata.icon.variants ?? []) {
  checkFile(variant.path);
  checkDimensions(variant);
  if (variant.path.endsWith(".svg") && readFileSync(variant.path, "utf8").includes("<text"))
    failures.push(`${variant.path}: icon SVG must not contain text nodes`);
}

for (const social of metadata.social) {
  checkFile(social.path);
  checkDimensions(social);
  if (social.width < 1200 || social.height < 630)
    failures.push(`${social.path}: social preview must be at least 1200x630`);
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

function checkFile(path: string): void {
  try {
    const stats = statSync(path);
    if (!stats.isFile()) failures.push(`${path}: not a file`);
  } catch {
    failures.push(`${path}: missing`);
  }
}

function checkDimensions(asset: AssetVariant): void {
  if (asset.path.endsWith(".png")) {
    const buffer = readFileSync(asset.path);
    if (buffer.length < 24 || buffer.toString("ascii", 1, 4) !== "PNG") {
      failures.push(`${asset.path}: expected PNG image`);
      return;
    }
    const width = buffer.readUInt32BE(16);
    const height = buffer.readUInt32BE(20);
    if (width !== asset.width || height !== asset.height) {
      failures.push(
        `${asset.path}: expected ${asset.width}x${asset.height}, got ${width}x${height}`
      );
    }
    return;
  }

  if (asset.path.endsWith(".svg")) {
    const svg = readFileSync(asset.path, "utf8");
    const width = Number(/\bwidth="(\d+)"/.exec(svg)?.[1]);
    const height = Number(/\bheight="(\d+)"/.exec(svg)?.[1]);
    if (width !== asset.width || height !== asset.height) {
      failures.push(
        `${asset.path}: expected ${asset.width}x${asset.height}, got ${width || "unknown"}x${height || "unknown"}`
      );
    }
  }
}
