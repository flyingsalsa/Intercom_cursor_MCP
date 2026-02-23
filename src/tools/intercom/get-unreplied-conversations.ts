import { z } from "zod";
import { createIntercomClient, PartAttachment } from "../../lib/intercom-client.js";

const CUSTOMER_AUTHOR_TYPES = ["user", "lead"];

export const getUnrepliedConversationsSchema = z.object({
  per_page: z.number().min(1).max(150).optional().describe("Max open conversations to fetch per page (default 150)"),
});

export type GetUnrepliedConversationsInput = z.infer<typeof getUnrepliedConversationsSchema>;

export async function getUnrepliedConversations(input: GetUnrepliedConversationsInput, apiKey: string) {
  const client = createIntercomClient(apiKey);
  const perPage = input.per_page ?? 150;

  // 1. Search for all open conversations
  const searchResult = await client.searchConversations({
    filters: [{ field: "state", operator: "=", value: "open" }],
    perPage,
  });

  const openConversations = searchResult.conversations;
  if (openConversations.length === 0) {
    return { unreplied: [], total_open: 0 };
  }

  // 2. Fetch full details for each to check last message author (batch to avoid rate limits)
  const BATCH_SIZE = 10;
  const unreplied: Array<{
    id: string;
    title: string | null;
    created_at: string;
    updated_at: string;
    last_message: { author: string; author_type: string; body: string; created_at: string; attachments?: Array<{ name: string | null; url: string; content_type: string | null }> };
    preview: string;
  }> = [];

  for (let i = 0; i < openConversations.length; i += BATCH_SIZE) {
    const batch = openConversations.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map(async (conv) => {
        const full = await client.getConversation(conv.id);
        const messages = buildMessageList(full);
        const lastMessage = messages[messages.length - 1];
        if (!lastMessage) return null;
        const isCustomerMessage = CUSTOMER_AUTHOR_TYPES.includes(lastMessage.author_type);
        if (!isCustomerMessage) return null;

        return {
          id: full.id,
          title: full.title,
          created_at: new Date(full.created_at * 1000).toISOString(),
          updated_at: new Date(full.updated_at * 1000).toISOString(),
          last_message: lastMessage,
          preview: (lastMessage.body ?? "").replace(/<[^>]*>/g, "").substring(0, 200),
        };
      }),
    );

    for (const r of results) {
      if (r) unreplied.push(r);
    }
  }

  // Sort by updated_at descending (most recently active first)
  unreplied.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

  return {
    unreplied,
    total_open: openConversations.length,
    total_unreplied: unreplied.length,
  };
}

function formatAttachments(attachments?: PartAttachment[]) {
  if (!attachments || attachments.length === 0) return undefined;
  return attachments.map((a) => ({
    name: a.name ?? null,
    url: a.url,
    content_type: a.content_type ?? null,
  }));
}

function buildMessageList(conv: {
  source: { body: string; author: { type: string; name: string }; attachments?: PartAttachment[] };
  created_at: number;
  conversation_parts?: {
    conversation_parts: Array<{
      body: string | null;
      author: { type: string; name: string };
      created_at: number;
      attachments?: PartAttachment[];
    }>;
  };
}): Array<{ author: string; author_type: string; body: string; created_at: string; attachments?: Array<{ name: string | null; url: string; content_type: string | null }> }> {
  const parts = conv.conversation_parts?.conversation_parts ?? [];
  const sourceAttachments = formatAttachments(conv.source.attachments);
  const list = [
    {
      author: conv.source.author.name ?? conv.source.author.type,
      author_type: conv.source.author.type,
      body: conv.source.body ?? "",
      created_at: new Date(conv.created_at * 1000).toISOString(),
      ...(sourceAttachments && { attachments: sourceAttachments }),
    },
    ...parts
      .filter((p) => p.body || (p.attachments && p.attachments.length > 0))
      .map((p) => {
        const partAttachments = formatAttachments(p.attachments);
        return {
          author: p.author.name ?? p.author.type,
          author_type: p.author.type,
          body: p.body ?? "",
          created_at: new Date(p.created_at * 1000).toISOString(),
          ...(partAttachments && { attachments: partAttachments }),
        };
      }),
  ];
  return list;
}
