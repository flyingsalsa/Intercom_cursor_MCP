import { z } from "zod";
import { createIntercomClient } from "../../lib/intercom-client.js";

export const draftReplySchema = z.object({
  conversation_id: z.string().describe("The Intercom conversation ID to draft a reply for"),
  body: z.string().describe("The reply body text (HTML supported)"),
});

export type DraftReplyInput = z.infer<typeof draftReplySchema>;

/** Appended to every draft note. Intercom supports HTML; <br> helps ensure the signature is not stripped. */
const DRAFT_SIGNATURE = "<br><br>- cursor MCP";

export async function draftReply(input: DraftReplyInput, apiKey: string, adminId: string) {
  const client = createIntercomClient(apiKey);
  const body = input.body.trimEnd() + DRAFT_SIGNATURE;

  await client.replyToConversation({
    conversationId: input.conversation_id,
    body,
    messageType: "note",
    adminId,
  });

  return {
    success: true,
    conversation_id: input.conversation_id,
    message: `Draft note added to conversation ${input.conversation_id}. Review in Intercom before sending to the customer.`,
    type: "note",
  };
}
