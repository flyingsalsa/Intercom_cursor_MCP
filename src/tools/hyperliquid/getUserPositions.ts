import { getHyperliquidClient, normalizeAddress, checkRateLimit } from "./client.js";

export interface GetUserPositionsInput {
  walletAddress: string;
  asset?: string;
}

export interface FormattedPosition {
  asset: string;
  size: string;
  side: "Long" | "Short";
  entryPrice: string;
  markPrice: string | null;
  positionValue: string;
  unrealizedPnl: string;
  returnOnEquity: string;
  leverage: string;
  liquidationPrice: string | null;
  marginUsed: string;
  cumulativeFunding: { allTime: string; sinceOpen: string };
}

export interface AccountSummary {
  accountValue: string;
  totalPositionNotional: string;
  totalMarginUsed: string;
  withdrawable: string;
}

export interface GetUserPositionsResult {
  account: AccountSummary;
  positions: FormattedPosition[];
}

export async function getUserPositions(input: GetUserPositionsInput): Promise<GetUserPositionsResult> {
  if (!checkRateLimit(2)) throw new Error("Rate limit exceeded. Please wait before making more requests.");
  const client = getHyperliquidClient();
  const address = normalizeAddress(input.walletAddress);
  const state = await client.clearinghouseState({ user: address });
  let positions = state.assetPositions.filter((ap) => parseFloat(ap.position.szi) !== 0);
  if (input.asset) {
    const assetUpper = input.asset.toUpperCase();
    positions = positions.filter((ap) => ap.position.coin.toUpperCase() === assetUpper);
  }
  const formattedPositions: FormattedPosition[] = positions.map((ap) => {
    const pos = ap.position;
    const size = parseFloat(pos.szi);
    return {
      asset: pos.coin,
      size: Math.abs(size).toString(),
      side: size > 0 ? "Long" : "Short",
      entryPrice: pos.entryPx,
      markPrice: null,
      positionValue: pos.positionValue,
      unrealizedPnl: pos.unrealizedPnl,
      returnOnEquity: pos.returnOnEquity,
      leverage: `${pos.leverage.value}x ${pos.leverage.type}`,
      liquidationPrice: pos.liquidationPx,
      marginUsed: pos.marginUsed,
      cumulativeFunding: {
        allTime: pos.cumFunding.allTime,
        sinceOpen: pos.cumFunding.sinceOpen,
      },
    };
  });
  return {
    account: {
      accountValue: state.marginSummary.accountValue,
      totalPositionNotional: state.marginSummary.totalNtlPos,
      totalMarginUsed: state.marginSummary.totalMarginUsed,
      withdrawable: state.withdrawable,
    },
    positions: formattedPositions,
  };
}
