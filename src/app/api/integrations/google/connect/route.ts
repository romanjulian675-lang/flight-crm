import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getAccessContext } from "@/lib/session";
import { connectFakeCalendar, GOOGLE_STATE_COOKIE, googleAuthUrl, googleConfig } from "@/modules/google-calendar";

/** Start "Connect Google Calendar" for the signed-in member, with a one-time state value. */
export async function GET() {
  const ctx = await getAccessContext();
  if (!ctx) redirect("/login");
  const c = googleConfig();
  if (c.fake) {
    await connectFakeCalendar(prisma, ctx);
    redirect("/settings?calendar=ok#calendar");
  }
  if (!c.configured) redirect("/settings?calendar=not_configured#calendar");
  const state = randomBytes(18).toString("base64url");
  (await cookies()).set(GOOGLE_STATE_COOKIE, `${state}.${ctx.membershipId}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/api/integrations/google",
    maxAge: 600,
  });
  redirect(googleAuthUrl(state, ctx.email));
}
