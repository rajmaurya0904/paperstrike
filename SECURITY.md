# Security

Paperstrike stores your broker API keys in `data/.env` (or in the Docker
volume) on your own machine. It's built as a **single-user, local** app:

- The data service binds to `127.0.0.1`, and Docker publishes its ports on `127.0.0.1` too.
- It checks the `Host` header on every request and websocket, which blocks DNS rebinding.
- Websockets and requests that change anything must come from the web app's
  origin, and writes must send JSON, so another website can't quietly read the
  feed or write to the service. Oversized requests are refused.
- Secrets are never returned by any endpoint. Keys are checked for line breaks
  and control characters before they're written, and `.env` is written
  atomically with owner-only permissions (`chmod 600`; the launcher's state
  folder is `700`).
- The Upstox login uses an OAuth `state` check, keeps only a few pending logins,
  and reports failures to the web app as fixed codes rather than free text.
- The web app sends a Content-Security-Policy that limits where the page can
  connect and load images from, plus `frame-ancestors 'none'` and
  `X-Frame-Options: DENY` against clickjacking.
- The broker adapters only read market data. No code path places an order.
- Python and npm dependencies are pinned; Dependabot proposes updates.

**Don't expose the data service to a network or the internet.** It has no user
accounts. If you need remote access, put it behind your own authentication
(for example a VPN or an SSH tunnel).

## Reporting a vulnerability

Please don't open a public issue for a security problem. Use GitHub's
[private vulnerability reporting](https://github.com/rajmaurya0904/paperstrike/security/advisories/new)
instead.
