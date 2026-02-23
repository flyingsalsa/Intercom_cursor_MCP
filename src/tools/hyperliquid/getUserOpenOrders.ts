import { z } from "zod";
import { getHyperliquidClient, normalizeAddress, checkRateLimit } from "./client.js";
import type { OpenOrder } from "./types.js";

export const getUserOpenOrdersSchema = z.object({
  wallet_address: z.string().describe("User wallet address (0x...)"),
  asset: z.string().optional().describe("Filter by asset symbol"),
});

export interface GetUserOpenOrdersInput {
  walletAddress: string;
  asset?: string;
}

export interface FormattedOpenOrder {
  asset: string;
  side: "Buy" | "Sell";
  orderType: string;
  limitPrice: string;
  size: string;
  originalSize: string;
  filledPercent: string;
  orderId: number;
  timestamp: string;
  reduceOnly: boolean;
  isTrigger: boolean;
  triggerPrice: string | null;
  triggerCondition: string | null;
  isPositionTpsl: boolean;
}

export async function getUserOpenOrders(input: GetUserOpenOrdersInput): Promise<FormattedOpenOrder[]> {
  if (!checkRateLimit(2)) throw new Error("Rate limit exceeded. Please wait before making more requests.");
  const client = getHyperliquidClient();
  const address = normalizeAddress(input.walletAddress);
  const orders = (await client.openOrders({ user: address })) as OpenOrder[];
  let filtered = orders;
  if (input.asset) {
    const assetUpper = input.asset.toUpperCase();
    filtered = filtered.filter((o) => o.coin.toUpperCase() === assetUpper);
  }
  return filtered.map((order) => {
    const filled = parseFloat(order.origSz) - parseFloat(order.sz);
    const filledPercent = ((filled / parseFloat(order.origSz)) * 100).toFixed(1);
    return {
      asset: order.coin,
      side: order.side === "B" ? "Buy" : "Sell",
      orderType: order.orderType,
      limitPrice: order.limitPx,
      size: order.sz,
      originalSize: order.origSz,
      filledPercent: `${filledPercent}%`,
      orderId: order.oid,
      timestamp: new Date(order.timestamp).toISOString(),
      reduceOnly: order.reduceOnly,
      isTrigger: order.isTrigger,
      triggerPrice: order.isTrigger ? order.triggerPx : null,
      triggerCondition: order.isTrigger ? order.triggerCondition : null,
      isPositionTpsl: order.isPositionTpsl,
    };
  });
}
