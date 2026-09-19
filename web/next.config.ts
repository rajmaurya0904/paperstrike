import type { NextConfig } from "next";
import path from "path";

const isDev = process.env.NODE_ENV === "development";
// the browser talks to the data service directly (REST + websocket)
const dataUrl = new URL(process.env.NEXT_PUBLIC_DATA_URL ?? "http://localhost:8000");
const dataWs = `${dataUrl.protocol === "https:" ? "wss:" : "ws:"}//${dataUrl.host}`;

// No nonces: every page is static, so inline scripts need 'unsafe-inline'. The
// policy still pins where the page may connect and load images from, and stops
// other sites from framing the trading screens (clickjacking).
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  // the footer shows the author's GitHub avatar
  "img-src 'self' data: blob: https://github.com https://avatars.githubusercontent.com",
  "font-src 'self' data:",
  `connect-src 'self' ${dataUrl.origin} ${dataWs}${isDev ? " ws:" : ""}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const nextConfig: NextConfig = {
  // stray lockfile in the user home dir confuses workspace-root inference
  turbopack: { root: path.join(__dirname) },
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
