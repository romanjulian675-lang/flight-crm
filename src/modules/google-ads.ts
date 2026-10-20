import { timingSafeEqual } from "node:crypto";
import type { Db } from "@/lib/db";
import type { Integration } from "@/generated/prisma/client";
import { ingest, type IngestResult } from "@/modules/intake";

/**
 * Google Ads lead form extensions. In Google Ads: Lead form → Lead delivery → Webhook integration,
 * paste our URL and the generated key. Google POSTs one JSON lead per request:
 *   { lead_id, google_key, is_test, campaign_id, form_id, user_column_data: [{ column_id, column_name, string_value }] }
 */
export type GoogleLead = {
  lead_id?: string;
  google_key?: string;
  is_test?: boolean;
  campaign_id?: string | number;
  form_id?: string | number;
  user_column_data?: { column_id?: string; column_name?: string; string_value?: string }[];
};

/** Google's column ids → field names our normalizer understands. */
const COLUMNS: Record<string, string> = {
  FULL_NAME: "full_name",
  FIRST_NAME: "first_name",
  LAST_NAME: "last_name",
  EMAIL: "email",
  WORK_EMAIL: "email",
  PHONE_NUMBER: "phone",
  WORK_PHONE: "phone",
};

function keyMatches(expected: unknown, given: unknown) {
  if (typeof expected !== "string" || typeof given !== "string") return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function handleGoogleLead(db: Db, integration: Integration, body: GoogleLead): Promise<IngestResult | "BAD_KEY"> {
  const config = (integration.config ?? {}) as { googleKey?: string };
  if (!keyMatches(config.googleKey, body.google_key)) return "BAD_KEY";
  const raw: Record<string, string> = {};
  for (const c of body.user_column_data ?? []) {
    if (!c.string_value) continue;
    const name = (c.column_id && COLUMNS[c.column_id]) || c.column_name || c.column_id || "answer";
    raw[name] = raw[name] ? `${raw[name]}, ${c.string_value}` : c.string_value;
  }
  return ingest(db, integration, raw, {
    externalId: body.lead_id ? `g:${body.lead_id}` : null,
    source: "GOOGLE",
    via: body.is_test ? `${integration.name} (Google test lead)` : integration.name,
    extraNote: body.campaign_id ? `Google Ads campaign ${body.campaign_id}` : null,
  });
}
