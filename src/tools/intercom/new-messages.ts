import { z } from "zod";
import { createIntercomClient } from "../../lib/intercom-client.js";

export const getNewMessagesSchema = z.object({
  reset: z.boolean().optional().describe("If true, resets the high-water mark to now and returns nothing. Useful to start fresh."),
});

export type GetNewMessagesInput = z.infer<typeof getNewMessagesSchema>;

let lastCheckTimestamp: number | null = null;

export async function getNewMessages(input: GetNewMessagesInput, apiKey: string) {
  if (input.reset) {
    lastCheckTimestamp = Math.floor(Date.now() / 1000);
    return { message: "High-water mark reset to now. Next call will only return newer conversations." };
  }

  const client = createIntercomClient(apiKey);
  const since = lastCheckTimestamp ?? Math.floor(Date.now() / 1000) - 3600; // default: last hour

  const result = await client.listConversations(since, 50);
  lastCheckTimestamp = Math.floor(Date.now() / 1000);

  const queue = result.conversations.map((c) => ({
    id: c.id,
    title: c.title,
    state: c.state,
    updated_at: new Date(c.updated_at * 1000).toISOString(),
    source_type: c.source.type,
    preview: c.source.body?.substring(0, 300) ?? "",
    contact: c.contacts.contacts[0]
      ? { name: c.contacts.contacts[0].name, email: c.contacts.contacts[0].email }
      : null,
  }));

  return {
    since: new Date(since * 1000).toISOString(),
    checked_at: new Date().toISOString(),
    count: queue.length,
    conversations: queue,
  };
}

export function getLastCheckTimestamp(): number | null {
  return lastCheckTimestamp;
}
