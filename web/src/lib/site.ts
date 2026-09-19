// Project identity, in one place so forks can rebrand by editing a single file.
export const SITE = {
  name: "Paperstrike",
  tagline: "Practice NSE options with real market data and zero real money.",
  repo: "https://github.com/rajmaurya0904/paperstrike",
  install: "npx github:rajmaurya0904/paperstrike",
  author: { name: "Raj Maurya", handle: "rajmaurya0904", url: "https://github.com/rajmaurya0904" },
  license: "AGPL-3.0",
};

// The local data service. Baked in at build time, and next.config.ts pins the
// page's Content-Security-Policy to this origin.
export const DATA_URL = process.env.NEXT_PUBLIC_DATA_URL ?? "http://localhost:8000";
export const WS_URL = DATA_URL.replace(/^http/, "ws") + "/ws";
