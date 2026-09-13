import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Only matters for `next dev` (blocks cross-origin access to dev-only
  // assets like HMR/websocket, unrelated to CORS_ORIGINS/the API) — never
  // needed for production (`next build` + `next start`, or the Docker
  // image), so this stays empty unless a comma-separated
  // NEXT_DEV_ALLOWED_ORIGINS is set. Add your own dev-time domain there
  // rather than hardcoding it here, since it's specific to your machine's
  // setup (e.g. a reverse-proxied custom domain in front of `next dev`).
  allowedDevOrigins: process.env.NEXT_DEV_ALLOWED_ORIGINS
    ? process.env.NEXT_DEV_ALLOWED_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean)
    : [],
};

export default nextConfig;
