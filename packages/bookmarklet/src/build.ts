import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createBookmarklet, createInstallerHtml } from "./index";

const out = join("generated");
mkdirSync(out, { recursive: true });
writeFileSync(join(out, "bookmarklet.js"), `${createBookmarklet()}\n`);
writeFileSync(join(out, "installer.html"), `${createInstallerHtml()}\n`);
console.log("Generated bookmarklet artifacts.");
