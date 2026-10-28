import { enqueueMetaNotification, drainMetaJobs } from "@/modules/meta-jobs";
import { receiveSocialMessages } from "@/modules/social-messages";
import { prisma } from "@/lib/db";
import { metaConfig, verifyMetaSignature } from "@/modules/meta";

export const maxDuration = 30;

/** Meta's one-time verification handshake when the webhook is registered. */
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const { verifyToken } = metaConfig();
  if (p.get("hub.mode") === "subscribe" && verifyToken && p.get("hub.verify_token") === verifyToken) {
    return new Response(p.get("hub.challenge") ?? "", { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  return new Response("Forbidden", { status: 403 });
}

/** Lead notifications. Signed with the app secret; anything unsigned is refused. */
export async function POST(req: Request) {
  const raw = await req.text();
  if (Buffer.byteLength(raw) > 1_000_000) return new Response("Payload too large", { status: 413 });
  if (!metaConfig().configured || !verifyMetaSignature(raw, req.headers.get("x-hub-signature-256"))) {
    return new Response("Invalid signature", { status: 401 });
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response("Bad request", { status: 400 });
  }
  try {
    const entries = (body as { entry?: unknown })?.entry;
    if (Array.isArray(entries) && entries.some(e => e && typeof e === "object" && "messaging" in e)) {
      const messages = await receiveSocialMessages(prisma, body);
      if (messages.invalid) return new Response("Bad request", { status: 400 });
      if (messages.unavailable) return new Response("Messaging connection unavailable", { status: 503 });
    }
    const queued = await enqueueMetaNotification(prisma, body);
    if (queued.invalid) return new Response("Bad request", { status: 400 });
    // Best-effort immediate work, awaited within the function lifetime. Saved jobs survive a crash.
    // A protected scheduler drains delayed/remainder jobs independently of provider retries.
    if (queued.ids.length) await drainMetaJobs(prisma, { ids: queued.ids });
    if (queued.unknownPages) return new Response("Page connection unavailable", { status: 503 });
    return new Response("EVENT_RECEIVED", { status: 200 });
  } catch {
    // Never acknowledge an event we could not persist.
    return new Response("Could not accept event", { status: 503 });
  }
}
