// What a paper account is worth, marked to market.
//
// `balance` is cash: buying an option pays the premium out of it and writing
// one pays the premium in. So the account's value is that cash plus every open
// position at its last traded price, with a short counted as a liability
// (signed qty). Adding only the unrealised P&L to cash would count every
// premium paid as lost until the position closed. Run `npm run check:equity`
// after changing anything here.

// type-only, so Node's type stripping erases it when the self-check runs this file directly
import type { Position } from "./types";

type Held = Pick<Position, "instrumentKey" | "qty" | "avgPrice">;
type LtpOf = (instrumentKey: string) => number | undefined;

// no quote (feed down, strike out of the window) or an untraded 0: hold at cost
const markOf = (p: Held, ltpOf: LtpOf) => {
  const ltp = ltpOf(p.instrumentKey);
  return ltp != null && ltp > 0 ? ltp : p.avgPrice;
};

export function markToMarket(balance: number, positions: Held[], ltpOf: LtpOf): number {
  return positions.reduce((v, p) => v + p.qty * markOf(p, ltpOf), balance);
}

export function unrealizedPnl(positions: Held[], ltpOf: LtpOf): number {
  return positions.reduce((v, p) => v + (markOf(p, ltpOf) - p.avgPrice) * p.qty, 0);
}
