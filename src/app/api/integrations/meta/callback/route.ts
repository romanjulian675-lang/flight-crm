import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getAccessContext } from "@/lib/session";
import { canManageIntegrations } from "@/modules/integrations";
import { connectMetaPages, META_STATE_COOKIE } from "@/modules/meta";

/** Meta sends the manager back here after they approve. */
export async function GET(req: Request) {
  const ctx = await getAccessContext();
  if (!ctx) redirect("/login");
  const p = new URL(req.url).searchParams;
  const jar = await cookies();
  const [state, orgId, mode] = (jar.get(META_STATE_COOKIE)?.value ?? "").split(".");
  jar.set(META_STATE_COOKIE, "", { path: "/api/integrations/meta", maxAge: 0 });
  const code = p.get("code");
  if (!code || !state || p.get("state") !== state || orgId !== ctx.orgId || !canManageIntegrations(ctx)) redirect("/integrations?meta=failed");

  let ok = 0;
  try {
    const results = await connectMetaPages(prisma, ctx.orgId, code, undefined, mode === "messages");
    ok = results.filter((r) => r.ok).length;
  } catch (e) {
    console.error("[meta] connect failed:", e instanceof Error ? e.message : e);
    redirect("/integrations?meta=failed");
  }
  redirect(`/integrations?meta=ok&n=${ok}`);
}
