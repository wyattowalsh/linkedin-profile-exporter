import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const docsDir = join("content/docs");
const outDir = join("dist");
const docs = readdirSync(docsDir)
  .filter((file) => file.endsWith(".mdx"))
  .sort();

mkdirSync(outDir, { recursive: true });

const pages = docs.map((file) => {
  const text = readFileSync(join(docsDir, file), "utf8");
  const title = /^title:\s*(.+)$/m.exec(text)?.[1] ?? file.replace(/\.mdx$/, "");
  const body = text.replace(/^---[\s\S]*?---\n/, "").trim();
  return { file, title, body };
});

writeFileSync(
  join(outDir, "llms.txt"),
  [
    "# LinkedIn Profile Exporter Docs",
    "",
    ...pages.flatMap((page) => [`## ${page.title}`, page.body.replace(/<[^>]+>/g, ""), ""])
  ].join("\n")
);

writeFileSync(
  join(outDir, "sitemap.xml"),
  [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...pages.map((page) => `  <url><loc>https://linkedin-profile-exporter.local/docs/${page.file.replace(/\.mdx$/, "")}</loc></url>`),
    "</urlset>",
    ""
  ].join("\n")
);

writeFileSync(
  join(outDir, "metadata.json"),
  JSON.stringify(
    {
      generatedAt: "2026-05-25T00:00:00.000Z",
      framework: "Fumadocs-compatible local MDX source",
      pages: pages.map((page) => ({ title: page.title, file: page.file }))
    },
    null,
    2
  )
);

console.log(`Built docs artifacts for ${pages.length} pages.`);
