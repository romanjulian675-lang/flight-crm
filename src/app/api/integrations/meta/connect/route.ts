import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getAccessContext } from "@/lib/session";
import { canManageIntegrations } from "@/modules/integrations";
import { META_STATE_COOKIE, metaConfig, metaLoginUrl } from "@/modules/meta";


/** Start "Connect Facebook": send the manager to Meta's login with a one-time state value. */
export async function GET() {
  const ctx = await getAccessContext();
  if (!ctx) redirect("/login");
  if (!canManageIntegrations(ctx)) redirect("/integrations");
  if (!metaConfig().configured) redirect("/integrations?meta=not_configured");
  const state = randomBytes(18).toString("base64url");
  (await cookies()).set(META_STATE_COOKIE, `${state}.${ctx.orgId}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/api/integrations/meta",
    maxAge: 600,
  });
  redirect(metaLoginUrl(state));
}
