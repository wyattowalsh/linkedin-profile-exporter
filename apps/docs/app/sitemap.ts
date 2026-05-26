import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://linkedin-profile-exporter.local";
  return [
    "",
    "/docs",
    "/docs/install",
    "/docs/usage",
    "/docs/settings-privacy",
    "/docs/export-formats",
    "/docs/browser-targets",
    "/docs/bookmarklet",
    "/docs/development",
    "/docs/release"
  ].map((path) => ({
    url: `${base}${path}`,
    lastModified: new Date("2026-05-25T00:00:00.000Z")
  }));
}
