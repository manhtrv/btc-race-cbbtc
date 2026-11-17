import { runBars, type Bar, type BarsState } from './vendor/makefun-bars.ts';

const LOOKBACK = 8;
const ENTRY_BPS = 0n;
const REVERSAL_BPS = 55n;
const STOP_BPS = 200n;
const MAX_SLIPPAGE_BPS = 500;
const SCALE = 10_000n;

const closes: bigint[] = [];
let exitRequested = false;

function returnBelow(now: bigint, then: bigint, bps: bigint): boolean {
  return now * SCALE < then * (SCALE - bps);
}

function returnAbove(now: bigint, then: bigint, bps: bigint): boolean {
  return now * SCALE > then * (SCALE + bps);
}

await runBars({
  onBatch(state: BarsState, batch) {
    const bar = batch.bars.find((item: Bar) => item.symbol === 'CBBTC');
    if (!bar) return [];
    const close = BigInt(bar.c);
    closes.push(close);
    if (closes.length > LOOKBACK + 1) closes.shift();
    if (state.warmingUp || closes.length <= LOOKBACK) return [];

    const held = state.positions.get('CBBTC');
    const trend = returnAbove(close, closes[0], ENTRY_BPS);
    if (held) {
      const marked = state.value('CBBTC', held.qty);
      const stopped = marked * SCALE < held.cost * (SCALE - STOP_BPS);
      const reversed = returnBelow(close, closes[closes.length - 4]!, REVERSAL_BPS);
      if (exitRequested || stopped || reversed) {
        exitRequested = true;
        return [{ side: 'sell', symbol: 'CBBTC', qty: held.qty, max_slippage_bps: MAX_SLIPPAGE_BPS }];
      }
      return [];
    }

    exitRequested = false;
    if (trend && state.cash >= 1_000_000n) {
      return [{ side: 'buy', symbol: 'CBBTC', notional_quote_units: state.cash, max_slippage_bps: MAX_SLIPPAGE_BPS }];
    }
    return [];
  },
});
