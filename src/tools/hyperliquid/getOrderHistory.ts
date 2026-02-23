import { getHyperliquidClient, normalizeAddress, checkRateLimit } from "./client.js";
import type { OrderStatus } from "./types.js";

export interface GetOrderHistoryInput {
  walletAddress: string;
  asset?: string;
  limit?: number;
}

export interface FormattedOrderHistory {
  asset: string;
  side: "Buy" | "Sell";
  orderType: string;
  limitPrice: string;
  isTrigger: boolean;
  triggerPrice: string | null;
  triggerCondition: string | null;
  reduceOnly: boolean;
  isPositionTpsl: boolean;
  size: string;
  originalSize: string;
  filledSize: string;
  status: string;
  orderId: number;
  orderTimestamp: string;
  statusTimestamp: string;
  clientOrderId: string | null;
}

export async function getOrderHistory(input: GetOrderHistoryInput): Promise<FormattedOrderHistory[]> {
  if (!checkRateLimit(20)) throw new Error("Rate limit exceeded. Please wait before making more requests.");
  const client = getHyperliquidClient();
  const address = normalizeAddress(input.walletAddress);
  const orders = (await client.historicalOrders({ user: address })) as OrderStatus[];
  let filtered = orders;
  if (input.asset) {
    const needle = input.asset.trim().toLowerCase();
    filtered = filtered.filter((o) => {
      const c = o.order.coin.toLowerCase();
      return c === needle || (!needle.includes(":") && c.endsWith(`:${needle}`));
    });
  }
  filtered.sort((a, b) => b.statusTimestamp - a.statusTimestamp);
  filtered = filtered.slice(0, input.limit ?? 50);
  return filtered.map((os) => {
    const o = os.order;
    const filledSize = (parseFloat(o.origSz) - parseFloat(o.sz)).toFixed(6);
    return {
      asset: o.coin,
      side: o.side === "B" ? "Buy" : "Sell",
      orderType: o.orderType,
      limitPrice: o.limitPx,
      isTrigger: o.isTrigger,
      triggerPrice: o.isTrigger ? o.triggerPx : null,
      triggerCondition: o.isTrigger ? o.triggerCondition : null,
      reduceOnly: o.reduceOnly,
      isPositionTpsl: o.isPositionTpsl,
      size: o.sz,
      originalSize: o.origSz,
      filledSize,
      status: os.status,
      orderId: o.oid,
      orderTimestamp: new Date(o.timestamp).toISOString(),
      statusTimestamp: new Date(os.statusTimestamp).toISOString(),
      clientOrderId: o.cloid,
    };
  });
}
