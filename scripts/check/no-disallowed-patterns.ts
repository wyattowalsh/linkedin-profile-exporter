import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const roots = ["README.md", "AGENTS.md", "apps", "packages", "assets", "openspec", "scripts", ".github"];
const ignored = new Set(["node_modules", ".output", ".next", "dist", "coverage", ".git"]);
const secretPattern = /(linkedin[_-]?(cookie|token|password)|client_secret|api[_-]?key|bearer\s+[a-z0-9._-]{12,})/i;

const failures: string[] = [];

for (const file of walk(roots)) {
  const text = readFileSync(file, "utf8");
  if (file !== "scripts/check/no-disallowed-patterns.ts" && secretPattern.test(text)) {
    failures.push(`${file}: contains a secret-looking literal`);
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

function* walk(entries: string[]): Generator<string> {
  for (const entry of entries) {
    let stats;
    try {
      stats = statSync(entry);
    } catch {
      continue;
    }
    if (stats.isFile()) {
      yield entry;
      continue;
    }
    for (const child of readdirSync(entry)) {
      if (ignored.has(child) || child === ".DS_Store") continue;
      yield* walk([join(entry, child)]);
    }
  }
}
