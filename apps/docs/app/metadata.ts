import type { Metadata } from "next";

export const siteMetadata: Metadata = {
  title: {
    default: "LinkedIn Profile Exporter",
    template: "%s | LinkedIn Profile Exporter"
  },
  description: "Local-explicit LinkedIn profile extraction, validation, and export documentation.",
  metadataBase: new URL("https://linkedin-profile-exporter.local"),
  openGraph: {
    title: "LinkedIn Profile Exporter",
    description: "Export accessible LinkedIn profile data locally to structured formats.",
    images: ["/social/github-preview.svg"],
    type: "website"
  }
};
