import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-hosted production uses the minimal vinext runtime emitted at
  // dist/standalone. This is the artifact copied into the Docker image.
  output: "standalone",
};

export default nextConfig;
