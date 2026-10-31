import { after } from "next/server";
import { ZodError } from "zod";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { json, readBody } from "@/lib/http";
import { findByToken } from "@/modules/integrations";
import { submitQuestionnaire, drainProspectEmails } from "@/modules/questionnaire";

export const maxDuration = 60;
export async function POST(req: Request, { params }: RouteContext<"/api/questionnaire/[token]">) {
  const { token } = await params;
  const integration = await findByToken(prisma, token);
  if (!integration) return json({ ok: false, error: "This questionnaire is unavailable." }, 404);
  const body = await readBody(req);
  if (!body) return json({ ok: false, error: "Invalid form. Please try again." }, 400);
  if (body._hp) return json({ ok: true, emailQueued: false });
  try {
    const result = await submitQuestionnaire(prisma, integration, body);
    after(async () => { await drainProspectEmails(prisma); });
    return json(result);
  } catch (e) {
    if (e instanceof ZodError) return json({ ok: false, error: "Please complete the required fields, use a valid email and confirm the contact request." }, 422);
    if (e instanceof AppError) return json({ ok: false, error: e.message }, e.httpStatus);
    return json({ ok: false, error: "We couldn't save your inquiry. Please try again." }, 500);
  }
}
