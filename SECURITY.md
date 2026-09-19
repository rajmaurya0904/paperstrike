# Security

Paperstrike stores your broker API keys in `data/.env` (or in the Docker
volume) on your own machine. It's built as a **single-user, local** app:

- The data service binds to `127.0.0.1`, and Docker publishes its ports on `127.0.0.1` too.
- It checks the `Host` header, which blocks DNS rebinding.
- Requests that change anything must come from the web app's origin and send
  JSON, so another website can't quietly write to it.
- Secrets are never returned by any endpoint.
- The broker adapters only read market data. No code path places an order.

**Don't expose the data service to a network or the internet.** It has no user
accounts. If you need remote access, put it behind your own authentication
(for example a VPN or an SSH tunnel).

## Reporting a vulnerability

Please don't open a public issue for a security problem. Use GitHub's
[private vulnerability reporting](https://github.com/rajmaurya0904/paperstrike/security/advisories/new)
instead.
