import { ZodError } from "zod";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { json, readBody } from "@/lib/http";
import { bookCall, SlotTakenError, type BookingInput } from "@/modules/booking";
import { calendarProvider } from "@/modules/google-calendar";
import { RateLimitedError } from "@/modules/intake";

/** Public: book a call on /book/<slug>. JSON body with the answers and the chosen start time. */
export async function POST(req: Request, { params }: RouteContext<"/api/book/[slug]">) {
  const { slug } = await params;
  const body = await readBody(req);
  if (!body) return json({ ok: false, error: "bad_request" }, 400);
  // Honeypot: bots fill hidden fields. Pretend success so they don't retry.
  if (typeof body._hp === "string" && body._hp.trim()) return json({ ok: true, booking: null });

  try {
    const res = await bookCall(prisma, slug, body as BookingInput, { provider: calendarProvider(prisma) });
    const cancelUrl = `/book/${slug}/cancel?b=${res.bookingId}&t=${res.cancelToken}`;
    return json({ ok: true, booking: { startAt: res.startAt, endAt: res.endAt, hostFirstName: res.hostFirstName, meetLink: res.meetLink, cancelUrl } });
  } catch (e) {
    if (e instanceof ZodError) return json({ ok: false, error: "invalid", fields: [...new Set(e.issues.map((i) => String(i.path[0] ?? i.message)))] }, 400);
    if (e instanceof SlotTakenError) return json({ ok: false, error: "slot_taken" }, 409);
    if (e instanceof RateLimitedError) return json({ ok: false, error: "rate_limited" }, 429, { "Retry-After": "60" });
    if (e instanceof AppError && e.code === "NOT_FOUND") return json({ ok: false, error: "unavailable" }, 404);
    if (e instanceof AppError && e.code === "PROVIDER") return json({ ok: false, error: "booking_failed" }, 502);
    console.error("[booking] failed:", e instanceof Error ? e.message : e);
    return json({ ok: false, error: "server_error" }, 500);
  }
}
