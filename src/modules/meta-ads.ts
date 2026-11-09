import "server-only";
import { z } from "zod";
import type { Db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { invalid, notFound } from "@/lib/errors";
import { ensure, isManager, type AccessContext } from "@/modules/access";
import { metaConfig, type Fetch } from "@/modules/meta";
const account = z.object({ id: z.string().regex(/^act_\d+$/), name: z.string(), currency: z.string(), timezone_name: z.string().optional() });
const row = z.object({ ad_id: z.string(), ad_name: z.string(), campaign_name: z.string(), spend: z.string().regex(/^\d+(\.\d+)?$/), impressions: z.string(), clicks: z.string(), date_start: z.string(), date_stop: z.string() });
const creative = z.object({ id: z.string(), name: z.string(), creative: z.object({ id: z.string(), thumbnail_url: z.url().optional(), image_url: z.url().optional() }).optional() });
const settings = z.object({ tokenEnc: z.string(), accounts: z.array(account), selectedId: z.string().nullable(), report: z.object({ accountId: z.string(), since: z.string(), until: z.string(), syncedAt: z.string(), rows: z.array(row), creatives: z.array(creative).default([]) }).nullable().default(null) });
const object = (v: unknown): Record<string, Prisma.InputJsonValue> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, Prisma.InputJsonValue> : {};
export function readMetaAds(config: unknown) { const data = settings.safeParse(object(config).metaAds); return data.success ? data.data : null; }
async function read<T>(f: Fetch, path: string, token: string, params: Record<string, string> = {}): Promise<T> {
 const response = await f(`https://graph.facebook.com/${metaConfig().version}/${path}?${new URLSearchParams(params)}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(15000) });
 const body = await response.json();
 if (!response.ok || body.error) throw invalid("Meta reporting access is unavailable. Reconnect Facebook and approve read-only ad access.");
 return body as T;
}
async function list<T>(f: Fetch, path: string, token: string, params: Record<string, string>) {
 const result: T[] = []; let after = "";
 for (let page = 0; page < 100; page++) {
  const data = await read<{ data: T[]; paging?: { next?: string; cursors?: { after?: string } } }>(f, path, token, { ...params, limit: "100", ...(after ? { after } : {}) });
  if (!Array.isArray(data.data)) throw invalid("Meta returned an incomplete report. Try again.");
  result.push(...data.data);
  if (!data.paging?.next) return result;
  const cursor = data.paging.cursors?.after; if (!cursor || cursor === after) break;
  after = cursor; // Never follow arbitrary URLs carrying credentials.
 }
 throw invalid("Meta returned too many results. Use a smaller reporting period.");
}
/** Reporting is optional: declined access must not break lead/message delivery. */
export async function connectMetaAds(db: Db, orgId: string, integrationId: string, token: string, f: Fetch = fetch) {
 const integration = await db.integration.findFirst({ where: { id: integrationId, orgId, kind: "META" } }); if (!integration) throw notFound();
 const permissions = await read<{ data: { permission: string; status: string }[] }>(f, "me/permissions", token);
 if (!permissions.data.some(p => p.permission === "ads_read" && p.status === "granted")) {
  await db.integration.update({ where: { id: integration.id }, data: { config: { ...object(integration.config), metaAds: null } } }); return;
 }
 const accounts = (await list<unknown>(f, "me/adaccounts", token, { fields: "id,name,currency,timezone_name" })).map(a => account.parse(a));
 const old = readMetaAds(integration.config); const selectedId = accounts.some(a => a.id === old?.selectedId) ? old!.selectedId : null;
 await db.integration.update({ where: { id: integration.id }, data: { config: { ...object(integration.config), metaAds: { tokenEnc: encryptSecret(token), accounts, selectedId, report: selectedId ? old?.report ?? null : null } } } });
}
async function scoped(db: Db, ctx: AccessContext) {
 ensure(isManager(ctx)); const integration = await db.integration.findFirst({ where: { orgId: ctx.orgId, kind: "META" } }); const config = readMetaAds(integration?.config);
 if (!integration || !config) throw invalid("Reconnect Facebook and approve read-only ad access first."); return { integration, config };
}
export async function selectMetaAdAccount(db: Db, ctx: AccessContext, id: string, f: Fetch = fetch) {
 const { integration, config } = await scoped(db, ctx);
 if (!config.accounts.some(a => a.id === id)) throw invalid("Choose an account available to this Facebook connection.");
 const current = account.parse(await read(f, id, decryptSecret(config.tokenEnc), { fields: "id,name,currency,timezone_name" }));
 if (current.id !== id) throw invalid("Ad account does not match.");
 await db.integration.update({ where: { id: integration.id }, data: { config: { ...object(integration.config), metaAds: { ...config, selectedId: id, report: config.selectedId === id ? config.report : null } } } });
}
export async function syncMetaAdReport(db: Db, ctx: AccessContext, since: string, until: string, f: Fetch = fetch) {
 const { integration, config } = await scoped(db, ctx); z.iso.date().parse(since); z.iso.date().parse(until);
 if (since > until || Date.parse(until) - Date.parse(since) > 366 * 86400000) throw invalid("Choose a reporting period of up to one year.");
 if (!config.selectedId || !config.accounts.some(a => a.id === config.selectedId)) throw invalid("Choose an ad account first.");
 const rows = (await list<unknown>(f, `${config.selectedId}/insights`, decryptSecret(config.tokenEnc), { level: "ad", fields: "ad_id,ad_name,campaign_name,spend,impressions,clicks,date_start,date_stop", time_range: JSON.stringify({ since, until }) })).map(v => row.parse(v));
 const creatives = (await list<unknown>(f, `${config.selectedId}/ads`, decryptSecret(config.tokenEnc), { fields: "id,name,creative{id,thumbnail_url,image_url}" })).map(v => creative.parse(v));
 await db.integration.update({ where: { id: integration.id }, data: { config: { ...object(integration.config), metaAds: { ...config, report: { accountId: config.selectedId, since, until, syncedAt: new Date().toISOString(), rows, creatives } } } } });
}

/** First tracked Meta touch per prospect, not one count for every retry or form submission. */
export async function metaAdOutcomes(db: Db, ctx: AccessContext, config: unknown) {
 ensure(isManager(ctx)); const report = readMetaAds(config)?.report; if (!report) return {};
 const events = await db.intakeEvent.findMany({ where: { orgId: ctx.orgId, status: { in: ["CREATED", "MERGED"] }, leadId: { not: null } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { summary: true, leadId: true, createdAt: true, lead: { select: { stage: { select: { kind: true } } } } } });
 const seen = new Set<string>(); const counts: Record<string, { leads: number; enrolled: number }> = {};
 for (const event of events) {
  const attribution = object(object(event.summary).attribution); const id = attribution.adId;
  if (typeof id !== "string" || !/^\d+$/.test(id) || !["meta", "facebook", "instagram"].includes(String(attribution.utmSource).toLowerCase()) || !event.leadId || seen.has(event.leadId)) continue;
  seen.add(event.leadId);
  const day = event.createdAt.toISOString().slice(0, 10); if (day < report.since || day > report.until) continue;
  const count = counts[id] ??= { leads: 0, enrolled: 0 }; count.leads++; if (event.lead?.stage.kind === "WON") count.enrolled++;
 }
 return counts;
}
