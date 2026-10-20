import { prisma } from "@/lib/db";
import { handleMetaWebhook, metaConfig, verifyMetaSignature } from "@/modules/meta";

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
  if (!metaConfig().configured || !verifyMetaSignature(raw, req.headers.get("x-hub-signature-256"))) {
    return new Response("Invalid signature", { status: 401 });
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response("Bad request", { status: 400 });
  }
  await handleMetaWebhook(prisma, body as Parameters<typeof handleMetaWebhook>[1]);
  return new Response("EVENT_RECEIVED", { status: 200 });
}
