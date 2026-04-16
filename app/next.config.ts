import type { NextConfig } from "next";

const config: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  serverExternalPackages: ["file-type", "sharp", "fluent-ffmpeg"],
};

export default config;
