import type { ReactNode } from "react";
import { RootProvider } from "fumadocs-ui/provider/next";
import { siteMetadata } from "./metadata";
import "./styles.css";

export const metadata = siteMetadata;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <RootProvider>{children}</RootProvider>
      </body>
    </html>
  );
}
