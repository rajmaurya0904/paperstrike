import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // stray lockfile in the user home dir confuses workspace-root inference
  turbopack: { root: path.join(__dirname) },
};

export default nextConfig;
