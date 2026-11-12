import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/pwa-assets.json", headers: [{ key: "Cache-Control", value: "no-store" }] }, { source: "/sw.js", headers: [
      { key: "Content-Type", value: "application/javascript; charset=utf-8" },
      { key: "Cache-Control", value: "no-store, max-age=0" },
      { key: "Service-Worker-Allowed", value: "/" },
    ] }];
  },
  typescript: { tsconfigPath: "tsconfig.app.json" },
  experimental: { useTypeScriptCli: false },
};

export default nextConfig;
