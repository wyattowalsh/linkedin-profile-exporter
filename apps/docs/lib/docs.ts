import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface DocPage {
  slug: string[];
  href: string;
  file: string;
  title: string;
  description: string;
  body: string;
}

const docsDir = join(process.cwd(), "content/docs");

export function getDocs(): DocPage[] {
  return readdirSync(docsDir)
    .filter((file) => file.endsWith(".mdx"))
    .sort((a, b) => orderFor(a) - orderFor(b))
    .map((file) => {
      const text = readFileSync(join(docsDir, file), "utf8");
      const frontmatter = /^---\n([\s\S]*?)\n---\n/.exec(text)?.[1] ?? "";
      const title = /^title:\s*(.+)$/m.exec(frontmatter)?.[1] ?? file.replace(/\.mdx$/, "");
      const description = /^description:\s*(.+)$/m.exec(frontmatter)?.[1] ?? "";
      const slug = file === "index.mdx" ? [] : [file.replace(/\.mdx$/, "")];
      return {
        slug,
        href: `/docs${slug.length ? `/${slug.join("/")}` : ""}`,
        file,
        title,
        description,
        body: text.replace(/^---[\s\S]*?---\n/, "").trim()
      };
    });
}

export function getDoc(slug: string[] = []): DocPage | undefined {
  return getDocs().find((page) => page.slug.join("/") === slug.join("/"));
}

function orderFor(file: string): number {
  const order = ["index.mdx", "install.mdx", "usage.mdx", "settings-privacy.mdx", "export-formats.mdx", "browser-targets.mdx", "bookmarklet.mdx", "development.mdx", "release.mdx"];
  const index = order.indexOf(file);
  return index === -1 ? order.length : index;
}
