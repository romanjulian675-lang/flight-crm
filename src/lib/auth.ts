import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { BRAND } from "@/lib/brand";
import { prisma } from "@/lib/db";

/**
 * Authentication via better-auth (maintained library; we do no password or session crypto ourselves).
 * - Email + password, database-backed sessions (revocable), httpOnly secure cookies.
 * - Sign-up is open: a new user either creates a school (/signup) or joins one through an invite.
 *   Account creation goes through our server actions, which create the membership in the same flow.
 */
export const auth = betterAuth({
  appName: BRAND.name,
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 10,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
  },
  advanced: {
    database: { generateId: "uuid" },
    useSecureCookies: process.env.NODE_ENV === "production",
  },
  plugins: [nextCookies()],
});
