import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { getAccessContext } from "@/lib/session";
import { connectGoogleCalendar, GOOGLE_STATE_COOKIE } from "@/modules/google-calendar";

/** Google sends the member back here after they approve (or decline) calendar access. */
export async function GET(req: Request) {
  const ctx = await getAccessContext();
  if (!ctx) redirect("/login");
  const p = new URL(req.url).searchParams;
  const jar = await cookies();
  const [state, membershipId] = (jar.get(GOOGLE_STATE_COOKIE)?.value ?? "").split(".");
  jar.set(GOOGLE_STATE_COOKIE, "", { path: "/api/integrations/google", maxAge: 0 });
  const code = p.get("code");
  if (!code || !state || p.get("state") !== state || membershipId !== ctx.membershipId) redirect("/settings?calendar=failed#calendar");

  let reason = "failed";
  try {
    await connectGoogleCalendar(prisma, ctx, code);
    reason = "ok";
  } catch (e) {
    console.error("[google-calendar] connect failed:", e instanceof Error ? e.message : e);
    if (e instanceof AppError && e.message === "calendarScopesMissing") reason = "scopes";
  }
  redirect(`/settings?calendar=${reason}#calendar`);
}
