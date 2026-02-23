import { getHyperliquidClient, checkRateLimit } from "./client.js";
import type { AssetMeta, AssetCtx } from "./types.js";

export interface GetAssetInfoInput {
  asset?: string;
}

export interface FormattedAssetInfo {
  name: string;
  sizeDecimals: number;
  maxLeverage: number;
  onlyIsolated: boolean;
  markPrice: string | null;
  oraclePrice: string;
  midPrice: string | null;
  fundingRate: string;
  openInterest: string;
  dayVolume: string;
  prevDayPrice: string;
  premium: string;
}

export async function getAssetInfo(input: GetAssetInfoInput): Promise<FormattedAssetInfo | FormattedAssetInfo[]> {
  if (!checkRateLimit(2)) throw new Error("Rate limit exceeded. Please wait before making more requests.");
  const client = getHyperliquidClient();
  const data = (await client.metaAndAssetCtxs()) as unknown as [{ universe: AssetMeta[] }, AssetCtx[]];
  const meta = data[0];
  const assetCtxs = data[1];
  const allAssets: FormattedAssetInfo[] = meta.universe.map((assetMeta, index) => {
    const ctx = assetCtxs[index];
    return {
      name: assetMeta.name,
      sizeDecimals: assetMeta.szDecimals,
      maxLeverage: assetMeta.maxLeverage,
      onlyIsolated: assetMeta.onlyIsolated,
      markPrice: ctx?.markPx ?? null,
      oraclePrice: ctx?.oraclePx ?? "0",
      midPrice: ctx?.midPx ?? null,
      fundingRate: ctx?.funding ?? "0",
      openInterest: ctx?.openInterest ?? "0",
      dayVolume: ctx?.dayNtlVlm ?? "0",
      prevDayPrice: ctx?.prevDayPx ?? "0",
      premium: ctx?.premium ?? "0",
    };
  });
  if (input.asset) {
    const assetUpper = input.asset.toUpperCase();
    const found = allAssets.find((a) => a.name.toUpperCase() === assetUpper);
    if (!found) throw new Error(`Asset '${input.asset}' not found.`);
    return found;
  }
  return allAssets;
}
