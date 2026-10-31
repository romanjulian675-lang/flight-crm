import { z } from "zod";
import { prisma } from "@/lib/db";
import { json, readBody } from "@/lib/http";
import { readQuestionnaireConfig } from "@/lib/questionnaire";
import { findByToken } from "@/modules/integrations";
import { ingest, RateLimitedError } from "@/modules/intake";

const schema = z.object({ submissionId: z.uuid(), name: z.string().trim().min(1).max(160), email: z.email().max(254), phone: z.string().max(40).optional(), availability: z.string().trim().min(1).max(300), consent: z.literal("on") });
export async function POST(req: Request, { params }: RouteContext<"/api/discovery-request/[token]">) {
  const integration = await findByToken(prisma, (await params).token);
  if (!integration?.active || integration.kind !== "WEB_FORM" || !readQuestionnaireConfig(integration.config).enabled) return json({ ok: false }, 404);
  const raw = await readBody(req);
  if (raw?._hp) return json({ ok: true });
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return json({ ok: false }, 422);
  const d = parsed.data;
  try {
    const result = await ingest(prisma, integration, { name: d.name, email: d.email, phone: d.phone, program: "discovery", message: `Discovery flight requested. Preferred availability: ${d.availability}. Contact requested by the visitor. Staff must confirm pricing, aircraft, instructor and date/time; this is not a confirmed booking.` }, { externalId: `discovery/${d.submissionId}`, via: "Discovery flight request" });
    return json({ ok: !!result.leadId }, result.leadId ? 200 : 422);
  } catch (e) { return json({ ok: false }, e instanceof RateLimitedError ? 429 : 500); }
}
