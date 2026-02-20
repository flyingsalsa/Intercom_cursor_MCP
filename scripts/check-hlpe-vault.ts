/**
 * HLPe Vault Diagnostic Script
 *
 * Queries all relevant APIs for a given wallet to see what the user would see
 * on the HLPe vault page, specifically for withdrawal availability.
 * Install dependencies:
 *   npm install @augustdigital/sdk viem  
 *   npm install -D tsx
 * Usage:
 *   npx tsx scripts/check-hlpe-vault.ts <wallet_address>
 *
 * Example:
 *   npx tsx scripts/check-hlpe-vault.ts 0xeEd2c6F61fC9201F755BAA76AeBe3d2146f0c49c
 */

import AugustDigitalSDK from "@augustdigital/sdk";
import { createPublicClient, http, formatUnits, parseAbi, parseAbiItem } from "viem";

// ---------- Config ----------
const IS_TESTNET = process.env.NEXT_PUBLIC_USE_HL_TESTNET === "true";
const CHAIN_ID = IS_TESTNET ? 998 : 999;
const RPC_URL = IS_TESTNET
  ? "https://rpc.hyperliquid-testnet.xyz/evm"
  : process.env.NEXT_PUBLIC_HYPEREVM_RPC_URL || "https://rpc.hyperliquid.xyz/evm";

const HLPE_VAULT_MAINNET = "0x8fFDcd8A96d293f45aA044d10b899F9D71897E8a";
const HLPE_VAULT_TESTNET = "0x590f7E53aD0f86C161aa563Ab8262b0BA5dd4ac7";
const VAULT_ADDRESS = IS_TESTNET ? HLPE_VAULT_TESTNET : HLPE_VAULT_MAINNET;

const GRAPH_URL = IS_TESTNET
  ? "https://api.goldsky.com/api/public/project_cm9g0xy3o4j6v01vd34r3hvv9/subgraphs/august-hyperevm-testnet-HLPe/1.0.0/gn"
  : "https://api.goldsky.com/api/public/project_cm9g0xy3o4j6v01vd34r3hvv9/subgraphs/august-hyperevm-HLPe/1.0.0/gn";

// ---------- SDK + Client Setup ----------
const sdk = new AugustDigitalSDK({
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

const publicClient = createPublicClient({
  transport: http(RPC_URL),
});

const ERC20_ABI = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
]);

const VAULT_ABI = parseAbi([
  "function getSharePrice() view returns (uint256)",
  "function maxDepositAmount() view returns (uint256)",
  "function depositCap() view returns (uint256)",
]);

// ---------- Helpers ----------
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function hr(title: string) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  ${title}`);
  console.log("=".repeat(60));
}

function row(label: string, value: unknown) {
  const valStr = typeof value === "bigint" ? value.toString() : String(value ?? "--");
  console.log(`  ${label.padEnd(35)} ${valStr}`);
}

async function safe<T>(label: string, fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (err: any) {
    console.log(`  [ERROR] ${label}: ${err.message}`);
    return null;
  }
}

// ---------- Main ----------
async function main() {
  const wallet = (process.argv[2] || "").trim() as `0x${string}`;
  if (!wallet || !wallet.startsWith("0x")) {
    console.error("Usage: npx tsx scripts/check-hlpe-vault.ts <wallet_address>");
    process.exit(1);
  }

  console.log(`HLPe Vault Diagnostic — ${new Date().toISOString()}`);
  console.log(`Wallet:  ${wallet}`);
  console.log(`Vault:   ${VAULT_ADDRESS}`);
  console.log(`Network: ${IS_TESTNET ? "Testnet (998)" : "Mainnet (999)"}`);

  // ---- 1. sdk.getVault (vault details + user position) ----
  hr("1. August SDK — getVault (vault details + position)");
  const vault = await safe("getVault", () =>
    sdk.getVault({
      vault: VAULT_ADDRESS as `0x${string}`,
      chainId: CHAIN_ID,
      options: { wallet, loans: false, allocations: false },
    }),
  );

  if (vault) {
    row("Vault name", vault.name);
    row("Vault address", vault.address);
    row("Receipt token address", vault.receipt?.address);
    row("Receipt token symbol", vault.receipt?.symbol);
    row("Receipt token decimals", vault.receipt?.decimals);
    row("Total assets (normalized)", vault.totalAssets?.normalized);
    row("Lag duration (seconds)", vault.lagDuration);
    row("Position status", vault.position?.status);
    row("Position walletBalance (norm)", vault.position?.walletBalance?.normalized);
    row("Position walletBalance (raw)", vault.position?.walletBalance?.raw);
    row("Available redemptions", vault.position?.availableRedemptions?.length ?? 0);
    row("Pending redemptions", vault.position?.pendingRedemptions?.length ?? 0);

    if (vault.position?.availableRedemptions?.length) {
      for (const r of vault.position.availableRedemptions) {
        console.log(`    ↳ available: ${r.amount?.normalized} | date: ${r.date} | id: ${r.id}`);
      }
    }
    if (vault.position?.pendingRedemptions?.length) {
      for (const r of vault.position.pendingRedemptions) {
        console.log(`    ↳ pending:   ${r.amount?.normalized} | date: ${r.date} | id: ${r.id}`);
      }
    }
  }

  const receiptToken = vault?.receipt?.address as `0x${string}` | undefined;
  const decimals = vault?.receipt?.decimals ?? 18;

  await sleep(1500);

  // ---- 2. On-chain balanceOf (receipt token shares) ----
  hr("2. On-chain — balanceOf (receipt token shares)");
  let userShares: bigint | null = null;
  if (receiptToken) {
    userShares = await safe("balanceOf", () =>
      publicClient.readContract({
        address: receiptToken!,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [wallet],
      }),
    );
    row("User shares (raw)", userShares);
    row("User shares (formatted)", userShares != null ? formatUnits(userShares, decimals) : null);
  } else {
    console.log("  [SKIP] No receipt token address available");
  }

  await sleep(1500);

  // ---- 3. sdk.previewRedemption (shares → USD) ----
  hr("3. August SDK — previewRedemption (available to withdraw)");
  if (userShares != null && userShares > 0n) {
    const preview = await safe("previewRedemption", () =>
      sdk.previewRedemption({
        vault: VAULT_ADDRESS as `0x${string}`,
        sharesAmount: userShares!,
        chainId: CHAIN_ID,
      }),
    );
    row("Withdrawal USD (normalized)", preview?.normalized);
    row("Withdrawal USD (raw)", preview?.raw);
  } else {
    row("Withdrawal USD", "N/A — user has 0 shares");
  }

  await sleep(1500);

  // ---- 4. On-chain getSharePrice ----
  hr("4. On-chain — getSharePrice");
  const sharePrice = await safe("getSharePrice", () =>
    publicClient.readContract({
      address: VAULT_ADDRESS as `0x${string}`,
      abi: VAULT_ABI,
      functionName: "getSharePrice",
    }),
  );
  row("Share price (raw)", sharePrice);
  row("Share price (formatted)", sharePrice != null ? formatUnits(sharePrice as bigint, 18) : null);

  await sleep(1500);

  // ---- 5. On-chain allowance (receipt token → vault) ----
  hr("5. On-chain — allowance (receipt → vault)");
  if (receiptToken) {
    const allowance = await safe("allowance", () =>
      publicClient.readContract({
        address: receiptToken!,
        abi: ERC20_ABI,
        functionName: "allowance",
        args: [wallet, VAULT_ADDRESS as `0x${string}`],
      }),
    );
    row("Allowance (raw)", allowance);
    row("Allowance (formatted)", allowance != null ? formatUnits(allowance as bigint, decimals) : null);
  }

  await sleep(1500);

  // ---- 6. sdk.getVaultUserLifetimePnl ----
  hr("6. August SDK — getVaultUserLifetimePnl");
  const pnl = await safe("lifetimePnl", () =>
    sdk.getVaultUserLifetimePnl({
      vault: VAULT_ADDRESS as `0x${string}`,
      wallet,
      chainId: CHAIN_ID,
    }),
  );
  row("Lifetime PnL (USD)", pnl?.lifetimePnlUsd);

  await sleep(1500);

  // ---- 7. sdk.getVaultPnl ----
  hr("7. August SDK — getVaultPnl (total vault PnL)");
  const vaultPnl = await safe("vaultPnl", () =>
    sdk.getVaultPnl({
      vault: VAULT_ADDRESS as `0x${string}`,
      chainId: CHAIN_ID,
    }),
  );
  row("Total vault PnL (normalized)", vaultPnl?.totalPnl?.normalized);

  await sleep(1500);

  // ---- 8. Subgraph health — is it up to date? ----
  hr("8. Subgraph health check");
  const [chainBlockNumber, subgraphMeta] = await Promise.all([
    safe("chainBlock", () => publicClient.getBlockNumber()),
    safe("subgraphMeta", async () => {
      const res = await fetch(GRAPH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: "{ _meta { block { number timestamp } hasIndexingErrors } }" }),
      });
      return res.json();
    }),
  ]);

  const subgraphBlock = subgraphMeta?.data?._meta?.block;
  const subgraphBlockNum = subgraphBlock?.number ? BigInt(subgraphBlock.number) : null;
  const blockLag = chainBlockNumber != null && subgraphBlockNum != null
    ? Number(chainBlockNumber - subgraphBlockNum)
    : null;
  // HyperEVM produces ~2 blocks/sec, so lag in seconds ≈ blockLag / 2
  const lagSeconds = blockLag != null ? Math.round(blockLag / 2) : null;

  row("Chain latest block", chainBlockNumber);
  row("Subgraph latest block", subgraphBlockNum);
  row("Subgraph block timestamp", subgraphBlock?.timestamp ? new Date(Number(subgraphBlock.timestamp) * 1000).toISOString() : null);
  row("Block lag", blockLag != null ? `${blockLag} blocks (~${lagSeconds}s)` : "unknown");
  row("Has indexing errors?", subgraphMeta?.data?._meta?.hasIndexingErrors ?? "unknown");

  if (lagSeconds != null && lagSeconds > 300) {
    console.log("  ⚠️  SUBGRAPH IS SIGNIFICANTLY BEHIND (>5 min)");
  } else if (lagSeconds != null && lagSeconds > 60) {
    console.log("  ⚠️  Subgraph is moderately behind (>1 min)");
  } else if (lagSeconds != null) {
    console.log("  ✓  Subgraph is reasonably up to date");
  }

  // ---- 9. On-chain cross-check — verify receipt token balance matches SDK ----
  hr("9. Cross-check — on-chain balance vs SDK position");
  if (receiptToken && userShares != null) {
    const sdkRaw = vault?.position?.walletBalance?.raw;
    const sdkBalance = sdkRaw ? BigInt(sdkRaw) : 0n;
    const onChainBalance = userShares;
    const balancesMatch = sdkBalance === onChainBalance;

    row("On-chain balanceOf", formatUnits(onChainBalance, decimals));
    row("SDK walletBalance.raw", sdkRaw ?? "N/A");
    row("Balances match?", balancesMatch ? "✓ YES" : `✗ NO — SDK says ${formatUnits(sdkBalance, decimals)}, chain says ${formatUnits(onChainBalance, decimals)}`);

    // Explorer link for manual tx history verification
    const explorerBase = IS_TESTNET ? "https://testnet.purrsec.com" : "https://purrsec.com";
    console.log(`\n  Manual verification links:`);
    console.log(`    Wallet txs:        ${explorerBase}/address/${wallet}`);
    console.log(`    Receipt token txs:  ${explorerBase}/token/${receiptToken}?a=${wallet}`);
    console.log(`    Vault contract:     ${explorerBase}/address/${VAULT_ADDRESS}`);
  }

  // ---- 10. Subgraph — deposits & withdrawal requests for this wallet ----
  hr("10. Subgraph — deposit & withdrawal history");
  const subgraphData = await safe("subgraph", async () => {
    const walletLower = wallet.toLowerCase();
    const query = `{
      deposits(where: {senderAddr: "${walletLower}"}, orderBy: timestamp_, orderDirection: desc, first: 5) {
        id senderAddr receiverAddr amountIn shares timestamp_
      }
      withdrawalRequesteds(where: {holderAddr: "${walletLower}"}, orderBy: timestamp_, orderDirection: desc, first: 5) {
        id holderAddr receiverAddr shares timestamp_
      }
      withdraws(where: {receiver: "${walletLower}"}, orderBy: timestamp_, orderDirection: desc, first: 5) {
        id sender receiver owner assets shares timestamp_
      }
    }`;
    const res = await fetch(GRAPH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    });
    return res.json();
  });

  if (subgraphData?.data) {
    const d = subgraphData.data;
    console.log(`  Deposits:              ${d.deposits?.length ?? 0}`);
    for (const dep of d.deposits || []) {
      console.log(`    ↳ ${formatUnits(BigInt(dep.amountIn), decimals)} deposited | shares: ${formatUnits(BigInt(dep.shares), decimals)} | ts: ${dep.timestamp_}`);
    }
    console.log(`  Withdrawal requests:   ${d.withdrawalRequesteds?.length ?? 0}`);
    for (const wr of d.withdrawalRequesteds || []) {
      console.log(`    ↳ shares: ${formatUnits(BigInt(wr.shares), decimals)} | holder: ${wr.holderAddr} | ts: ${wr.timestamp_}`);
    }
    console.log(`  Completed withdrawals: ${d.withdraws?.length ?? 0}`);
    for (const w of d.withdraws || []) {
      console.log(`    ↳ ${formatUnits(BigInt(w.assets), decimals)} withdrawn | shares: ${formatUnits(BigInt(w.shares), decimals)} | receiver: ${w.receiver} | ts: ${w.timestamp_}`);
    }
  } else if (subgraphData?.errors) {
    console.log("  Subgraph errors:", JSON.stringify(subgraphData.errors, null, 2));
  }

  // ---- Summary ----
  hr("SUMMARY");
  const maxWithdrawable = userShares != null && userShares > 0n
    ? await safe("previewRedemption", () =>
        sdk.previewRedemption({ vault: VAULT_ADDRESS as `0x${string}`, sharesAmount: userShares!, chainId: CHAIN_ID })
      )
    : null;
  
  row("User shares on-chain", userShares != null ? formatUnits(userShares, decimals) : "0");
  row("Available to withdraw (USD)", maxWithdrawable?.normalized ?? "0");
  row("Needs approval?", (() => {
    if (!userShares || userShares === 0n) return "N/A (no shares)";
    // We'd need the allowance check here but simplified
    return "Check allowance above";
  })());
  row("Has pending redemptions?", (vault?.position?.availableRedemptions?.length ?? 0) > 0 ? "YES" : "NO");
  row("Has claimable redemptions?", (vault?.position?.pendingRedemptions?.length ?? 0) > 0 ? "YES" : "NO");

  console.log("\nDone.\n");
  process.exit(0); // Force exit — August SDK's ethers.js retries can hang
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
