# Contributing to Paperstrike

Thanks for helping. Issues and pull requests are welcome.

## House rules

- **Never invent a price.** No demo or simulated market data, anywhere. If the
  feed is down, the UI says "No data available".
- **Numbers swap, they don't count up.** Live values change their digits
  directly, the way a broker terminal does. No rolling animations.
- **Charges and margin are modelled for real.** Don't simplify them away. Run
  `npm run check` after touching money or payoff code.
- **Never commit `.env` or `paper.db`.**
- **Never place orders.** Adapters may only call a broker's market-data endpoints.

## Adding a broker

1. Create `data/providers/<broker>.py` with a `Provider` subclass (see
   `providers/base.py`). You need to implement:
   - `status()` / `connect(fields)`: validate the user's keys and save them with `config.save()`
   - `nearest_expiry()`, `chain()`, `prev_close()`, `candles()`
   - `stream(keys, on_tick, stop)`: block while pushing `{key: {ltp, bid, ask, …}}` until `stop` is set
2. Use the canonical instrument keys `NSE_FO|<exchange token>` and
   `BSE_FO|<exchange token>`. The index keys are fixed in `base.INDICES`.
3. Register the instance in `providers/__init__.py`, add its keys to
   `config.KEYS`, and add a form to `web/src/components/broker-connect.tsx`.
4. Add tests in `data/tests/` against the broker's documented payloads. They
   shouldn't need network access or keys.

## Dev setup

See the README's "Manual setup". Before opening a PR:

```bash
cd web && npx tsc --noEmit && npm run lint && npm run check && npm run build
cd data && pip install -r requirements-dev.txt && python -m pytest tests
```

Set `API_DOCS=1` when starting the data service to get FastAPI's interactive
docs at <http://localhost:8000/docs>. They're off by default because they load
scripts from a CDN.

By contributing, you agree that your contributions are licensed under AGPL-3.0.
