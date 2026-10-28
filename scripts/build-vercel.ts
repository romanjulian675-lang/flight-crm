import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

/** Only a production deployment may migrate its configured database automatically. */
export function deploymentSteps(env: Record<string, string | undefined>) {
  if (env.VERCEL_ENV !== "production") return ["build"] as const;
  const required = ["DATABASE_URL", "BETTER_AUTH_SECRET", "BETTER_AUTH_URL", "APP_URL", "TOKEN_ENCRYPTION_KEY", "CRON_SECRET"];
  for (const name of required) if (!env[name]) throw new Error(`Missing production variable: ${name}`);
  const database = new URL(env.DATABASE_URL!);
  if (!["postgres:", "postgresql:"].includes(database.protocol) || ["localhost", "127.0.0.1", "::1", "[::1]"].includes(database.hostname)) {
    throw new Error("Production requires a hosted PostgreSQL database.");
  }
  const app = new URL(env.APP_URL!);
  const auth = new URL(env.BETTER_AUTH_URL!);
  if (app.protocol !== "https:" || app.origin !== auth.origin) throw new Error("Production app and authentication URLs must share an HTTPS origin.");
  if (env.BETTER_AUTH_SECRET!.length < 32 || env.CRON_SECRET!.length < 32 || Buffer.from(env.TOKEN_ENCRYPTION_KEY!, "base64").length !== 32) {
    throw new Error("Production secrets must be strong and the encryption key must decode to 32 bytes.");
  }
  return ["migrate", "build"] as const;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  for (const step of deploymentSteps(process.env)) {
    const script = step === "migrate" ? "node_modules/prisma/build/index.js" : "node_modules/next/dist/bin/next";
    const args = step === "migrate" ? ["migrate", "deploy"] : ["build"];
    execFileSync(process.execPath, [script, ...args], { stdio: "inherit", env: process.env });
  }
}
