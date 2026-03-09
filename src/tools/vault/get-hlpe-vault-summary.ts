/**
 * HLPe vault summary for a wallet. Used by MCP tool so the AI can check withdrawal status
 * when answering Intercom questions (e.g. "did my withdrawal go through?").
 */

import AugustDigitalSDK from "@augustdigital/sdk";

const IS_TESTNET = process.env.NEXT_PUBLIC_USE_HL_TESTNET === "true";
const CHAIN_ID = IS_TESTNET ? 998 : 999;
const HLPE_VAULT_MAINNET = "0x8fFDcd8A96d293f45aA044d10b899F9D71897E8a";
const HLPE_VAULT_TESTNET = "0x590f7E53aD0f86C161aa563Ab8262b0BA5dd4ac7";
const VAULT_ADDRESS = (IS_TESTNET ? HLPE_VAULT_TESTNET : HLPE_VAULT_MAINNET) as `0x${string}`;
const GRAPH_URL = IS_TESTNET
  ? "https://api.goldsky.com/api/public/project_cm9g0xy3o4j6v01vd34r3hvv9/subgraphs/august-hyperevm-testnet-HLPe/1.0.0/gn"
  : "https://api.goldsky.com/api/public/project_cm9g0xy3o4j6v01vd34r3hvv9/subgraphs/august-hyperevm-HLPe/1.0.0/gn";

let sdkInstance: AugustDigitalSDK | null = null;

function getSdk(): AugustDigitalSDK {
  if (!sdkInstance) {
    sdkInstance = new AugustDigitalSDK({
      providers: {
        999: process.env.NEXT_PUBLIC_HYPEREVM_RPC_URL || "https://rpc.hyperliquid.xyz/evm",
        998: "https://rpc.hyperliquid-testnet.xyz/evm",
        1: "https://eth.llamarpc.com",
      },
      keys: {
        august: process.env.NEXT_PUBLIC_AUGUST_API_KEY || "",
        graph: GRAPH_URL,
      },
    });
  }
  return sdkInstance;
}

function normalizeWallet(w: string): `0x${string}` {
  const s = w.trim();
  return (s.startsWith("0x") ? s : `0x${s}`) as `0x${string}`;
}

export interface HlpeVaultSummary {
  wallet: string;
  network: string;
  vaultAddress: string;
  positionStatus: string | null;
  walletBalanceNormalized: string | null;
  availableRedemptionsCount: number;
  availableRedemptions: Array<{ amountNormalized: string; date: string; id: string }>;
  pendingRedemptionsCount: number;
  pendingRedemptions: Array<{ amountNormalized: string; date: string; id: string }>;
  withdrawalRequestsCount: number;
  withdrawalRequests: Array<{ shares: string; timestamp: string }>;
  completedWithdrawalsCount: number;
  completedWithdrawals: Array<{ assets: string; shares: string; receiver: string; timestamp: string }>;
  error?: string;
}

export async function getHlpeVaultSummary(walletAddress: string): Promise<HlpeVaultSummary> {
  const wallet = normalizeWallet(walletAddress);
  if (!wallet.startsWith("0x")) {
    return {
      wallet: walletAddress,
      network: IS_TESTNET ? "testnet" : "mainnet",
      vaultAddress: VAULT_ADDRESS,
      positionStatus: null,
      walletBalanceNormalized: null,
      availableRedemptionsCount: 0,
      availableRedemptions: [],
      pendingRedemptionsCount: 0,
      pendingRedemptions: [],
      withdrawalRequestsCount: 0,
      withdrawalRequests: [],
      completedWithdrawalsCount: 0,
      completedWithdrawals: [],
      error: "Invalid wallet address",
    };
  }

  const sdk = getSdk();
  const base = {
    wallet: wallet,
    network: IS_TESTNET ? "testnet (998)" : "mainnet (999)",
    vaultAddress: VAULT_ADDRESS,
    positionStatus: null as string | null,
    walletBalanceNormalized: null as string | null,
    availableRedemptionsCount: 0,
    availableRedemptions: [] as HlpeVaultSummary["availableRedemptions"],
    pendingRedemptionsCount: 0,
    pendingRedemptions: [] as HlpeVaultSummary["pendingRedemptions"],
    withdrawalRequestsCount: 0,
    withdrawalRequests: [] as HlpeVaultSummary["withdrawalRequests"],
    completedWithdrawalsCount: 0,
    completedWithdrawals: [] as HlpeVaultSummary["completedWithdrawals"],
  };

  try {
    const vault = await sdk.getVault({
      vault: VAULT_ADDRESS,
      chainId: CHAIN_ID,
      options: { wallet, loans: false, allocations: false },
    });

    base.positionStatus = vault.position?.status ?? null;
    base.walletBalanceNormalized = vault.position?.walletBalance?.normalized ?? null;
    const avail = vault.position?.availableRedemptions ?? [];
    const pend = vault.position?.pendingRedemptions ?? [];
    base.availableRedemptionsCount = avail.length;
    base.availableRedemptions = avail.map((r) => {
      const u = r as unknown as { amount?: { normalized?: string }; date?: Date; id?: string };
      return {
        amountNormalized: u.amount?.normalized ?? "",
        date: u.date instanceof Date ? u.date.toISOString() : String(u.date ?? ""),
        id: u.id ?? "",
      };
    });
    base.pendingRedemptionsCount = pend.length;
    base.pendingRedemptions = pend.map((r) => {
      const u = r as unknown as { amount?: { normalized?: string }; date?: Date; id?: string };
      return {
        amountNormalized: u.amount?.normalized ?? "",
        date: u.date instanceof Date ? u.date.toISOString() : String(u.date ?? ""),
        id: u.id ?? "",
      };
    });
  } catch (err: unknown) {
    (base as HlpeVaultSummary).error = err instanceof Error ? err.message : String(err);
    return base as HlpeVaultSummary;
  }

  try {
    const res = await fetch(GRAPH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: `{
          withdrawalRequesteds(where: {holderAddr: "${wallet.toLowerCase()}"}, orderBy: timestamp_, orderDirection: desc, first: 10) {
            id holderAddr receiverAddr shares timestamp_
          }
          withdrawalProcesseds(where: {receiverAddr: "${wallet.toLowerCase()}"}, orderBy: timestamp_, orderDirection: desc, first: 10) {
            id receiverAddr assetsAmount timestamp_
          }
        }`,
      }),
    });
    const json = await res.json();
    const d = json?.data;
    if (d) {
      const wrs = d.withdrawalRequesteds ?? [];
      const cws = d.withdrawalProcesseds ?? [];
      base.withdrawalRequestsCount = wrs.length;
      base.withdrawalRequests = wrs.map((wr: { shares: string; timestamp_: string }) => ({
        shares: wr.shares,
        timestamp: wr.timestamp_,
      }));
      base.completedWithdrawalsCount = cws.length;
      base.completedWithdrawals = cws.map((w: { assetsAmount: string; receiverAddr: string; timestamp_: string }) => ({
        assets: w.assetsAmount,
        shares: "",
        receiver: w.receiverAddr,
        timestamp: w.timestamp_,
      }));
    }
  } catch {
    // Subgraph optional
  }

  return base;
}
