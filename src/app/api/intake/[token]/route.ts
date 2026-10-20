import { prisma } from "@/lib/db";
import { CORS_HEADERS, json, readBody, safeRedirect } from "@/lib/http";
import { findByToken } from "@/modules/integrations";
import { ingest, RateLimitedError } from "@/modules/intake";

/**
 * Public lead intake for the website form and generic webhooks (Zapier, Make, any site).
 * POST JSON, urlencoded or multipart. The token in the URL identifies the school's integration.
 */
export async function POST(req: Request, { params }: RouteContext<"/api/intake/[token]">) {
  const { token } = await params;
  const integration = await findByToken(prisma, token);
  if (!integration || (integration.kind !== "WEB_FORM" && integration.kind !== "WEBHOOK")) return json({ ok: false, error: "not_found" }, 404);

  const body = await readBody(req);
  if (!body) return json({ ok: false, error: "bad_request" }, 400);

  const htmlForm = (req.headers.get("accept") ?? "").includes("text/html") && !(req.headers.get("content-type") ?? "").includes("json");
  const done = (status: number, payload: Record<string, unknown>) => {
    if (!htmlForm) return json(payload, status);
    // Plain HTML form post (no JavaScript): send the visitor back to a thank-you page.
    const to = safeRedirect(body._redirect) ?? new URL(`/embed/${token}?sent=${status < 300 ? 1 : 0}`, req.url).toString();
    return Response.redirect(to, 303);
  };

  // Honeypot: bots fill hidden fields. Pretend success so they don't retry.
  if (typeof body._hp === "string" && body._hp.trim()) return done(200, { ok: true });

  try {
    const res = await ingest(prisma, integration, body, { externalId: typeof body._id === "string" ? body._id.slice(0, 120) : null });
    if (res.status === "REJECTED") return done(422, { ok: false, error: res.error ?? "rejected" });
    if (res.status === "ERROR") return done(500, { ok: false, error: "server_error" });
    return done(200, { ok: true, status: res.status.toLowerCase() });
  } catch (e) {
    if (e instanceof RateLimitedError) return json({ ok: false, error: "rate_limited" }, 429, { "Retry-After": "60" });
    throw e;
  }
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
