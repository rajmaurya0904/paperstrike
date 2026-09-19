"""Groww adapter against the payload shapes in Groww's docs — no network, no keys.

Run: python -m pytest tests   (from data/)
"""


from providers.groww import Groww, _epoch, _fields, _prev_close, _walk  # noqa: E402

CE, PE = "NIFTY2692225000CE", "NIFTY2692225000PE"


def _groww():
    g = Groww()
    g._inst = {
        "by_symbol": {("NSE", CE): "NSE_FO|101", ("NSE", PE): "NSE_FO|102"},
        "by_token": {
            "NSE_FO|101": {"exchange": "NSE", "trading_symbol": CE, "groww_symbol": "NSE-NIFTY-22Sep26-25000-CE",
                           "exchange_token": "101"},
            "NSE_FO|102": {"exchange": "NSE", "trading_symbol": PE, "groww_symbol": "NSE-NIFTY-22Sep26-25000-PE",
                           "exchange_token": "102"},
        },
        "options": {},
    }
    g._inst_at = 1e18
    g._want_ref = lambda key: None  # no background quote fetches in tests
    return g


CHAIN = {  # the documented get_option_chain response
    "underlying_ltp": 25041.7,
    "strikes": {
        "25000": {
            "CE": {"greeks": {"delta": 0.55, "iv": 12.5}, "trading_symbol": CE, "ltp": 120.5,
                   "open_interest": 5000, "volume": 900},
            "PE": {"greeks": {"delta": -0.45, "iv": 13.1}, "trading_symbol": PE, "ltp": 80.0,
                   "open_interest": 7000, "volume": 1100},
        },
        "99999": {"CE": {"trading_symbol": "UNKNOWN"}},  # not in the instrument master → dropped
    },
}


def test_chain_maps_documented_payload():
    g = _groww()
    g._call = lambda fn, **kw: CHAIN
    g._ref = {"NSE_FO|101": {"prev_oi": 4000.0, "close": 110.0}}
    g._ref_day = __import__("datetime").date.today().isoformat()

    chain = g.chain("NIFTY", "2026-09-22")
    assert chain.spot == 25041.7
    assert len(chain.rows) == 1
    row = chain.rows[0]
    assert row.strike == 25000.0
    assert row.ce.key == "NSE_FO|101" and row.pe.key == "NSE_FO|102"
    assert row.ce.ltp == 120.5 and row.ce.iv == 12.5 and row.ce.delta == 0.55
    assert row.ce.change_oi == 1000.0 and row.ce.close == 110.0
    assert row.pe.change_oi == 0.0  # previous OI not fetched yet → no invented change


def test_feed_fields():
    assert _fields("index", {"value": 25010.5}) == {"ltp": 25010.5}
    assert _fields("ltp", {"ltp": 121.0, "openInterest": 1}) == {"ltp": 121.0}
    depth = {"buyBook": {"1": {"price": 120.9, "qty": 75}}, "sellBook": {"1": {"price": 121.1, "qty": 150}}}
    assert _fields("depth", depth) == {"bid": 120.9, "ask": 121.1}
    assert _fields("depth", {"buyBook": {}, "sellBook": {}}) == {}


def test_walk_flattens_feed_tree():
    tree = {"NSE": {"FNO": {"101": {"ltp": 1.0}, "102": None}}}
    assert list(_walk(tree)) == [(("NSE", "FNO", "101"), {"ltp": 1.0})]


def test_prev_close_and_epochs():
    assert _prev_close({"last_price": 105.0, "day_change": 5.0}) == 100.0
    assert _prev_close({"ohlc": {"close": 99.0}}) == 99.0
    assert _epoch(1746174479) == 1746174479
    assert _epoch(1746174479582) == 1746174479
    assert _epoch("2026-09-18T09:15:00+05:30") == 1789703100  # 03:45 UTC
