import { prisma } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto";
import { findByToken } from "@/modules/integrations";
import { verifyMetaSignature } from "@/modules/meta";
import { handleWhatsAppWebhook, type WaWebhookBody } from "@/modules/whatsapp";

/** Each school's WhatsApp number has its own webhook URL (token = its integration token). */
async function accountFor(token: string) {
  const integration = await findByToken(prisma, token);
  if (!integration || integration.kind !== "WHATSAPP") return null;
  const acct = await prisma.whatsAppAccount.findUnique({ where: { integrationId: integration.id } });
  return acct ? { ...acct, integration } : null;
}

/** Meta's verification handshake when the webhook URL is saved in the app dashboard. */
export async function GET(req: Request, { params }: RouteContext<"/api/webhooks/whatsapp/[token]">) {
  const acct = await accountFor((await params).token);
  const p = new URL(req.url).searchParams;
  if (acct && p.get("hub.mode") === "subscribe" && p.get("hub.verify_token") === acct.verifyToken) {
    return new Response(p.get("hub.challenge") ?? "", { headers: { "Content-Type": "text/plain" } });
  }
  return new Response("Forbidden", { status: 403 });
}

/** Messages and delivery statuses, signed with the Meta app secret. */
export async function POST(req: Request, { params }: RouteContext<"/api/webhooks/whatsapp/[token]">) {
  const acct = await accountFor((await params).token);
  if (!acct || !acct.appSecretEnc || !acct.integration.active) return new Response("Not found", { status: 404 });
  const raw = await req.text();
  if (!verifyMetaSignature(raw, req.headers.get("x-hub-signature-256"), decryptSecret(acct.appSecretEnc))) {
    return new Response("Invalid signature", { status: 401 });
  }
  let body: WaWebhookBody;
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response("Bad request", { status: 400 });
  }
  try {
    await handleWhatsAppWebhook(prisma, acct, body);
  } catch (e) {
    // Meta retries on non-2xx; a retry is safe because message ids are unique.
    console.error("[whatsapp] webhook failed:", e instanceof Error ? e.message : e);
    return new Response("Error", { status: 500 });
  }
  return new Response("EVENT_RECEIVED");
}
