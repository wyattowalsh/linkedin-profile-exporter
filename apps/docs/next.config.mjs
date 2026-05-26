import { createMDX } from "fumadocs-mdx/next";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

const nextConfig = {
  output: "export",
  outputFileTracingRoot: repoRoot,
  reactStrictMode: true,
  images: {
    unoptimized: true
  }
};

const withMDX = createMDX();

export default withMDX(nextConfig);
