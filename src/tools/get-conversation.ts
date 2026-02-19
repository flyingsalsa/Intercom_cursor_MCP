import { z } from "zod";
import { createIntercomClient } from "../lib/intercom-client.js";

export const getConversationSchema = z.object({
  conversation_id: z.string().describe("The Intercom conversation ID to retrieve"),
});

export type GetConversationInput = z.infer<typeof getConversationSchema>;

export async function getConversation(input: GetConversationInput, apiKey: string) {
  const client = createIntercomClient(apiKey);
  const conv = await client.getConversation(input.conversation_id);

  const messages = [
    {
      author: conv.source.author.name ?? conv.source.author.type,
      author_type: conv.source.author.type,
      body: conv.source.body,
      created_at: new Date(conv.created_at * 1000).toISOString(),
    },
    ...(conv.conversation_parts?.conversation_parts ?? [])
      .filter((p) => p.body)
      .map((p) => ({
        author: p.author.name ?? p.author.type,
        author_type: p.author.type,
        body: p.body,
        created_at: new Date(p.created_at * 1000).toISOString(),
      })),
  ];

  return {
    id: conv.id,
    title: conv.title,
    state: conv.state,
    open: conv.open,
    created_at: new Date(conv.created_at * 1000).toISOString(),
    updated_at: new Date(conv.updated_at * 1000).toISOString(),
    contact: conv.contacts.contacts[0]
      ? {
          id: conv.contacts.contacts[0].id,
          name: conv.contacts.contacts[0].name,
          email: conv.contacts.contacts[0].email,
        }
      : null,
    messages,
    stats: conv.statistics ?? null,
  };
}
