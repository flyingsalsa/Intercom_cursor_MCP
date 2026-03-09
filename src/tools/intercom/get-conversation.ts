import { z } from "zod";
import axios from "axios";
import { createIntercomClient, PartAttachment } from "../../lib/intercom-client.js";
import { shapeContact } from "./get-contact.js";
import { shapeTicket } from "./get-ticket.js";

export const getConversationSchema = z.object({
  conversation_id: z.string().describe("The Intercom conversation ID to retrieve"),
  include_ticket_data: z
    .boolean()
    .optional()
    .describe("When true, fetches ticket data if this conversation is a ticket. Adds is_ticket and ticket (ticket_type, ticket_attributes, etc.) to the response."),
  include_contact_data: z
    .boolean()
    .optional()
    .describe("When true, fetches full contact data (wallet_address, device, custom_attributes, etc.) and adds contact_full to the response."),
});

export type GetConversationInput = z.infer<typeof getConversationSchema>;

const IMAGE_MIME_PREFIXES = ["image/png", "image/jpeg", "image/gif", "image/webp", "image/svg"];

function isImageAttachment(a: PartAttachment): boolean {
  if (a.content_type && IMAGE_MIME_PREFIXES.some((p) => a.content_type!.startsWith(p))) return true;
  if (/\.(png|jpe?g|gif|webp|svg)(\?|$)/i.test(a.url)) return true;
  return false;
}

function mimeFromUrl(url: string): string {
  const ext = url.match(/\.(png|jpe?g|gif|webp|svg)/i)?.[1]?.toLowerCase();
  const map: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml" };
  return map[ext ?? ""] ?? "image/png";
}

function decodeHtmlEntities(s: string): string {
  return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#x27;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function normalizeUrl(url: string): string {
  return decodeHtmlEntities(url).replace(/\s+/g, "");
}

function extractImgUrls(html: string | null): string[] {
  if (!html) return [];
  const urls: string[] = [];
  const re = /<img\s[^>]*?src=["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    urls.push(decodeHtmlEntities(m[1]));
  }
  return urls;
}

export interface ImageBlock {
  type: "image";
  data: string;
  mimeType: string;
  messageIndex: number;
  attachmentName: string | null;
}

async function fetchImageAsBase64(url: string, contentType?: string): Promise<{ data: string; mimeType: string } | null> {
  try {
    const resp = await axios.get(url, { responseType: "arraybuffer", timeout: 15_000 });
    const buf = Buffer.from(resp.data as ArrayBuffer);
    const mimeType = contentType ?? resp.headers["content-type"]?.split(";")[0] ?? mimeFromUrl(url);
    return { data: buf.toString("base64"), mimeType };
  } catch {
    return null;
  }
}

interface FormattedAttachment {
  name: string | null;
  url: string;
  content_type: string | null;
  filesize: number | null;
  width: number | null;
  height: number | null;
  is_image: boolean;
}

async function formatAttachments(
  attachments: PartAttachment[] | undefined,
  messageIndex: number,
  imageBlocks: ImageBlock[],
  fetchedUrls?: Set<string>,
): Promise<FormattedAttachment[] | undefined> {
  if (!attachments || attachments.length === 0) return undefined;

  const results: FormattedAttachment[] = [];
  for (const a of attachments) {
    const isImage = isImageAttachment(a);
    results.push({
      name: a.name ?? null,
      url: a.url,
      content_type: a.content_type ?? null,
      filesize: a.filesize ?? null,
      width: a.width ?? null,
      height: a.height ?? null,
      is_image: isImage,
    });

    if (isImage) {
      fetchedUrls?.add(normalizeUrl(a.url));
      const fetched = await fetchImageAsBase64(a.url, a.content_type);
      if (fetched) {
        imageBlocks.push({
          type: "image",
          data: fetched.data,
          mimeType: fetched.mimeType,
          messageIndex,
          attachmentName: a.name ?? null,
        });
      }
    }
  }
  return results;
}

export async function getConversation(input: GetConversationInput, apiKey: string) {
  const client = createIntercomClient(apiKey);
  const conv = await client.getConversation(input.conversation_id);

  const imageBlocks: ImageBlock[] = [];
  const fetchedUrls = new Set<string>();

  async function fetchInlineImages(html: string | null, messageIndex: number) {
    for (const url of extractImgUrls(html)) {
      const key = normalizeUrl(url);
      if (fetchedUrls.has(key)) continue;
      fetchedUrls.add(key);
      const fetched = await fetchImageAsBase64(url);
      if (fetched) {
        imageBlocks.push({
          type: "image",
          data: fetched.data,
          mimeType: fetched.mimeType,
          messageIndex,
          attachmentName: null,
        });
      }
    }
  }

  const sourceAttachments = await formatAttachments(conv.source.attachments, 0, imageBlocks, fetchedUrls);
  await fetchInlineImages(conv.source.body, 0);

  const parts = (conv.conversation_parts?.conversation_parts ?? [])
    .filter((p) => p.body || (p.attachments && p.attachments.length > 0));

  const partMessages = [];
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    const partAttachments = await formatAttachments(p.attachments, i + 1, imageBlocks, fetchedUrls);
    await fetchInlineImages(p.body, i + 1);
    partMessages.push({
      author: p.author.name ?? p.author.type,
      author_type: p.author.type,
      body: p.body,
      created_at: new Date(p.created_at * 1000).toISOString(),
      ...(partAttachments && { attachments: partAttachments }),
    });
  }

  const messages = [
    {
      author: conv.source.author.name ?? conv.source.author.type,
      author_type: conv.source.author.type,
      body: conv.source.body,
      created_at: new Date(conv.created_at * 1000).toISOString(),
      ...(sourceAttachments && { attachments: sourceAttachments }),
    },
    ...partMessages,
  ];

  let ticketData: { is_ticket?: boolean; ticket?: ReturnType<typeof shapeTicket> } = {};

  if (input.include_ticket_data) {
    try {
      const t = await client.getTicket(input.conversation_id);
      ticketData = { is_ticket: true, ticket: shapeTicket(t) };
    } catch (err) {
      const status = axios.isAxiosError(err) ? err.response?.status : undefined;
      if (status !== 404) throw err;
      ticketData = { is_ticket: false };
    }
  }

  let contactData: { contact_full?: ReturnType<typeof shapeContact> } = {};

  if (input.include_contact_data && conv.contacts.contacts[0]?.id) {
    try {
      const c = await client.getContact(conv.contacts.contacts[0].id);
      contactData = { contact_full: shapeContact(c) };
    } catch (err) {
      const status = axios.isAxiosError(err) ? err.response?.status : undefined;
      if (status !== 404) throw err;
      // Silently omit contact_full on other errors to avoid failing the whole fetch
    }
  }

  const conversation = {
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
    ...(conv.custom_attributes && Object.keys(conv.custom_attributes).length > 0 && { custom_attributes: conv.custom_attributes }),
    ...(conv.linked_objects?.data?.length && {
      linked_objects: {
        data: conv.linked_objects.data,
        total_count: conv.linked_objects.total_count,
        has_more: conv.linked_objects.has_more,
      },
    }),
    ...ticketData,
    ...contactData,
  };

  return { conversation, imageBlocks };
}
