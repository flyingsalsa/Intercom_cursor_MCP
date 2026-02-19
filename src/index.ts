import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { searchConversations } from "./tools/search-conversations.js";
import { getConversation } from "./tools/get-conversation.js";
import { getContact } from "./tools/get-contact.js";
import { getUnrepliedConversations } from "./tools/get-unreplied-conversations.js";
import { getNewMessages, getNewMessagesSchema } from "./tools/new-messages.js";
import { getTemplates, getTemplatesSchema } from "./tools/get-templates.js";
import { draftReply, draftReplySchema } from "./tools/draft-reply.js";
import { sendReply, sendReplySchema } from "./tools/send-reply.js";

const INTERCOM_API_KEY = process.env.INTERCOM_API_KEY;
const INTERCOM_ADMIN_ID = process.env.INTERCOM_ADMIN_ID;
const TEMPLATE_DOC_PATH = process.env.TEMPLATE_DOC_PATH ?? "./templates/responses.md";

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
  {
    state: z.enum(["open", "closed", "snoozed"]).optional().describe("Filter by conversation state"),
    created_after: z.string().optional().describe("ISO 8601 date — conversations created after this"),
    created_before: z.string().optional().describe("ISO 8601 date — conversations created before this"),
    updated_after: z.string().optional().describe("ISO 8601 date — conversations updated after this"),
    updated_before: z.string().optional().describe("ISO 8601 date — conversations updated before this"),
    source_type: z.enum(["email", "chat", "push", "twitter", "facebook"]).optional().describe("Filter by source"),
    per_page: z.number().min(1).max(150).optional().describe("Results per page (default 20, max 150)"),
  },
  async (args) => {
    const result = await searchConversations(args, INTERCOM_API_KEY);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  },
);

server.tool(
  "get_conversation",
  "Retrieve a single Intercom conversation's full message thread by ID. Returns all messages, contact info, and stats.",
  {
    conversation_id: z.string().describe("The Intercom conversation ID"),
  },
  async (args) => {
    const result = await getConversation(args, INTERCOM_API_KEY);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  },
);

server.tool(
  "get_contact",
  "Fetch full contact data for an Intercom contact: ID, external_id, role, name, email, phone; device and app version (browser, OS, Android/iOS app/device/OS/SDK); location; timestamps; custom_attributes; tags. Often used to look for wallet addresses (e.g. starting with 0x) in custom_attributes or other fields. Use the contact ID from a conversation (e.g. conversation contact id or source author).",
  {
    contact_id: z.string().describe("The Intercom contact ID"),
  },
  async (args) => {
    const result = await getContact(args, INTERCOM_API_KEY);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  },
);

server.tool(
  "get_unreplied_conversations",
  "Retrieve all open Intercom conversations where the last message is from the customer (unreplied). Fetches open conversations and filters to those needing a support response.",
  {
    per_page: z.number().min(1).max(150).optional().describe("Max open conversations to fetch per page (default 150)"),
  },
  async (args) => {
    const result = await getUnrepliedConversations(args ?? {}, INTERCOM_API_KEY);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  },
);

server.tool(
  "get_new_messages",
  "Check for new/updated Intercom conversations since the last check. Uses a polling high-water mark. First call returns conversations from the last hour; subsequent calls return only newer ones.",
  {
    reset: z.boolean().optional().describe("If true, resets the high-water mark to now"),
  },
  async (args) => {
    const result = await getNewMessages(args, INTERCOM_API_KEY);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  },
);

server.tool(
  "get_templates",
  "Read the full template document (responses.md). Returns the entire file including agent persona, primary role, vocabulary rules, and all workflow templates. Use this when suggesting replies to Intercom conversations.",
  {},
  async () => {
    const result = await getTemplates({}, TEMPLATE_DOC_PATH);
    return { content: [{ type: "text", text: result }] };
  },
);

server.tool(
  "draft_reply",
  "Draft a reply to an Intercom conversation as an internal admin note. The customer will NOT see this — review it in Intercom first, then use send_reply to deliver it.",
  {
    conversation_id: z.string().describe("The Intercom conversation ID"),
    body: z.string().describe("The reply body (HTML supported)"),
  },
  async (args) => {
    const result = await draftReply(args, INTERCOM_API_KEY, INTERCOM_ADMIN_ID);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  },
);

server.tool(
  "send_reply",
  "Send a customer-visible reply to an Intercom conversation. The customer WILL see this message immediately.",
  {
    conversation_id: z.string().describe("The Intercom conversation ID"),
    body: z.string().describe("The reply body (HTML supported)"),
  },
  async (args) => {
    const result = await sendReply(args, INTERCOM_API_KEY, INTERCOM_ADMIN_ID);
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
