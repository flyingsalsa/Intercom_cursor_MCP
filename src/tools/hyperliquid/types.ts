// Hyperliquid API response types (for scripts/ TP-SL/liquidation support)

export interface UserFill {
  coin: string;
  px: string;
  sz: string;
  side: "B" | "A";
  time: number;
  startPosition: string;
  dir: string;
  closedPnl: string;
  hash: string;
  oid: number;
  crossed: boolean;
  fee: string;
  tid: number;
  feeToken: string;
}

export interface OpenOrder {
  coin: string;
  limitPx: string;
  oid: number;
  side: "B" | "A";
  sz: string;
  timestamp: number;
  triggerCondition: string;
  isTrigger: boolean;
  triggerPx: string;
  children: OpenOrder[];
  isPositionTpsl: boolean;
  reduceOnly: boolean;
  orderType: string;
  origSz: string;
  cloid: string | null;
}

export interface Position {
  coin: string;
  szi: string;
  leverage: { type: string; value: number; rawUsd?: string };
  entryPx: string;
  positionValue: string;
  unrealizedPnl: string;
  returnOnEquity: string;
  liquidationPx: string | null;
  marginUsed: string;
  maxTradeSzs: [string, string];
  cumFunding: {
    allTime: string;
    sinceOpen: string;
    sinceChange: string;
  };
}

export interface ClearinghouseState {
  marginSummary: {
    accountValue: string;
    totalNtlPos: string;
    totalRawUsd: string;
    totalMarginUsed: string;
  };
  crossMarginSummary: Record<string, string>;
  crossMaintenanceMarginUsed: string;
  withdrawable: string;
  assetPositions: { position: Position; type: string }[];
  time: number;
}

export interface OrderStatus {
  order: {
    coin: string;
    side: "B" | "A";
    limitPx: string;
    sz: string;
    oid: number;
    timestamp: number;
    origSz: string;
    triggerCondition: string;
    isTrigger: boolean;
    triggerPx: string;
    children: unknown[];
    isPositionTpsl: boolean;
    reduceOnly: boolean;
    orderType: string;
    tif?: string;
    cloid: string | null;
  };
  status: string;
  statusTimestamp: number;
}

export interface Candle {
  t: number;
  T: number;
  s: string;
  i: string;
  o: string;
  c: string;
  h: string;
  l: string;
  v: string;
  n: number;
}

export interface AssetMeta {
  name: string;
  szDecimals: number;
  maxLeverage: number;
  onlyIsolated: boolean;
}

export interface AssetCtx {
  funding: string;
  openInterest: string;
  prevDayPx: string;
  dayNtlVlm: string;
  premium: string;
  oraclePx: string;
  markPx: string;
  midPx: string | null;
  impactPxs: string[] | null;
}

export interface Meta {
  universe: AssetMeta[];
}

export interface MetaAndAssetCtxs {
  meta: Meta;
  assetCtxs: AssetCtx[];
}
