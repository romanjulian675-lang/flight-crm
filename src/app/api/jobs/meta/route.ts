import { timingSafeEqual } from "node:crypto";
import { drainLeadAlerts } from "@/modules/lead-alerts";
import { prisma } from "@/lib/db";
import { drainMetaJobs } from "@/modules/meta-jobs";
import { drainProspectEmails } from "@/modules/questionnaire";
import { drainInstagramWelcomes } from "@/modules/instagram-welcome";

export const maxDuration = 60;

/** Vercel Cron (or another trusted scheduler), never a public drain endpoint. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const supplied = Buffer.from(req.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret ?? ""}`);
  if (!secret || supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    return new Response("Unauthorized", { status: 401 });
  }
  const result = await drainMetaJobs(prisma);
  const [alerts, prospectEmails] = await Promise.all([drainLeadAlerts(prisma), drainProspectEmails(prisma), drainInstagramWelcomes(prisma)]);
  return Response.json({ ...result, alerts, prospectEmails }, { headers: { "Cache-Control": "no-store" } });
}
