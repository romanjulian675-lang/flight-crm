"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { translateError } from "@/lib/action";
import { getI18n, LOCALE_COOKIE } from "@/lib/i18n";
import { ORG_COOKIE, getSession, requireAccess } from "@/lib/session";
import { acceptInvite, findInvite } from "@/modules/members";
import { createOrgInput, createOrganization } from "@/modules/orgs";

export type FormState = { error: string } | null;

const cookieOpts = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 365 };

const credentials = z.object({ email: z.email().trim().toLowerCase(), password: z.string().min(1) });

export async function signIn(_prev: FormState, fd: FormData): Promise<FormState> {
  const { t } = await getI18n();
  const parsed = credentials.safeParse({ email: fd.get("email"), password: fd.get("password") });
  if (!parsed.success) return { error: t.auth.invalid };
  try {
    await auth.api.signInEmail({ body: parsed.data, headers: await headers() });
  } catch {
    return { error: t.auth.invalid };
  }
  const next = fd.get("next");
  redirect(typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : "/");
}

const accountInput = z.object({
  name: z.string().trim().min(1, "nameRequired").max(100),
  email: z.email("emailInvalid").trim().toLowerCase(),
  password: z.string().min(10, "passwordShort").max(200),
});

/** Create the login. Returns an error message, or null on success (the user is now signed in). */
async function createAccount(fd: FormData): Promise<string | null> {
  const { t } = await getI18n();
  const parsed = accountInput.safeParse({ name: fd.get("name"), email: fd.get("email"), password: fd.get("password") });
  if (!parsed.success) return translateError(parsed.error, t);
  if (await prisma.user.findUnique({ where: { email: parsed.data.email } })) return t.auth.emailTaken;
  try {
    await auth.api.signUpEmail({ body: parsed.data, headers: await headers() });
    return null;
  } catch (err) {
    return translateError(err, t);
  }
}

/** Public sign-up: new owner + new school. */
export async function signUp(_prev: FormState, fd: FormData): Promise<FormState> {
  const { t, locale } = await getI18n();
  // Validate the school first so a bad school name doesn't leave a half-created account.
  const school = { name: String(fd.get("schoolName") ?? ""), timeZone: String(fd.get("timeZone") ?? ""), locale };
  const check = createOrgInput.safeParse(school);
  if (!check.success) return { error: translateError(check.error, t) };
  const err = await createAccount(fd);
  if (err) return { error: err };
  // A failure here leaves a signed-in user without a school; /welcome lets them retry.
  return createSchoolForCurrentUser(school);
}

/** Signed in but in no school yet (e.g. sign-up interrupted): create one. */
export async function createSchool(_prev: FormState, fd: FormData): Promise<FormState> {
  const { locale } = await getI18n();
  return createSchoolForCurrentUser({ name: String(fd.get("schoolName") ?? ""), timeZone: String(fd.get("timeZone") ?? ""), locale });
}

async function createSchoolForCurrentUser(input: { name: string; timeZone: string; locale: "en" | "es" }): Promise<FormState> {
  const { t } = await getI18n();
  const session = await getSession();
  if (!session) redirect("/login");
  let orgId: string;
  try {
    orgId = (await createOrganization(prisma, session.user.id, input)).id;
  } catch (e) {
    return { error: translateError(e, t) };
  }
  (await cookies()).set(ORG_COOKIE, orgId, cookieOpts);
  redirect("/");
}

/** Invite page, new person: create the account, then join. */
export async function signUpAndJoin(_prev: FormState, fd: FormData): Promise<FormState> {
  const { t } = await getI18n();
  const token = String(fd.get("token") ?? "");
  const invite = await findInvite(prisma, token);
  if (!invite) return { error: t.auth.inviteInvalid };
  fd.set("email", invite.email);
  const err = await createAccount(fd);
  if (err) return { error: err };
  return joinWithToken(token);
}

/** Invite page, already signed in. */
export async function joinSchool(_prev: FormState, fd: FormData): Promise<FormState> {
  return joinWithToken(String(fd.get("token") ?? ""));
}

async function joinWithToken(token: string): Promise<FormState> {
  const { t } = await getI18n();
  const session = await getSession();
  if (!session) redirect("/login");
  let orgId: string;
  try {
    orgId = await acceptInvite(prisma, session.user.id, token);
  } catch (e) {
    return { error: translateError(e, t) };
  }
  (await cookies()).set(ORG_COOKIE, orgId, cookieOpts);
  redirect("/");
}

export async function signOut() {
  await auth.api.signOut({ headers: await headers() }).catch(() => {});
  (await cookies()).delete(ORG_COOKIE);
  redirect("/login");
}

/** School switcher. The value is re-validated against memberships on every request. */
export async function switchSchool(orgId: string) {
  const ctx = await requireAccess();
  if (ctx.orgs.some((o) => o.orgId === orgId)) (await cookies()).set(ORG_COOKIE, orgId, cookieOpts);
  redirect("/");
}

export async function setLocale(locale: string) {
  if (locale !== "en" && locale !== "es") return;
  (await cookies()).set(LOCALE_COOKIE, locale, { ...cookieOpts, httpOnly: false });
  revalidatePath("/", "layout");
}
