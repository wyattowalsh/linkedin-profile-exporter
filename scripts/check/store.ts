import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const stores = ["chrome", "edge", "firefox", "safari", "mobile-safari", "mobile-chrome"];
const failures: string[] = [];

for (const store of stores) {
  const dir = join("packages/web-store/listings", store);
  for (const file of ["metadata.json", "listing.md", "screenshots.md", "release-checklist.md"]) {
    const path = join(dir, file);
    try {
      if (!statSync(path).isFile()) failures.push(`${path}: not a file`);
    } catch {
      failures.push(`${path}: missing`);
      continue;
    }
    const text = readFileSync(path, "utf8");
    if (/password|secret|submission token|api key/i.test(text)) failures.push(`${path}: contains credentialed submission language`);
  }
  const metadata = JSON.parse(readFileSync(join(dir, "metadata.json"), "utf8")) as {
    target: string;
    status: string;
    categories: string[];
  };
  if (metadata.target !== store) failures.push(`${dir}/metadata.json: target mismatch`);
  if (!metadata.categories.length) failures.push(`${dir}/metadata.json: categories missing`);
}

const researchFiles = readdirSync("packages/web-store/research").filter((file) => file.endsWith(".md"));
if (researchFiles.length < stores.length) failures.push("web-store research notes must cover each target store");

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}
