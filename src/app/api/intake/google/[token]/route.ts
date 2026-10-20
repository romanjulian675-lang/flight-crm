import { prisma } from "@/lib/db";
import { json, readBody } from "@/lib/http";
import { handleGoogleLead, type GoogleLead } from "@/modules/google-ads";
import { findByToken } from "@/modules/integrations";
import { RateLimitedError } from "@/modules/intake";

/** Google Ads lead form webhook. Google sends the key we generated; a wrong key is refused. */
export async function POST(req: Request, { params }: RouteContext<"/api/intake/google/[token]">) {
  const { token } = await params;
  const integration = await findByToken(prisma, token);
  if (!integration || integration.kind !== "GOOGLE_ADS") return json({ error: "not_found" }, 404);
  const body = await readBody(req);
  if (!body) return json({ error: "bad_request" }, 400);
  try {
    const res = await handleGoogleLead(prisma, integration, body as GoogleLead);
    if (res === "BAD_KEY") return json({ error: "invalid_key" }, 403);
    // Google retries on non-2xx; only a server error is worth a retry.
    return json({ status: res.status.toLowerCase() }, res.status === "ERROR" ? 500 : 200);
  } catch (e) {
    if (e instanceof RateLimitedError) return json({ error: "rate_limited" }, 429);
    throw e;
  }
}
