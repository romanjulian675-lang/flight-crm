import { timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/db";
import { drainMetaJobs } from "@/modules/meta-jobs";

export const maxDuration = 30;

/** Vercel Cron (or another trusted scheduler), never a public drain endpoint. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const supplied = Buffer.from(req.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret ?? ""}`);
  if (!secret || supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    return new Response("Unauthorized", { status: 401 });
  }
  const result = await drainMetaJobs(prisma);
  return Response.json(result, { headers: { "Cache-Control": "no-store" } });
}
