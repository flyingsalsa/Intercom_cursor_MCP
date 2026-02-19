import { z } from "zod";
import { createIntercomClient, type IntercomContact } from "../lib/intercom-client.js";

export const getContactSchema = z.object({
  contact_id: z.string().describe("The Intercom contact ID (from conversation.contacts or source.author)"),
});

export type GetContactInput = z.infer<typeof getContactSchema>;

function formatTs(ts: number | null | undefined): string | null {
  if (ts == null) return null;
  return new Date(ts * 1000).toISOString();
}

export async function getContact(input: GetContactInput, apiKey: string) {
  const client = createIntercomClient(apiKey);
  const c = await client.getContact(input.contact_id);

  return shapeContact(c);
}

/** Shape raw API contact for clear identity + device/version + location. */
export function shapeContact(c: IntercomContact) {
  return {
    identity: {
      id: c.id,
      external_id: c.external_id,
      role: c.role,
      name: c.name,
      email: c.email,
      phone: c.phone,
      avatar: c.avatar ?? undefined,
    },
    device_and_version: {
      browser: c.browser ?? null,
      browser_version: c.browser_version ?? null,
      browser_language: c.browser_language ?? null,
      os: c.os ?? null,
      android: c.android_app_name
        ? {
            app_name: c.android_app_name,
            app_version: c.android_app_version ?? null,
            device: c.android_device ?? null,
            os_version: c.android_os_version ?? null,
            sdk_version: c.android_sdk_version ?? null,
            last_seen_at: formatTs(c.android_last_seen_at ?? undefined),
          }
        : null,
      ios: c.ios_app_name
        ? {
            app_name: c.ios_app_name,
            app_version: c.ios_app_version ?? null,
            device: c.ios_device ?? null,
            os_version: c.ios_os_version ?? null,
            sdk_version: c.ios_sdk_version ?? null,
            last_seen_at: formatTs(c.ios_last_seen_at ?? undefined),
          }
        : null,
    },
    location: c.location
      ? {
          country: c.location.country ?? null,
          region: c.location.region ?? null,
          city: c.location.city ?? null,
          country_code: c.location.country_code ?? null,
          continent_code: c.location.continent_code ?? null,
        }
      : null,
    timestamps: {
      created_at: formatTs(c.created_at),
      updated_at: formatTs(c.updated_at),
      signed_up_at: formatTs(c.signed_up_at ?? undefined),
      last_seen_at: formatTs(c.last_seen_at ?? undefined),
      last_replied_at: formatTs(c.last_replied_at ?? undefined),
      last_contacted_at: formatTs(c.last_contacted_at ?? undefined),
    },
    custom_attributes: c.custom_attributes ?? {},
    tags: c.tags?.data?.map((t) => t.id) ?? [],
  };
}
