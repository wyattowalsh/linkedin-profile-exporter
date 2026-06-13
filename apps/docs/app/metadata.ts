import type { Metadata } from "next";

export const siteMetadata: Metadata = {
  title: {
    default: "LinkedIn Profile Exporter",
    template: "%s | LinkedIn Profile Exporter"
  },
  description: "Local-explicit LinkedIn profile extraction, validation, and export documentation.",
  metadataBase: new URL("https://linkedin-profile-exporter.local"),
  icons: {
    icon: "/icon/linkedin-profile-exporter-icon.png",
    shortcut: "/icon/linkedin-profile-exporter-icon.png"
  },
  openGraph: {
    title: "LinkedIn Profile Exporter",
    description: "Export accessible LinkedIn profile data locally to structured formats.",
    images: [
      {
        url: "/social/github-preview.png",
        width: 1280,
        height: 640,
        alt: "LinkedIn Profile Exporter profile-to-export visual"
      }
    ],
    type: "website"
  },
  twitter: {
    card: "summary_large_image",
    title: "LinkedIn Profile Exporter",
    description: "Export accessible LinkedIn profile data locally to structured formats.",
    images: ["/social/github-preview.png"]
  }
};
