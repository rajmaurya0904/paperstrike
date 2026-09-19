export type OptionSide = "CE" | "PE";

export interface OptionQuote {
  instrumentKey: string;
  ltp: number;
  bid: number;
  ask: number;
  oi: number;
  changeOi: number;
  iv: number;
  delta: number;
  volume: number;
  close: number; // previous day close, for intraday % move
}

export interface ChainRow {
  strike: number;
  ce: OptionQuote;
  pe: OptionQuote;
}

export interface MarketSnapshot {
  id: string; // NIFTY | BANKNIFTY | SENSEX
  key: string; // canonical instrument key for the underlying (e.g. NSE_INDEX|Nifty 50)
  label: string;
  lot: number; // contract size — comes from the broker, never hardcode it
  spot: number;
  prevClose: number;
  expiry: string;
  rows: ChainRow[];
  updatedAt: number;
}

/** Every index the feed carries, keyed by id. */
export type Markets = Record<string, MarketSnapshot>;

export type OrderSide = "BUY" | "SELL";
export type OrderType = "MARKET" | "LIMIT";
export type OrderStatus = "PENDING" | "FILLED" | "CANCELLED";

export interface Order {
  id: string;
  ts: number;
  instrumentKey: string;
  label: string; // e.g. "NIFTY 24800 CE"
  side: OrderSide;
  type: OrderType;
  qty: number; // units (lots * lotSize)
  limitPrice?: number;
  fillPrice?: number;
  stopLoss?: number; // premium level; attaches to the position on fill
  target?: number;
  trail?: number; // trailing-stop distance in premium points; ratchets the SL
  status: OrderStatus;
}

export interface Position {
  instrumentKey: string;
  label: string;
  qty: number; // signed: + long, - short
  avgPrice: number;
  realized: number;
  /** charges paid opening the qty still held — expensed into realized on exit */
  charges: number;
  /** SPAN + exposure blocked against a short leg; 0 when long */
  margin: number;
  stopLoss?: number;
  target?: number;
  /** trailing-stop distance in premium points; ratchets stopLoss toward price */
  trail?: number;
}

export interface Trade {
  id: string;
  ts: number;
  instrumentKey: string;
  label: string;
  side: OrderSide;
  qty: number;
  price: number;
  realized: number; // realized P&L booked by this trade, net of charges (closes)
  charges: number; // brokerage + statutory charges on this leg
}

export interface Account {
  name: string;
  startingBalance: number;
  balance: number; // cash after realized P&L and premiums
  createdAt: number;
  equityHistory: { ts: number; equity: number }[];
}
