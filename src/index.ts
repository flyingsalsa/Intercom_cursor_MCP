import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { searchConversations, searchConversationsSchema } from "./tools/intercom/search-conversations.js";
import { getConversation, getConversationSchema } from "./tools/intercom/get-conversation.js";
import { getContact, getContactSchema } from "./tools/intercom/get-contact.js";
import { getUnrepliedConversations, getUnrepliedConversationsSchema } from "./tools/intercom/get-unreplied-conversations.js";
import { getNewMessages, getNewMessagesSchema } from "./tools/intercom/new-messages.js";
import { draftReply, draftReplySchema } from "./tools/intercom/draft-reply.js";
import { sendReply, sendReplySchema } from "./tools/intercom/send-reply.js";
import { getUserPositions, getUserPositionsSchema } from "./tools/hyperliquid/getUserPositions.js";
import { getUserOpenOrders, getUserOpenOrdersSchema } from "./tools/hyperliquid/getUserOpenOrders.js";
import { getOrderHistory, getOrderHistorySchema } from "./tools/hyperliquid/getOrderHistory.js";
import { getUserFills, getUserFillsSchema } from "./tools/hyperliquid/getUserFills.js";
import { getAssetInfo, getAssetInfoSchema } from "./tools/hyperliquid/getAssetInfo.js";
import { getMarketCandles, getMarketCandlesSchema } from "./tools/hyperliquid/getMarketCandles.js";

const INTERCOM_API_KEY = process.env.INTERCOM_API_KEY;
const INTERCOM_ADMIN_ID = process.env.INTERCOM_ADMIN_ID;
const TEMPLATE_DOC_PATH = process.env.TEMPLATE_DOC_PATH ?? "./templates/responses.md";

// ---------- Intercom (Customer Support management API) ------------

if (!INTERCOM_API_KEY) {
  console.error("INTERCOM_API_KEY environment variable is required");
  process.exit(1);
}
if (!INTERCOM_ADMIN_ID) {
  console.error("INTERCOM_ADMIN_ID environment variable is required");
  process.exit(1);
}

const server = new McpServer({
  name: "intercom-mcp-server",
  version: "1.0.0",
});

server.tool(
  "search_conversations",
  "Search and filter Intercom conversations by date, state, source type. Returns a summary list with previews.",
  searchConversationsSchema.shape,
  async (args) => {
    const result = await searchConversations(args, INTERCOM_API_KEY);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  },
);

server.tool(
  "get_conversation",
  "Retrieve a single Intercom conversation's full message thread by ID. Returns all messages, contact info, stats, and inline image attachments.",
  getConversationSchema.shape,
  async (args) => {
    const { conversation, imageBlocks } = await getConversation(args, INTERCOM_API_KEY);

    const content: Array<
      | { type: "text"; text: string }
      | { type: "image"; data: string; mimeType: string }
    > = [{ type: "text", text: JSON.stringify(conversation, null, 2) }];

    for (const img of imageBlocks) {
      content.push({
        type: "text",
        text: `[Image from message #${img.messageIndex}${img.attachmentName ? ` — ${img.attachmentName}` : ""}]`,
      });
      content.push({
        type: "image",
        data: img.data,
        mimeType: img.mimeType,
      });
    }

    return { content };
  },
);

server.tool(
  "get_contact",
  "Fetch full contact data for an Intercom contact: ID, external_id, role, name, email, phone; device and app version (browser, OS, Android/iOS app/device/OS/SDK); location; timestamps; custom_attributes; tags. Often used to look for wallet addresses (e.g. starting with 0x) in custom_attributes or other fields. Use the contact ID from a conversation (e.g. conversation contact id or source author).",
  getContactSchema.shape,
  async (args) => {
    const result = await getContact(args, INTERCOM_API_KEY);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  },
);

server.tool(
  "get_unreplied_conversations",
  "Retrieve all open Intercom conversations where the last message is from the customer (unreplied). Fetches open conversations and filters to those needing a support response.",
  getUnrepliedConversationsSchema.shape,
  async (args) => {
    const result = await getUnrepliedConversations(args ?? {}, INTERCOM_API_KEY);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  },
);

server.tool(
  "get_new_messages",
  "Check for new/updated Intercom conversations since the last check. Uses a polling high-water mark. First call returns conversations from the last hour; subsequent calls return only newer ones.",
  getNewMessagesSchema.shape,
  async (args) => {
    const result = await getNewMessages(args, INTERCOM_API_KEY);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  },
);

server.tool(
  "draft_reply",
  "Draft a reply to an Intercom conversation as an internal admin note. The customer will NOT see this — review it in Intercom first, then use send_reply to deliver it.",
  draftReplySchema.shape,
  async (args) => {
    const result = await draftReply(args, INTERCOM_API_KEY, INTERCOM_ADMIN_ID);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  },
);

server.tool(
  "send_reply",
  "Send a customer-visible reply to an Intercom conversation. The customer WILL see this message immediately.",
  sendReplySchema.shape,
  async (args) => {
    const result = await sendReply(args, INTERCOM_API_KEY, INTERCOM_ADMIN_ID);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  },
);

// ---------- Hyperliquid (Trading Platform API) ----------
server.tool(
  "get_hl_user_positions",
  "Get a user's Hyperliquid positions: size, side, entry price, liquidation price, margin, unrealized PnL. Use when the conversation is about liquidation, margin, or open positions. Pass the wallet address (e.g. from get_contact external_id).",
  getUserPositionsSchema.shape,
  async (args) => {
    const result = await getUserPositions({ walletAddress: args.wallet_address, asset: args.asset });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  },
);

server.tool(
  "get_hl_user_open_orders",
  "Get a user's open Hyperliquid orders including TP/SL (trigger price, trigger condition, is_position_tpsl). Use for take-profit/stop-loss or order status questions.",
  getUserOpenOrdersSchema.shape,
  async (args) => {
    const result = await getUserOpenOrders({ walletAddress: args.wallet_address, asset: args.asset });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  },
);

server.tool(
  "get_hl_order_history",
  "Get a user's recent Hyperliquid order history (status, trigger/TP-SL info). Use to check if an order filled or was canceled.",
  getOrderHistorySchema.shape,
  async (args) => {
    const result = await getOrderHistory({
      walletAddress: args.wallet_address,
      asset: args.asset,
      limit: args.limit,
    });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  },
);

server.tool(
  "get_hl_user_fills",
  "Get a user's recent Hyperliquid trade fills (price, size, fee, closed PnL). Use for trade history or execution questions.",
  getUserFillsSchema.shape,
  async (args) => {
    const result = await getUserFills({
      walletAddress: args.wallet_address,
      asset: args.asset,
      limit: args.limit,
    });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  },
);

server.tool(
  "get_hl_asset_info",
  "Get Hyperliquid asset info (mark price, funding, open interest). Use when the user asks about an asset's market data.",
  getAssetInfoSchema.shape,
  async (args) => {
    const result = await getAssetInfo({ asset: args.asset });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  },
);

server.tool(
  "get_hl_market_candles",
  "Get OHLCV candles for a Hyperliquid asset. Use for price history or chart context.",
  getMarketCandlesSchema.shape,
  async (args) => {
    const result = await getMarketCandles({
      asset: args.asset,
      interval: args.interval,
      limit: args.limit,
    });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  },
);


async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
