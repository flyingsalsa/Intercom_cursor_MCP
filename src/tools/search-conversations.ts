import { z } from "zod";
import { createIntercomClient, SearchFilter } from "../lib/intercom-client.js";

export const searchConversationsSchema = z.object({
  state: z.enum(["open", "closed", "snoozed"]).optional().describe("Filter by conversation state"),
  created_after: z.string().optional().describe("ISO 8601 date string — only conversations created after this date"),
  created_before: z.string().optional().describe("ISO 8601 date string — only conversations created before this date"),
  updated_after: z.string().optional().describe("ISO 8601 date string — only conversations updated after this date"),
  updated_before: z.string().optional().describe("ISO 8601 date string — only conversations updated before this date"),
  source_type: z.enum(["email", "chat", "push", "twitter", "facebook"]).optional().describe("Filter by conversation source"),
  per_page: z.number().min(1).max(150).optional().describe("Results per page (default 20, max 150)"),
});

export type SearchConversationsInput = z.infer<typeof searchConversationsSchema>;

export async function searchConversations(input: SearchConversationsInput, apiKey: string) {
  const client = createIntercomClient(apiKey);
  const filters: SearchFilter[] = [];

  if (input.state) {
    filters.push({ field: "state", operator: "=", value: input.state });
  }
  if (input.created_after) {
    filters.push({ field: "created_at", operator: ">", value: Math.floor(new Date(input.created_after).getTime() / 1000) });
  }
  if (input.created_before) {
    filters.push({ field: "created_at", operator: "<", value: Math.floor(new Date(input.created_before).getTime() / 1000) });
  }
  if (input.updated_after) {
    filters.push({ field: "updated_at", operator: ">", value: Math.floor(new Date(input.updated_after).getTime() / 1000) });
  }
  if (input.updated_before) {
    filters.push({ field: "updated_at", operator: "<", value: Math.floor(new Date(input.updated_before).getTime() / 1000) });
  }
  if (input.source_type) {
    filters.push({ field: "source.type", operator: "=", value: input.source_type });
  }

  if (filters.length === 0) {
    const result = await client.listConversations(undefined, input.per_page);
    return formatConversationList(result.conversations);
  }

  const result = await client.searchConversations({ filters, perPage: input.per_page });
  return formatConversationList(result.conversations);
}

function formatConversationList(conversations: Array<{ id: string; title: string | null; state: string; created_at: number; updated_at: number; source: { type: string; body: string; author: { type: string; name: string; email: string } }; contacts: { contacts: Array<{ name: string; email: string }> } }>) {
  return conversations.map((c) => ({
    id: c.id,
    title: c.title,
    state: c.state,
    created_at: new Date(c.created_at * 1000).toISOString(),
    updated_at: new Date(c.updated_at * 1000).toISOString(),
    source_type: c.source.type,
    preview: c.source.body?.substring(0, 200) ?? "",
    contact: c.contacts.contacts[0] ? { name: c.contacts.contacts[0].name, email: c.contacts.contacts[0].email } : null,
  }));
}
