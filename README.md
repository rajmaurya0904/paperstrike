# Paperstrike

**Practice NSE index options with real market data and zero real money.**
Bring your own Upstox or Groww API key, run it on your own machine, and trade a
virtual account against the live option chain.

> Paperstrike never places a real order. Your broker keys are used only to read
> market data, and they never leave your computer.

## Features

- **Live option chain.** NIFTY, BANK NIFTY and SENSEX with calls and puts on either side of the strike, OI and OI change, IV, delta and bid/ask. The ATM strike is highlighted.
- **Charts.** 1m, 5m, 15m and 1D candles for the index and any option, with an OI-buildup overlay. You can drag your stop-loss and target lines on the chart.
- **Paper trading.** Market and limit orders, stop-loss, target and trailing-stop brackets, live P&L, one-click square-off and a scalp mode.
- **Strategies.** 19 multi-leg structures (straddles, strangles, spreads, iron condors and more) with payoff charts and breakevens.
- **Breakout plans.** 9:16, 9:20 and opening-range plans that you arm and that fire once.
- **Realistic costs.** Brokerage, STT, exchange and SEBI fees, GST and stamp duty at FY 2026-27 rates, plus SPAN and exposure margin when you write options.
- **Portfolio.** Equity curve, win rate, average win and loss, and max drawdown.
- **No made-up prices.** If the feed is down, the app says "No data available" instead of showing a fake price.

## Bring your own key

| | Upstox | Groww |
|---|---|---|
| Cost | Free API | Trade API plan **with live data** (not in the free trial) |
| Daily login | Yes. Tokens expire at 03:30 IST; one click with "Log in with Upstox" | **No** with TOTP keys (Paperstrike mints a new token itself) |
| Get keys | [Upstox developer apps](https://account.upstox.com/developer/apps) | [Groww Trade API](https://groww.in/trade-api) → API keys |

Open **Settings** in the app, pick your broker and paste your keys. The data
service checks them with the broker before saving them to `data/.env` (or to
the Docker volume). The browser never sees them again.

**Upstox:** when you create the app, set its redirect URL to
`http://localhost:8000/auth/upstox/callback`.

## Quick start (Docker)

```bash
git clone https://github.com/rajmaurya0904/paperstrike.git
cd paperstrike
docker compose up --build
```

Then open <http://localhost:3000> and go to **Settings → Connect your broker**.

## Manual setup

You need Python 3.11+ and Node 22+.

```bash
# data service (terminal 1)
cd data
python -m venv .venv
.venv/bin/pip install -r requirements.txt        # Windows: .venv\Scripts\pip
.venv/bin/python -m uvicorn server:app --host 127.0.0.1 --port 8000

# web app (terminal 2)
cd web
npm install
npm run dev
```

Open <http://localhost:3000>.

## How it works

```
Upstox / Groww ──► data/ (FastAPI) ──► web/ (Next.js) ──► your browser
                   │ one upstream feed, relayed at ~1 Hz
                   │ OI / IV refreshed from REST every 5 s
                   └ paper.db: your virtual account (SQLite)
```

- `data/providers/` holds one adapter per broker behind a small interface (`base.py`). To add a broker, write a new adapter and register it in `providers/__init__.py`. See [CONTRIBUTING.md](CONTRIBUTING.md).
- `data/relay.py` keeps a single upstream connection for all three indices and pushes snapshots to every open browser tab.
- `web/src/lib/` contains the paper-trading engine: fills, brackets, charges, margin, strategies and breakouts.

## Security

The data service holds your broker keys, so by default:

- it listens only on `127.0.0.1`, and Docker publishes its ports on `127.0.0.1` too
- it only answers requests from the web app's origin and from local hostnames, which blocks other websites and DNS-rebinding attacks
- `/status` reports only whether you're connected and never returns a secret
- the Upstox login uses an OAuth `state` check

**Don't expose it to the internet.** It's a single-user app with no login.
See [SECURITY.md](SECURITY.md).

## Checks

```bash
cd web && npm run check          # charges, margin, strategies, breakout, contrast
cd data && python -m pytest tests
```

## Disclaimer

Paperstrike is an educational simulator. It is not a broker, holds no funds and
routes no orders. It does not give investment advice. Simulated results don't
include real slippage, liquidity or partial fills, and derivatives carry a
substantial risk of loss. Market data comes from your own broker account under
that broker's API terms. Upstox and Groww are trademarks of their owners; this
project isn't affiliated with or endorsed by either.

## License

[AGPL-3.0](LICENSE). If you run a modified version as a service for other
people, you have to publish your changes.

Built by [@rajmaurya0904](https://github.com/rajmaurya0904).
