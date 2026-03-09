import { z } from "zod";
import { createIntercomClient, type IntercomTicket } from "../../lib/intercom-client.js";

export const getTicketSchema = z.object({
  ticket_id: z
    .string()
    .describe(
      "The Intercom ticket ID (API id, not the inbox #number). Use the id from conversation.linked_objects.data when type is 'ticket'.",
    ),
});

export type GetTicketInput = z.infer<typeof getTicketSchema>;

export async function getTicket(input: GetTicketInput, apiKey: string) {
  const client = createIntercomClient(apiKey);
  const t = await client.getTicket(input.ticket_id);
  return shapeTicket(t);
}

/** Shape ticket for ticket_type, ticket_attributes, submission date, and linked objects. */
export function shapeTicket(t: IntercomTicket) {
  return {
    id: t.id,
    ticket_id: t.ticket_id,
    created_at: t.created_at ? new Date(t.created_at * 1000).toISOString() : null,
    updated_at: t.updated_at ? new Date(t.updated_at * 1000).toISOString() : null,
    open: t.open,
    category: t.category,
    ticket_type: t.ticket_type
      ? {
          id: t.ticket_type.id,
          name: t.ticket_type.name,
          description: t.ticket_type.description ?? null,
          category: t.ticket_type.category ?? null,
        }
      : null,
    ticket_state: t.ticket_state
      ? {
          id: t.ticket_state.id,
          category: t.ticket_state.category,
          internal_label: t.ticket_state.internal_label ?? null,
          external_label: t.ticket_state.external_label ?? null,
        }
      : null,
    ticket_attributes: t.ticket_attributes ?? {},
    contacts: t.contacts?.contacts?.map((c) => ({ id: c.id, external_id: c.external_id ?? null })) ?? [],
    linked_objects: t.linked_objects?.data ?? [],
  };
}
