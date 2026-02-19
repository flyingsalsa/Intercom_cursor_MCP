import { z } from "zod";
import { createIntercomClient } from "../lib/intercom-client.js";

export const sendReplySchema = z.object({
  conversation_id: z.string().describe("The Intercom conversation ID to send a reply to"),
  body: z.string().describe("The reply body text (HTML supported) that the customer will see"),
});

export type SendReplyInput = z.infer<typeof sendReplySchema>;

export async function sendReply(input: SendReplyInput, apiKey: string, adminId: string) {
  const client = createIntercomClient(apiKey);

  await client.replyToConversation({
    conversationId: input.conversation_id,
    body: input.body,
    messageType: "comment",
    adminId,
  });

  return {
    success: true,
    conversation_id: input.conversation_id,
    message: `Reply sent to customer on conversation ${input.conversation_id}.`,
    type: "comment",
  };
}
