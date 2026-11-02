import { prisma } from "@/lib/db";
import { json } from "@/lib/http";
import { findPublicPage, publicAvailability } from "@/modules/booking";
import { calendarProvider } from "@/modules/google-calendar";

/** Open times on a public booking page, grouped by day (no host information). */
export async function GET(req: Request, { params }: RouteContext<"/api/book/[slug]/slots">) {
  const { slug } = await params;
  const page = await findPublicPage(prisma, slug);
  if (!page) return json({ ok: false, error: "unavailable" }, 404);
  const lang = new URL(req.url).searchParams.get("lang") === "es" ? "es" : "en";
  const data = await publicAvailability(prisma, page, calendarProvider(prisma), lang);
  return json({ ok: true, ...data });
}
