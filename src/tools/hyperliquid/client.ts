import { InfoClient, HttpTransport } from "@nktkas/hyperliquid";

let clientInstance: InfoClient | null = null;

export function getHyperliquidClient(): InfoClient {
  if (!clientInstance) {
    const apiUrl = process.env.HYPERLIQUID_API_URL;
    const rpcUrl = process.env.HYPERLIQUID_RPC_URL;
    clientInstance = new InfoClient({
      transport: new HttpTransport({
        isTestnet: false,
        ...(apiUrl ? { apiUrl } : {}),
        ...(rpcUrl ? { rpcUrl } : {}),
      }),
    });
  }
  return clientInstance;
}

export function normalizeAddress(address: string): string {
  if (!address.startsWith("0x")) return `0x${address}`;
  return address.toLowerCase();
}

const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const MAX_WEIGHT_PER_WINDOW = 1200;
let rateLimitState = { windowStart: Date.now(), weightUsed: 0 };

export function checkRateLimit(weight: number = 1): boolean {
  const now = Date.now();
  if (now - rateLimitState.windowStart >= RATE_LIMIT_WINDOW_MS) {
    rateLimitState = { windowStart: now, weightUsed: 0 };
  }
  if (rateLimitState.weightUsed + weight > MAX_WEIGHT_PER_WINDOW) return false;
  rateLimitState.weightUsed += weight;
  return true;
}
