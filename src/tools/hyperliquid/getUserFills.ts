import { z } from "zod";
import { getHyperliquidClient, normalizeAddress, checkRateLimit } from "./client.js";
import type { UserFill } from "./types.js";

export const getUserFillsSchema = z.object({
  wallet_address: z.string().describe("User wallet address (0x...)"),
  asset: z.string().optional().describe("Filter by asset symbol"),
  limit: z.number().min(1).max(500).optional().describe("Max fills to return (default 50)"),
});

export interface GetUserFillsInput {
  walletAddress: string;
  asset?: string;
  limit?: number;
  startTime?: number;
}

export interface FormattedFill {
  asset: string;
  side: "Buy" | "Sell";
  price: string;
  size: string;
  value: string;
  fee: string;
  closedPnl: string;
  direction: string;
  time: string;
  orderId: number;
  tradeId: number;
  crossed: boolean;
}

export async function getUserFills(input: GetUserFillsInput): Promise<FormattedFill[]> {
  if (!checkRateLimit(2)) throw new Error("Rate limit exceeded. Please wait before making more requests.");
  const client = getHyperliquidClient();
  const address = normalizeAddress(input.walletAddress);
  const fills = (await client.userFills({ user: address })) as UserFill[];
  let filtered = fills;
  if (input.asset) {
    const assetUpper = input.asset.toUpperCase();
    filtered = filtered.filter((f) => f.coin.toUpperCase() === assetUpper);
  }
  if (input.startTime != null) filtered = filtered.filter((f) => f.time >= input.startTime!);
  filtered = filtered.slice(0, input.limit ?? 50);
  return filtered.map((fill) => ({
    asset: fill.coin,
    side: fill.side === "B" ? "Buy" : "Sell",
    price: fill.px,
    size: fill.sz,
    value: (parseFloat(fill.px) * parseFloat(fill.sz)).toFixed(2),
    fee: fill.fee,
    closedPnl: fill.closedPnl,
    direction: fill.dir,
    time: new Date(fill.time).toISOString(),
    orderId: fill.oid,
    tradeId: fill.tid,
    crossed: fill.crossed,
  }));
}
