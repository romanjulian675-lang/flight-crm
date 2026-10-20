import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { loadAccessContext, type AccessContext } from "@/modules/access";

/** Which school the user is working in (they may belong to several). Validated on every request. */
export const ORG_COOKIE = "fl_org";

export const getSession = cache(async () => auth.api.getSession({ headers: await headers() }));

/** Resolve the caller from the session cookie. Returns null if not signed in or not in any school. */
export const getAccessContext = cache(async (): Promise<AccessContext | null> => {
  const session = await getSession();
  if (!session) return null;
  return loadAccessContext(prisma, session.user.id, (await cookies()).get(ORG_COOKIE)?.value);
});

/** For pages: send to /login when signed out, or to /welcome when signed in without a school. */
export async function requirePageAccess(): Promise<AccessContext> {
  const ctx = await getAccessContext();
  if (ctx) return ctx;
  redirect((await getSession()) ? "/welcome" : "/login");
}

/** For server actions and API routes: throw (401) when there is no session. */
export async function requireAccess(): Promise<AccessContext> {
  const ctx = await getAccessContext();
  if (!ctx) throw new AppError("UNAUTHENTICATED", "Please sign in.");
  return ctx;
}
