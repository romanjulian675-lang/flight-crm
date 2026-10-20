import { createHmac, timingSafeEqual } from "node:crypto";
import type { Db } from "@/lib/db";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { newToken } from "@/modules/integrations";
import { ingest } from "@/modules/intake";

/**
 * Facebook & Instagram Lead Ads.
 *
 * Setup (once, for the product): a Meta app with Facebook Login + Webhooks, the `leadgen` field of
 * the Page object subscribed to APP_URL/api/webhooks/meta, and app review for leads_retrieval,
 * pages_manage_metadata, pages_show_list, pages_read_engagement. Instagram lead ads arrive through
 * the Facebook page linked to the Instagram account.
 *
 * Per school: an owner/manager clicks "Connect Facebook", picks pages; we store each page token
 * (encrypted) and subscribe the page to our app. Meta then POSTs { entry: [{ changes: [{ field:
 * "leadgen", value: { leadgen_id, page_id, form_id, ad_id } }] }] } and we fetch the lead.
 */

export const META_SCOPES = ["pages_show_list", "pages_read_engagement", "pages_manage_metadata", "leads_retrieval", "business_management"];

export type Fetch = typeof fetch;

/** Short-lived cookie tying the OAuth round-trip to the school that started it. */
export const META_STATE_COOKIE = "fl_meta_state";

export function metaConfig() {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  const verifyToken = process.env.META_VERIFY_TOKEN;
  const version = process.env.META_GRAPH_VERSION || "v23.0";
  const appUrl = process.env.APP_URL || process.env.BETTER_AUTH_URL || "http://localhost:3200";
  return { configured: Boolean(appId && appSecret && verifyToken), appId: appId ?? "", appSecret: appSecret ?? "", verifyToken: verifyToken ?? "", version, appUrl };
}

const graphBase = () => `https://graph.facebook.com/${metaConfig().version}`;

export const metaRedirectUri = () => `${metaConfig().appUrl}/api/integrations/meta/callback`;

export function metaLoginUrl(state: string) {
  const c = metaConfig();
  const p = new URLSearchParams({ client_id: c.appId, redirect_uri: metaRedirectUri(), state, scope: META_SCOPES.join(","), response_type: "code" });
  return `https://www.facebook.com/${c.version}/dialog/oauth?${p}`;
}

/** Meta signs webhook bodies with the app secret: X-Hub-Signature-256: sha256=<hex>. */
export function verifyMetaSignature(rawBody: string, header: string | null, secret = metaConfig().appSecret) {
  if (!header?.startsWith("sha256=") || !secret) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(rawBody).digest("hex"));
  const given = Buffer.from(header.slice(7));
  return expected.length === given.length && timingSafeEqual(expected, given);
}

async function graph<T>(f: Fetch, path: string, params: Record<string, string>, method: "GET" | "POST" | "DELETE" = "GET"): Promise<T> {
  const url = `${graphBase()}/${path}?${new URLSearchParams(params)}`;
  const res = await f(url, { method });
  const json = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!res.ok || json.error) throw new Error(`Meta API: ${json.error?.message ?? res.status}`);
  return json;
}

/** OAuth callback: exchange the code, list the user's pages, store + subscribe them for this school. */
export async function connectMetaPages(db: Db, orgId: string, code: string, f: Fetch = fetch) {
  const c = metaConfig();
  const short = await graph<{ access_token: string }>(f, "oauth/access_token", { client_id: c.appId, client_secret: c.appSecret, redirect_uri: metaRedirectUri(), code });
  // Page tokens obtained from a long-lived user token don't expire.
  const long = await graph<{ access_token: string }>(f, "oauth/access_token", { grant_type: "fb_exchange_token", client_id: c.appId, client_secret: c.appSecret, fb_exchange_token: short.access_token });
  const pages = await graph<{ data: { id: string; name: string; access_token: string }[] }>(f, "me/accounts", { fields: "id,name,access_token", limit: "100", access_token: long.access_token });

  let integration = await db.integration.findFirst({ where: { orgId, kind: "META" } });
  integration ??= await db.integration.create({ data: { orgId, kind: "META", name: "Facebook & Instagram Lead Ads", token: newToken(), defaultSource: "FACEBOOK" } });

  const results: { pageName: string; ok: boolean; error?: string }[] = [];
  for (const p of pages.data) {
    const taken = await db.metaPage.findUnique({ where: { pageId: p.id } });
    if (taken && taken.orgId !== orgId) {
      results.push({ pageName: p.name, ok: false, error: "Connected to another school" });
      continue;
    }
    let subscribed = false;
    let lastError: string | null = null;
    try {
      await graph(f, `${p.id}/subscribed_apps`, { subscribed_fields: "leadgen", access_token: p.access_token }, "POST");
      subscribed = true;
    } catch (e) {
      lastError = e instanceof Error ? e.message : "Subscription failed";
    }
    await db.metaPage.upsert({
      where: { pageId: p.id },
      create: { orgId, integrationId: integration.id, pageId: p.id, pageName: p.name, accessTokenEnc: encryptSecret(p.access_token), subscribed, lastError },
      update: { integrationId: integration.id, pageName: p.name, accessTokenEnc: encryptSecret(p.access_token), subscribed, lastError },
    });
    results.push({ pageName: p.name, ok: subscribed, error: lastError ?? undefined });
  }
  return results;
}

export async function disconnectMetaPage(db: Db, orgId: string, metaPageId: string, f: Fetch = fetch) {
  const page = await db.metaPage.findFirst({ where: { id: metaPageId, orgId } });
  if (!page) return;
  try {
    await graph(f, `${page.pageId}/subscribed_apps`, { access_token: decryptSecret(page.accessTokenEnc) }, "DELETE");
  } catch {
    // Already removed on Meta's side, or the token was revoked: deleting our copy is what matters.
  }
  await db.metaPage.delete({ where: { id: page.id } });
}

type LeadgenChange = { field?: string; value?: { leadgen_id?: string; page_id?: string; form_id?: string; ad_id?: string } };
type MetaWebhookBody = { object?: string; entry?: { id?: string; changes?: LeadgenChange[] }[] };
type MetaLead = { id: string; field_data?: { name: string; values?: string[] }[]; platform?: string; ad_name?: string; campaign_name?: string; form_id?: string; is_organic?: boolean };

/** Process a (signature-verified) webhook delivery. Never throws: failures are logged as intake events. */
export async function handleMetaWebhook(db: Db, body: MetaWebhookBody, f: Fetch = fetch) {
  const out: { leadgenId: string; status: string }[] = [];
  if (body.object !== "page") return out;
  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const v = change.value;
      if (change.field !== "leadgen" || !v?.leadgen_id) continue;
      const page = await db.metaPage.findUnique({ where: { pageId: String(v.page_id ?? entry.id) }, include: { integration: true } });
      if (!page) {
        out.push({ leadgenId: v.leadgen_id, status: "UNKNOWN_PAGE" });
        continue;
      }
      try {
        const lead = await graph<MetaLead>(f, v.leadgen_id, {
          fields: "id,field_data,platform,ad_name,campaign_name,form_id,is_organic",
          access_token: decryptSecret(page.accessTokenEnc),
        });
        const raw: Record<string, string> = {};
        for (const fd of lead.field_data ?? []) raw[fd.name] = (fd.values ?? []).join(", ");
        const ig = lead.platform === "ig" || lead.platform === "instagram";
        const res = await ingest(db, page.integration, raw, {
          externalId: `fb:${v.leadgen_id}`,
          source: ig ? "INSTAGRAM" : "FACEBOOK",
          via: `${ig ? "Instagram" : "Facebook"} lead ad · ${page.pageName}`,
          extraNote: [lead.campaign_name && `Campaign: ${lead.campaign_name}`, lead.ad_name && `Ad: ${lead.ad_name}`].filter(Boolean).join("\n") || null,
        });
        out.push({ leadgenId: v.leadgen_id, status: res.status });
      } catch (e) {
        const msg = e instanceof Error ? e.message.slice(0, 300) : "Unknown error";
        await db.intakeEvent.create({
          data: { orgId: page.orgId, integrationId: page.integrationId, status: "ERROR", error: msg, summary: { leadgenId: v.leadgen_id, page: page.pageName } },
        });
        await db.metaPage.update({ where: { id: page.id }, data: { lastError: msg } });
        out.push({ leadgenId: v.leadgen_id, status: "ERROR" });
      }
    }
  }
  return out;
}
