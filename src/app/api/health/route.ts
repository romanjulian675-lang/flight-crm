import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Operational health check for the demo environment and deployment probes. */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json({ status: "ok", database: "ok" }, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ status: "error", database: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
