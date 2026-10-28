import { createHmac } from "node:crypto";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { makeSchool, prisma, resetDb } from "../helpers";
import { createIntegration, sendTestLead } from "@/modules/integrations";
import { ingest, normalizeFields, RATE_LIMIT_PER_MINUTE } from "@/modules/intake";
import { handleGoogleLead } from "@/modules/google-ads";
import { connectMetaPages, handleMetaWebhook, verifyMetaSignature, type Fetch } from "@/modules/meta";
import { encryptSecret } from "@/lib/crypto";
import { getLead } from "@/modules/leads";
import { POST as intakePOST } from "@/app/api/intake/[token]/route";
import { POST as googlePOST } from "@/app/api/intake/google/[token]/route";
import { GET as metaGET, POST as metaPOST } from "@/app/api/webhooks/meta/route";

beforeAll(() => {
  process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  process.env.META_APP_ID = "app123";
  process.env.META_APP_SECRET = "shh-secret";
  process.env.META_VERIFY_TOKEN = "verify-me";
});
beforeEach(resetDb);

describe("normalizeFields", () => {
  it("understands common field names in English and Spanish", () => {
    const n = normalizeFields({
      "Full Name": "María José Pérez",
      "E-mail": "MJ@Example.com",
      telefono: "(407) 555-0100",
      interest: "Private Pilot License",
      mensaje: "¿Tienen clases los sábados?",
      utm_source: "instagram",
      "What is your budget?": "$15k",
      _hp: "",
    });
    expect(n).toMatchObject({
      firstName: "María",
      lastName: "José Pérez",
      email: "mj@example.com",
      phone: "14075550100",
      program: "PRIVATE",
      message: "¿Tienen clases los sábados?",
      utmSource: "instagram",
    });
    expect(n.extra).toEqual([["What is your budget?", "$15k"]]);
  });

  it("keeps bad emails/phones in the note instead of dropping them", () => {
    const n = normalizeFields({ first_name: "Al", email: "not-an-email", phone: "12" });
    expect(n.email).toBeNull();
    expect(n.phone).toBeNull();
    expect(n.invalid).toHaveLength(2);
  });

  it("maps programs and sources loosely", () => {
    expect(normalizeFields({ program: "I want to be an airline pilot" }).program).toBe("CAREER");
    expect(normalizeFields({ program: "IFR rating" }).program).toBe("INSTRUMENT");
    expect(normalizeFields({ program: "vuelo de descubrimiento" }).program).toBe("DISCOVERY");
    expect(normalizeFields({ source: "TikTok Lead Gen" }).source).toBe("TIKTOK");
  });
});

describe("ingest", () => {
  it("creates an assigned lead with a contact-now task, rotating between agents", async () => {
    const s = await makeSchool();
    const form = await createIntegration(prisma, s.owner, { kind: "WEB_FORM", name: "Website" });
    const a = await ingest(prisma, form, { name: "Ann One", email: "ann@x.com" });
    const b = await ingest(prisma, form, { name: "Bob Two", phone: "4075550001" });
    const c = await ingest(prisma, form, { name: "Cy Three", phone: "4075550002" });
    expect([a.status, b.status, c.status]).toEqual(["CREATED", "CREATED", "CREATED"]);
    const owners = await Promise.all([a, b, c].map(async (r) => (await prisma.lead.findUniqueOrThrow({ where: { id: r.leadId! } })).ownerId));
    expect(owners).toEqual([s.agent.membershipId, s.agent2.membershipId, s.agent.membershipId]);

    const lead = await getLead(prisma, s.owner, a.leadId!);
    expect(lead.source).toBe("WEBSITE");
    expect(lead.tasks).toHaveLength(1);
    expect(lead.tasks[0].assignee?.id).toBe(s.agent.membershipId);
    expect(lead.activities.map((x) => x.type).sort()).toEqual(["ASSIGNED", "CREATED"]);
  });

  it("merges a repeat submission into the existing lead (any integration)", async () => {
    const s = await makeSchool();
    const form = await createIntegration(prisma, s.owner, { kind: "WEB_FORM", name: "Website" });
    const hook = await createIntegration(prisma, s.owner, { kind: "WEBHOOK", name: "Zapier" });
    const first = await ingest(prisma, form, { first_name: "Dee", phone: "407 555 0003" });
    const again = await ingest(prisma, hook, { first_name: "Dee", phone: "+1 (407) 555-0003", message: "Still interested!" });
    expect(again).toMatchObject({ status: "MERGED", leadId: first.leadId });
    expect(await prisma.lead.count()).toBe(1);
    const lead = await getLead(prisma, s.owner, first.leadId!);
    expect(lead.activities.find((x) => x.type === "FORM_SUBMITTED")?.body).toContain("Still interested!");
  });

  it("ignores provider retries with the same external id", async () => {
    const s = await makeSchool();
    const hook = await createIntegration(prisma, s.owner, { kind: "WEBHOOK", name: "Zapier" });
    const one = await ingest(prisma, hook, { first_name: "Ed", email: "ed@x.com" }, { externalId: "abc" });
    const two = await ingest(prisma, hook, { first_name: "Ed", email: "ed@x.com" }, { externalId: "abc" });
    expect(two).toMatchObject({ status: "DUPLICATE", leadId: one.leadId });
    expect(await prisma.intakeEvent.count()).toBe(1);
  });

  it("respects a fixed owner, 'leave unassigned', inactive sources and empty submissions", async () => {
    const s = await makeSchool();
    const hook = await createIntegration(prisma, s.owner, { kind: "WEBHOOK", name: "Zapier" });
    await prisma.integration.update({ where: { id: hook.id }, data: { defaultOwnerId: s.manager.membershipId } });
    const fixed = await ingest(prisma, (await prisma.integration.findUniqueOrThrow({ where: { id: hook.id } }))!, { first_name: "F", email: "f@x.com" });
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: fixed.leadId! } })).ownerId).toBe(s.manager.membershipId);

    await prisma.organization.update({ where: { id: s.org.id }, data: { assignMode: "NONE" } });
    const form = await createIntegration(prisma, s.owner, { kind: "WEB_FORM", name: "Website" });
    const none = await ingest(prisma, form, { first_name: "G", email: "g@x.com" });
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: none.leadId! } })).ownerId).toBeNull();

    expect((await ingest(prisma, form, { message: "hello?" })).status).toBe("REJECTED");
    expect((await ingest(prisma, { ...form, active: false }, { first_name: "H", email: "h@x.com" })).status).toBe("REJECTED");
  });

  it("writes automatic task titles in the school's language", async () => {
    const s = await makeSchool();
    await prisma.organization.update({ where: { id: s.org.id }, data: { locale: "es" } });
    const form = await createIntegration(prisma, s.owner, { kind: "WEB_FORM", name: "Web" });
    const r = await ingest(prisma, form, { nombre: "Iván", correo: "ivan@x.com" });
    expect((await prisma.task.findFirstOrThrow({ where: { leadId: r.leadId! } })).title).toBe("Contactar nuevo prospecto");
  });

  it("rate-limits a flooded source", async () => {
    const s = await makeSchool();
    const hook = await createIntegration(prisma, s.owner, { kind: "WEBHOOK", name: "Zapier" });
    await prisma.intakeEvent.createMany({ data: Array.from({ length: RATE_LIMIT_PER_MINUTE }, () => ({ orgId: s.org.id, integrationId: hook.id, status: "REJECTED" as const })) });
    await expect(ingest(prisma, hook, { first_name: "Z", email: "z@x.com" })).rejects.toThrow(/Too many/);
  });

  it("test leads go through the real pipeline", async () => {
    const s = await makeSchool();
    const hook = await createIntegration(prisma, s.owner, { kind: "WEBHOOK", name: "Zapier" });
    expect((await sendTestLead(prisma, s.manager, hook.id)).status).toBe("CREATED");
    await expect(sendTestLead(prisma, s.agent, hook.id)).rejects.toThrow();
  });
});

describe("public intake endpoint", () => {
  const call = (token: string, body: string, headers: Record<string, string> = { "Content-Type": "application/json" }) =>
    intakePOST(new Request(`http://localhost/api/intake/${token}`, { method: "POST", headers, body }), { params: Promise.resolve({ token }) });

  it("accepts JSON and form posts, routes by token to the right school, allows CORS", async () => {
    const a = await makeSchool("Alpha");
    const b = await makeSchool("Bravo");
    const hookA = await createIntegration(prisma, a.owner, { kind: "WEBHOOK", name: "Zapier" });
    const formB = await createIntegration(prisma, b.owner, { kind: "WEB_FORM", name: "Website" });

    const r1 = await call(hookA.token, JSON.stringify({ first_name: "Jo", email: "jo@x.com", source: "tiktok" }));
    expect(r1.status).toBe(200);
    expect(r1.headers.get("access-control-allow-origin")).toBe("*");
    const r2 = await call(formB.token, "first_name=Kim&phone=4075550009", { "Content-Type": "application/x-www-form-urlencoded", Accept: "text/html" });
    expect(r2.status).toBe(303);
    expect(r2.headers.get("location")).toContain(`/embed/${formB.token}?sent=1`);

    expect(await prisma.lead.findFirst({ where: { orgId: a.org.id } })).toMatchObject({ firstName: "Jo", source: "TIKTOK" });
    expect(await prisma.lead.findFirst({ where: { orgId: b.org.id } })).toMatchObject({ firstName: "Kim", source: "WEBSITE" });
  });

  it("rejects unknown tokens, junk bodies and empty leads; swallows honeypot spam", async () => {
    const s = await makeSchool();
    const hook = await createIntegration(prisma, s.owner, { kind: "WEBHOOK", name: "Zapier" });
    expect((await call("x".repeat(32), "{}")).status).toBe(404);
    expect((await call(hook.token, "{not json")).status).toBe(400);
    expect((await call(hook.token, JSON.stringify({ message: "hi" }))).status).toBe(422);
    expect((await call(hook.token, JSON.stringify({ first_name: "Bot", email: "bot@x.com", _hp: "http://spam" }))).status).toBe(200);
    expect(await prisma.lead.count()).toBe(0);
  });

  it("does not accept generic posts on a Google Ads token", async () => {
    const s = await makeSchool();
    const g = await createIntegration(prisma, s.owner, { kind: "GOOGLE_ADS", name: "Google" });
    expect((await call(g.token, JSON.stringify({ first_name: "X", email: "x@x.com" }))).status).toBe(404);
  });
});

describe("Google Ads", () => {
  it("requires the generated key and maps Google's columns", async () => {
    const s = await makeSchool();
    const g = await createIntegration(prisma, s.owner, { kind: "GOOGLE_ADS", name: "Google" });
    const key = (g.config as { googleKey: string }).googleKey;
    const lead = {
      lead_id: "L1",
      google_key: key,
      campaign_id: 99,
      user_column_data: [
        { column_id: "FULL_NAME", string_value: "Lia Gomez" },
        { column_id: "PHONE_NUMBER", string_value: "+14075550111" },
        { column_id: "EMAIL", string_value: "lia@x.com" },
        { column_name: "Which program?", string_value: "Commercial" },
      ],
    };
    expect(await handleGoogleLead(prisma, g, { ...lead, google_key: "wrong" })).toBe("BAD_KEY");
    const res = await handleGoogleLead(prisma, g, lead);
    expect(res).toMatchObject({ status: "CREATED" });
    const saved = await prisma.lead.findFirstOrThrow({ where: { orgId: s.org.id } });
    expect(saved).toMatchObject({ firstName: "Lia", lastName: "Gomez", phone: "14075550111", source: "GOOGLE" });

    const resp = await googlePOST(
      new Request(`http://localhost/api/intake/google/${g.token}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(lead) }),
      { params: Promise.resolve({ token: g.token }) },
    );
    expect(resp.status).toBe(200);
    expect(await resp.json()).toEqual({ status: "duplicate" });
  });
});

describe("Meta lead ads", () => {
  const graphMock = (routes: Record<string, unknown>): Fetch =>
    (async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      const path = url.pathname.replace(/^\/v[\d.]+\//, "");
      const hit = Object.entries(routes).find(([k]) => path === k);
      return new Response(JSON.stringify(hit ? hit[1] : { error: { message: `no route ${path}` } }), { status: hit ? 200 : 400 });
    }) as Fetch;

  it("verifies signatures and the subscribe handshake", async () => {
    const body = JSON.stringify({ object: "page", entry: [] });
    const sig = "sha256=" + createHmac("sha256", "shh-secret").update(body).digest("hex");
    expect(verifyMetaSignature(body, sig)).toBe(true);
    expect(verifyMetaSignature(body + " ", sig)).toBe(false);
    expect(verifyMetaSignature(body, null)).toBe(false);

    const ok = await metaGET(new Request("http://localhost/api/webhooks/meta?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=42"));
    expect(await ok.text()).toBe("42");
    expect((await metaGET(new Request("http://localhost/api/webhooks/meta?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=42"))).status).toBe(403);
    const unsigned = await metaPOST(new Request("http://localhost/api/webhooks/meta", { method: "POST", body }));
    expect(unsigned.status).toBe(401);
    const signed = await metaPOST(new Request("http://localhost/api/webhooks/meta", { method: "POST", body, headers: { "x-hub-signature-256": sig } }));
    expect(signed.status).toBe(200);
  });

  it("connects pages (encrypted tokens) and refuses a page owned by another school", async () => {
    const a = await makeSchool("Alpha");
    const b = await makeSchool("Bravo");
    const f = graphMock({
      "oauth/access_token": { access_token: "user-token" },
      "me/accounts": { data: [{ id: "P1", name: "Alpha Aviation", access_token: "page-token-1" }] },
      "P1/subscribed_apps": { success: true },
    });
    expect(await connectMetaPages(prisma, a.org.id, "code", f)).toEqual([{ pageName: "Alpha Aviation", ok: true }]);
    const page = await prisma.metaPage.findUniqueOrThrow({ where: { pageId: "P1" } });
    expect(page.accessTokenEnc).not.toContain("page-token-1");
    expect(page.subscribed).toBe(true);
    expect((await connectMetaPages(prisma, b.org.id, "code", f))[0]).toMatchObject({ ok: false });
  });

  it("fetches each lead from the Graph API and files it under the right school and platform", async () => {
    const s = await makeSchool();
    const integration = await prisma.integration.create({ data: { orgId: s.org.id, kind: "META", name: "Meta", token: "t".repeat(32), defaultSource: "FACEBOOK" } });
    await prisma.metaPage.create({ data: { orgId: s.org.id, integrationId: integration.id, pageId: "P9", pageName: "Sunrise", accessTokenEnc: encryptSecret("pt"), subscribed: true } });
    const f = graphMock({
      LG1: { id: "LG1", platform: "ig", campaign_name: "Fall promo", field_data: [{ name: "full_name", values: ["Nina Ruiz"] }, { name: "phone_number", values: ["+14075550222"] }, { name: "when_do_you_want_to_start?", values: ["asap"] }] },
    });
    const body = { object: "page", entry: [{ id: "P9", changes: [{ field: "leadgen", value: { leadgen_id: "LG1", page_id: "P9" } }, { field: "leadgen", value: { leadgen_id: "LG404", page_id: "P9" } }, { field: "leadgen", value: { leadgen_id: "LGX", page_id: "UNKNOWN" } }] }] };
    const out = await handleMetaWebhook(prisma, body, f);
    expect(out).toEqual([
      { leadgenId: "LG1", status: "CREATED" },
      { leadgenId: "LG404", status: "ERROR" },
      { leadgenId: "LGX", status: "UNKNOWN_PAGE" },
    ]);
    const lead = await prisma.lead.findFirstOrThrow({ where: { orgId: s.org.id } });
    expect(lead).toMatchObject({ firstName: "Nina", lastName: "Ruiz", source: "INSTAGRAM" });
    const note = await prisma.activity.findFirstOrThrow({ where: { leadId: lead.id, type: "NOTE" } });
    expect(note.body).toContain("Fall promo");
    expect(note.body).toContain("asap");
    // Meta retries the same delivery: no second lead.
    expect((await handleMetaWebhook(prisma, body, f))[0].status).toBe("DUPLICATE");
  });
});


describe("campaign funnel attribution", () => {
  it("assigns tagged website inquiries to their originating channels and keeps video details", async () => {
    const { owner } = await makeSchool();
    const integration = await createIntegration(prisma, owner, { kind: "WEB_FORM", name: "Website inquiries" });
    for (const [source, expected] of [["instagram", "INSTAGRAM"], ["facebook", "FACEBOOK"], ["youtube", "YOUTUBE"]]) {
      const result = await ingest(prisma, integration, { name: "Test Visitor", email: `${source}@example.com`, utm_source: source, utm_medium: "social", utm_campaign: "course-launch", utm_content: "video-123" });
      expect(result.status).toBe("CREATED");
      const lead = await prisma.lead.findUniqueOrThrow({ where: { id: result.leadId! } });
      expect(lead).toMatchObject({ source: expected, utmSource: source, utmCampaign: "course-launch" });
      const activity = await prisma.activity.findFirst({ where: { leadId: lead.id, body: { contains: "video-123" } } });
      expect(activity?.body).toContain("utm_source: " + source);
    }
  });

  it("keeps provider and explicit sources authoritative, with website fallback for unknown tags", async () => {
    const { owner } = await makeSchool();
    const integration = await createIntegration(prisma, owner, { kind: "WEB_FORM", name: "Website inquiries" });
    for (const [i, fields, opts, expected] of [
      [0, { source: "referral", utm_source: "youtube" }, {}, "REFERRAL"],
      [1, { source: "referral", utm_source: "youtube" }, { source: "FACEBOOK" as const }, "FACEBOOK"],
      [2, { utm_source: "unrecognized-campaign" }, {}, "WEBSITE"],
    ] as const) {
      const result = await ingest(prisma, integration, { name: "Test Visitor", email: `precedence${i}@example.com`, ...fields }, opts);
      const lead = await prisma.lead.findUniqueOrThrow({ where: { id: result.leadId! } });
      expect(lead.source).toBe(expected);
    }
  });

  it("preserves repeat inquiry campaign details without replacing the contact's original source", async () => {
    const { owner } = await makeSchool();
    const integration = await createIntegration(prisma, owner, { kind: "WEB_FORM", name: "Website inquiries" });
    const first = await ingest(prisma, integration, { email: "repeat@example.com", utm_source: "instagram" });
    const repeat = await ingest(prisma, integration, { email: "repeat@example.com", utm_source: "youtube", utm_campaign: "ground-school", utm_content: "video-456" });
    expect(repeat.status).toBe("MERGED");
    expect(repeat.leadId).toBe(first.leadId);
    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: first.leadId! } });
    expect(lead.source).toBe("INSTAGRAM");
    const activity = await prisma.activity.findFirstOrThrow({ where: { leadId: lead.id, type: "FORM_SUBMITTED" } });
    expect(activity.body).toContain("utm_source: youtube");
    expect(activity.body).toContain("utm_campaign: ground-school");
    expect(activity.body).toContain("video-456");
  });
});
