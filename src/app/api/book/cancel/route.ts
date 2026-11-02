import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { json, readBody } from "@/lib/http";
import { cancelBookingAsVisitor } from "@/modules/booking";
import { calendarProvider } from "@/modules/google-calendar";

/** Public: the visitor cancels their call with the signed link from the confirmation. */
export async function POST(req: Request) {
  const body = await readBody(req);
  const id = typeof body?.b === "string" ? body.b : "";
  const token = typeof body?.t === "string" ? body.t : "";
  try {
    await cancelBookingAsVisitor(prisma, id, token, calendarProvider(prisma));
    return json({ ok: true });
  } catch (e) {
    if (e instanceof AppError && (e.code === "NOT_FOUND" || e.code === "VALIDATION")) return json({ ok: false, error: "invalid" }, 400);
    console.error("[booking] visitor cancel failed:", e instanceof Error ? e.message : e);
    return json({ ok: false, error: "server_error" }, 500);
  }
}
