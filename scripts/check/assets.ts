import { readFileSync, statSync } from "node:fs";

interface AssetMetadata {
  icon: {
    path: string;
    width: number;
    height: number;
    transparent: boolean;
    noTextManualReview: boolean;
  };
  social: Array<{
    path: string;
    width: number;
    height: number;
  }>;
}

const metadata = JSON.parse(readFileSync("assets/metadata.json", "utf8")) as AssetMetadata;
const failures: string[] = [];

checkFile(metadata.icon.path);
if (metadata.icon.width < 128 || metadata.icon.height < 128) failures.push("icon dimensions must be at least 128x128");
if (!metadata.icon.transparent) failures.push("icon metadata must declare transparent background");
if (!metadata.icon.noTextManualReview) failures.push("icon must have manual no-text review");
if (readFileSync(metadata.icon.path, "utf8").includes("<text")) failures.push("icon SVG must not contain text nodes");

for (const social of metadata.social) {
  checkFile(social.path);
  if (social.width < 1200 || social.height < 630) failures.push(`${social.path}: social preview must be at least 1200x630`);
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
