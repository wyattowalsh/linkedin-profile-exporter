import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const requiredDocs = [
  "index.mdx",
  "install.mdx",
  "usage.mdx",
  "settings-privacy.mdx",
  "export-formats.mdx",
  "browser-targets.mdx",
  "bookmarklet.mdx",
  "development.mdx",
  "release.mdx"
];

const failures: string[] = [];
for (const doc of requiredDocs) {
  const path = join("apps/docs/content/docs", doc);
  try {
    if (!statSync(path).isFile()) failures.push(`${path}: not a file`);
  } catch {
    failures.push(`${path}: missing`);
    continue;
  }
  const text = readFileSync(path, "utf8");
  if (!text.includes("title:")) failures.push(`${path}: missing frontmatter title`);
  if (doc === "usage.mdx") {
    if (!text.includes("show the `IN` badge")) {
      failures.push(`${path}: active toolbar badge text must document the IN badge`);
    }
    if (text.includes("show the `ON` badge")) {
      failures.push(`${path}: stale active toolbar badge text documents ON instead of IN`);
    }
  }
}

for (const path of [
  "apps/docs/source.config.ts",
  "apps/docs/fumadocs.config.json",
  "apps/docs/app/metadata.ts",
  "apps/docs/app/sitemap.ts",
  "apps/docs/app/docs/[[...slug]]/page.tsx",
  "apps/docs/lib/source.ts",
  "apps/docs/scripts/build-docs.ts"
]) {
  try {
    if (!statSync(path).isFile()) failures.push(`${path}: missing`);
  } catch {
    failures.push(`${path}: missing`);
  }
}

const docs = readdirSync("apps/docs/content/docs").filter((file) => file.endsWith(".mdx"));
if (docs.length < requiredDocs.length) failures.push("docs content inventory is incomplete");

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}
