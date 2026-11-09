import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { makeSchool, prisma, resetDb } from "../helpers";
import { connectMetaAds, readMetaAds, selectMetaAdAccount, syncMetaAdReport, metaAdOutcomes } from "@/modules/meta-ads";
import { metaLoginUrl } from "@/modules/meta";
import { decryptSecret } from "@/lib/crypto";
import { ingest } from "@/modules/intake";
beforeAll(() => { process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64"); });
beforeEach(resetDb);
const account = { id: "act_123", name: "School", currency: "USD" };
async function fixture() {
 const school = await makeSchool();
 const integration = await prisma.integration.create({ data: { orgId: school.org.id, kind: "META", name: "Meta", token: crypto.randomUUID(), config: { existing: true } } });
 return { ...school, integration };
}
const f: typeof fetch = async (url, init) => {
 expect(init?.headers).toEqual({ Authorization: "Bearer user-secret" }); expect(String(url)).not.toContain("user-secret");
 const u = new URL(String(url));
 if (u.pathname.endsWith("me/permissions")) return Response.json({ data: [{ permission: "ads_read", status: "granted" }] });
 if (u.pathname.endsWith("me/adaccounts")) return Response.json({ data: [account] });
 if (u.pathname.endsWith("/act_123")) return Response.json(account);
 if (u.pathname.endsWith("/insights")) return Response.json({ data: [{ ad_id: "987", ad_name: "Photo 1", campaign_name: "Flight", spend: "25.00", clicks: "10", impressions: "100", date_start: "2026-11-01", date_stop: "2026-11-14" }] });
 if (u.pathname.endsWith("/ads")) return Response.json({ data: [{ id: "987", name: "Photo 1", creative: { id: "9", image_url: "https://example.com/photo.jpg" } }] });
 throw new Error("Unexpected endpoint");
};
describe("Meta read-only reporting", () => {
 it("requests ads_read without ads_management", () => { const scope = new URL(metaLoginUrl("state")).searchParams.get("scope"); expect(scope).toContain("ads_read"); expect(scope).not.toContain("ads_management"); });
 it("encrypts the user token, preserves config and requires explicit account selection", async () => {
  const s = await fixture(); await connectMetaAds(prisma, s.org.id, s.integration.id, "user-secret", f);
  const i = await prisma.integration.findUniqueOrThrow({ where: { id: s.integration.id } }); const config = readMetaAds(i.config)!;
  expect(i.config).toHaveProperty("existing", true); expect(config.selectedId).toBeNull(); expect(config.tokenEnc).not.toContain("user-secret"); expect(decryptSecret(config.tokenEnc)).toBe("user-secret");
  await expect(syncMetaAdReport(prisma, s.owner, "2026-11-01", "2026-11-14", f)).rejects.toThrow("Choose an ad account");
  await expect(selectMetaAdAccount(prisma, s.owner, "act_999", f)).rejects.toThrow("Choose an account");
  await selectMetaAdAccount(prisma, s.owner, account.id, f); await syncMetaAdReport(prisma, s.owner, "2026-11-01", "2026-11-14", f);
  const saved = readMetaAds((await prisma.integration.findUniqueOrThrow({ where: { id: i.id } })).config)!;
  expect(saved.report?.rows[0].spend).toBe("25.00"); expect(saved.report?.creatives[0].id).toBe("987");
  const other = await makeSchool("Other"); await expect(selectMetaAdAccount(prisma, other.owner, account.id, f)).rejects.toThrow("Reconnect");
  await expect(selectMetaAdAccount(prisma, { ...s.owner, role: "AGENT" }, account.id, f)).rejects.toThrow("access");
 });
 it("clears reporting when permission is declined, without deleting lead integration", async () => {
  const s = await fixture(); await connectMetaAds(prisma, s.org.id, s.integration.id, "user-secret", f);
  await connectMetaAds(prisma, s.org.id, s.integration.id, "user-secret", async () => Response.json({ data: [] }));
  const i = await prisma.integration.findUniqueOrThrow({ where: { id: s.integration.id } }); expect(readMetaAds(i.config)).toBeNull(); expect(i.config).toHaveProperty("existing", true);
 });
 it("follows safe cursors, never provider next URLs, and does not save partial results", async () => {
  const s = await fixture(); let calls = 0;
  await connectMetaAds(prisma, s.org.id, s.integration.id, "user-secret", async (url, init) => {
   if (!String(url).includes("me/adaccounts")) return f(url, init);
   expect(String(url)).not.toContain("evil.test"); calls++;
   return Response.json(calls === 1 ? { data: [account], paging: { next: "https://evil.test/token", cursors: { after: "next-page" } } } : { data: [{ ...account, id: "act_456" }] });
  });
  const i = await prisma.integration.findUniqueOrThrow({ where: { id: s.integration.id } }); expect(readMetaAds(i.config)?.accounts).toHaveLength(2);
  await selectMetaAdAccount(prisma, s.owner, account.id, f);
  await expect(syncMetaAdReport(prisma, s.owner, "2026-11-14", "2026-11-01", f)).rejects.toThrow("period");
  await expect(syncMetaAdReport(prisma, s.owner, "2026-11-01", "2026-11-14", async () => Response.json({ error: { message: "secret" } }, { status: 403 }))).rejects.toThrow("access is unavailable");
  expect(readMetaAds((await prisma.integration.findUniqueOrThrow({ where: { id: i.id } })).config)?.report).toBeNull();
 });
 it("counts a prospect once across merged submissions and excludes untracked history", async () => {
  const s = await fixture(); await connectMetaAds(prisma, s.org.id, s.integration.id, "user-secret", f); await selectMetaAdAccount(prisma, s.owner, account.id, f);
  await syncMetaAdReport(prisma, s.owner, "2026-11-01", "2026-11-14", f);
  const raw = { first_name: "Pilot", email: "pilot@example.com", utm_source: "meta", utm_content: "987" };
  await ingest(prisma, s.integration, raw, { externalId: "one", now: new Date("2026-11-09T12:00:00Z") });
  await ingest(prisma, s.integration, raw, { externalId: "two", now: new Date("2026-11-09T12:00:01Z") });
  const i = await prisma.integration.findUniqueOrThrow({ where: { id: s.integration.id } }); expect(await metaAdOutcomes(prisma, s.owner, i.config)).toEqual({ "987": { leads: 1, booked: null, enrolled: 0 } });
  const won = await prisma.pipelineStage.findFirstOrThrow({ where: { orgId: s.org.id, kind: "WON" } });
  await prisma.lead.updateMany({ where: { orgId: s.org.id }, data: { stageId: won.id } });
  await selectMetaAdAccount(prisma, s.owner, account.id, f, won.id);
  const mapped = await prisma.integration.findUniqueOrThrow({ where: { id: i.id } });
  expect(await metaAdOutcomes(prisma, s.owner, mapped.config)).toEqual({ "987": { leads: 1, booked: 1, enrolled: 1 } });
 });
 it("does not overwrite a connection changed while a report is downloading", async () => {
  const s = await fixture(); await connectMetaAds(prisma, s.org.id, s.integration.id, "user-secret", f); await selectMetaAdAccount(prisma, s.owner, account.id, f);
  const won = await prisma.pipelineStage.findFirstOrThrow({ where: { orgId: s.org.id, kind: "WON" } });
  await expect(syncMetaAdReport(prisma, s.owner, "2026-11-01", "2026-11-14", async (url, init) => {
   if (String(url).includes("/insights?")) await selectMetaAdAccount(prisma, s.owner, account.id, f, won.id);
   return f(url, init);
  })).rejects.toThrow("connection changed");
  const saved = readMetaAds((await prisma.integration.findUniqueOrThrow({ where: { id: s.integration.id } })).config)!;
  expect(saved.bookedStageId).toBe(won.id); expect(saved.report).toBeNull();
 });

});
