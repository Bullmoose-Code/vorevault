import type { NextConfig } from "next";

const config: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  serverExternalPackages: ["sharp", "fluent-ffmpeg"],
};

export default config;
