import { z } from "zod";
import { createIntercomClient, type IntercomContact } from "../../lib/intercom-client.js";

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

/** Extract wallet/address fields from custom_attributes (case-insensitive, underscore-agnostic). */
function extractAddresses(attrs: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!attrs || typeof attrs !== "object") return {};
  const norm = (s: string) => s.toLowerCase().replace(/_/g, "");
  const byNorm = Object.fromEntries(
    Object.entries(attrs).map(([k, v]) => [norm(k), v])
  );
  const keys = ["safe_address", "wallet_address", "wallet", "user_id", "active_account_address"];
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    const v = byNorm[norm(k)];
    if (v != null && v !== "") out[k] = v;
  }
  return out;
}

/** Shape raw API contact for clear identity + device/version + location. */
export function shapeContact(c: IntercomContact) {
  const attrs = c.custom_attributes ?? {};
  const addresses = extractAddresses(attrs as Record<string, unknown>);
  const android = c.android_app_name
    ? {
        app_name: c.android_app_name,
        app_version: c.android_app_version ?? null,
        device: c.android_device ?? null,
        os_version: c.android_os_version ?? null,
        sdk_version: c.android_sdk_version ?? null,
        last_seen_at: formatTs(c.android_last_seen_at ?? undefined),
      }
    : null;
  const ios = c.ios_app_name
    ? {
        app_name: c.ios_app_name,
        app_version: c.ios_app_version ?? null,
        device: c.ios_device ?? null,
        os_version: c.ios_os_version ?? null,
        sdk_version: c.ios_sdk_version ?? null,
        last_seen_at: formatTs(c.ios_last_seen_at ?? undefined),
      }
    : null;

  const isHexAddress = (v: unknown) => typeof v === "string" && /^0x[a-fA-F0-9]+$/i.test(v);
  const walletFromUserId = isHexAddress(addresses.user_id) ? addresses.user_id : null;
  const walletFromUserIdAlt = isHexAddress(addresses.userId) ? addresses.userId : null;
  const wallet_address = (c.external_id && isHexAddress(c.external_id))
    ? c.external_id
    : (addresses.wallet_address ?? addresses.wallet ?? walletFromUserId ?? walletFromUserIdAlt ?? addresses.active_account_address) as string | null;
  const safe_address = (addresses.safe_address ?? addresses.safeAddress) as string | null;

  return {
    summary: {
      email: c.email ?? null,
      name: c.name ?? null,
      user_id: c.external_id ?? wallet_address ?? null,
      wallet_address: wallet_address ?? null,
      safe_address: safe_address ?? null,
      app_version: ios?.app_version ?? android?.app_version ?? null,
      device: ios?.device ?? android?.device ?? null,
      os_version: ios?.os_version ?? android?.os_version ?? null,
      last_seen_at: formatTs(c.last_seen_at ?? c.ios_last_seen_at ?? c.android_last_seen_at ?? undefined),
      referrer: c.referrer ?? null,
      utm_source: c.utm_source ?? null,
      utm_medium: c.utm_medium ?? null,
      utm_campaign: c.utm_campaign ?? null,
    },
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
      android,
      ios,
    },
    addresses: Object.keys(addresses).length > 0 ? addresses : undefined,
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
    referrer: c.referrer ?? null,
    utm: {
      source: c.utm_source ?? null,
      medium: c.utm_medium ?? null,
      campaign: c.utm_campaign ?? null,
      term: c.utm_term ?? null,
      content: c.utm_content ?? null,
    },
    custom_attributes: attrs,
    tags: c.tags?.data?.map((t) => t.id) ?? [],
  };
}
