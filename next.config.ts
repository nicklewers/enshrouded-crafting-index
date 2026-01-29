import type { NextConfig } from "next";

// For GitHub Pages: set NEXT_PUBLIC_BASE_PATH to repo name, e.g. /enshrouded-crafting-index
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const nextConfig: NextConfig = {
  output: "export",
  basePath: basePath || undefined,
  assetPrefix: basePath || undefined,
};
export default nextConfig;
