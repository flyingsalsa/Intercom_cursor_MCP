import { getHyperliquidClient, checkRateLimit } from "./client.js";
import type { Candle } from "./types.js";

export type CandleInterval = "1m" | "3m" | "5m" | "15m" | "30m" | "1h" | "2h" | "4h" | "8h" | "12h" | "1d" | "3d" | "1w" | "1M";

export interface GetMarketCandlesInput {
  asset: string;
  interval?: CandleInterval;
  startTime?: number;
  endTime?: number;
  limit?: number;
}

export interface FormattedCandle {
  timestamp: string;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  trades: number;
}

const INTERVAL_MS: Record<string, number> = {
  "1m": 60000, "3m": 180000, "5m": 300000, "15m": 900000, "30m": 1800000,
  "1h": 3600000, "2h": 7200000, "4h": 14400000, "8h": 28800000, "12h": 43200000,
  "1d": 86400000, "3d": 259200000, "1w": 604800000, "1M": 2592000000,
};

export async function getMarketCandles(input: GetMarketCandlesInput): Promise<FormattedCandle[]> {
  if (!checkRateLimit(5)) throw new Error("Rate limit exceeded. Please wait before making more requests.");
  const client = getHyperliquidClient();
  const interval: CandleInterval = input.interval ?? "15m";
  const limit = input.limit ?? 100;
  const endTime = input.endTime ?? Date.now();
  const startTime = input.startTime ?? endTime - INTERVAL_MS[interval] * limit;
  const coin = input.asset.includes(":") ? input.asset : input.asset.toUpperCase();
  const candles = (await client.candleSnapshot({ coin, interval, startTime, endTime })) as Candle[];
  return candles.slice(0, limit).map((c) => ({
    timestamp: new Date(c.t).toISOString(),
    open: c.o,
    high: c.h,
    low: c.l,
    close: c.c,
    volume: c.v,
    trades: c.n,
  }));
}
