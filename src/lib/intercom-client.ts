import axios, { AxiosInstance } from "axios";

const API_BASE = "https://api.intercom.io";

export interface SearchFilter {
  field: string;
  operator: string;
  value: string | number | boolean;
}

export interface ConversationSearchParams {
  filters: SearchFilter[];
  perPage?: number;
  startingAfter?: string;
}

export interface ReplyParams {
  conversationId: string;
  body: string;
  messageType: "note" | "comment";
  adminId: string;
}

export interface IntercomConversation {
  id: string;
  title: string | null;
  created_at: number;
  updated_at: number;
  state: string;
  open: boolean;
  read: boolean;
  source: { type: string; body: string; author: { type: string; name: string; email: string } };
  contacts: { contacts: Array<{ id: string; name: string; email: string }> };
  conversation_parts?: {
    conversation_parts: Array<{
      id: string;
      part_type: string;
      body: string | null;
      author: { type: string; name: string; email: string };
      created_at: number;
    }>;
  };
  statistics?: { time_to_first_human_reply: number | null; count_reopens: number };
}

export interface ConversationListResponse {
  type: string;
  conversations: IntercomConversation[];
  pages: { next?: { starting_after: string }; per_page: number; total_pages: number };
}

/** Contact model from Intercom Contacts API (device, version, location, etc.) */
export interface IntercomContact {
  type: string;
  id: string;
  workspace_id?: string;
  external_id: string | null;
  role: string;
  email: string | null;
  email_domain?: string | null;
  phone: string | null;
  name: string | null;
  avatar?: string | null;
  owner_id?: number | null;
  created_at: number;
  updated_at: number;
  signed_up_at: number | null;
  last_seen_at: number | null;
  last_replied_at: number | null;
  last_contacted_at: number | null;
  browser?: string | null;
  browser_version?: string | null;
  browser_language?: string | null;
  os?: string | null;
  location?: {
    type: string;
    country?: string;
    region?: string;
    city?: string;
    country_code?: string;
    continent_code?: string;
  } | null;
  android_app_name?: string | null;
  android_app_version?: string | null;
  android_device?: string | null;
  android_os_version?: string | null;
  android_sdk_version?: string | null;
  android_last_seen_at?: number | null;
  ios_app_name?: string | null;
  ios_app_version?: string | null;
  ios_device?: string | null;
  ios_os_version?: string | null;
  ios_sdk_version?: string | null;
  ios_last_seen_at?: number | null;
  custom_attributes?: Record<string, unknown>;
  tags?: { data: Array<{ type: string; id: string }> };
  [key: string]: unknown;
}

export function createIntercomClient(apiKey: string): {
  searchConversations: (params: ConversationSearchParams) => Promise<ConversationListResponse>;
  getConversation: (id: string) => Promise<IntercomConversation>;
  getContact: (id: string) => Promise<IntercomContact>;
  replyToConversation: (params: ReplyParams) => Promise<unknown>;
  listConversations: (updatedAfter?: number, perPage?: number, startingAfter?: string) => Promise<ConversationListResponse>;
} {
  const http: AxiosInstance = axios.create({
    baseURL: API_BASE,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      "Intercom-Version": "2.11",
    },
  });

  async function searchConversations(params: ConversationSearchParams): Promise<ConversationListResponse> {
    const query: Record<string, unknown> = params.filters.length === 1
      ? { field: params.filters[0].field, operator: params.filters[0].operator, value: params.filters[0].value }
      : { operator: "AND", value: params.filters.map((f) => ({ field: f.field, operator: f.operator, value: f.value })) };

    const body: Record<string, unknown> = {
      query,
      pagination: { per_page: params.perPage ?? 20 },
    };
    if (params.startingAfter) {
      (body.pagination as Record<string, unknown>).starting_after = params.startingAfter;
    }

    const res = await http.post("/conversations/search", body);
    return res.data as ConversationListResponse;
  }

  async function getConversation(id: string): Promise<IntercomConversation> {
    const res = await http.get(`/conversations/${id}`, {
      params: { display_as: "plaintext" },
    });
    return res.data as IntercomConversation;
  }

  async function getContact(id: string): Promise<IntercomContact> {
    const res = await http.get(`/contacts/${id}`);
    return res.data as IntercomContact;
  }

  async function replyToConversation(params: ReplyParams): Promise<unknown> {
    const res = await http.post(`/conversations/${params.conversationId}/reply`, {
      message_type: params.messageType,
      type: "admin",
      admin_id: params.adminId,
      body: params.body,
    });
    return res.data;
  }

  async function listConversations(
    updatedAfter?: number,
    perPage?: number,
    startingAfter?: string,
  ): Promise<ConversationListResponse> {
    const filters: SearchFilter[] = [];
    if (updatedAfter) {
      filters.push({ field: "updated_at", operator: ">", value: updatedAfter });
    }
    if (filters.length > 0) {
      return searchConversations({ filters, perPage, startingAfter });
    }
    const params: Record<string, unknown> = { per_page: perPage ?? 20, display_as: "plaintext" };
    if (startingAfter) params.starting_after = startingAfter;
    const res = await http.get("/conversations", { params });
    return res.data as ConversationListResponse;
  }

  return { searchConversations, getConversation, getContact, replyToConversation, listConversations };
}
