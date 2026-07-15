import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep Turbopack scoped to this app. The repository also has a root-level
  // lockfile, which otherwise makes Next infer C:\Project\floxa as the root.
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
