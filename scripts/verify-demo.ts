import "dotenv/config";
import { createPrisma } from "../src/lib/db";

const baseUrl = process.env.APP_URL ?? "http://localhost:3200";

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to verify the local demo in production.");

  let health: Response;
  try {
    health = await fetch(`${baseUrl.replace(/\/$/, "")}/api/health`);
  } catch {
    throw new Error(`Cannot reach ${baseUrl}/api/health. Start the app with \"npm run dev\" and try again.`);
  }
  const body = (await health.json()) as { status?: string; database?: string };
  if (!health.ok || body.status !== "ok" || body.database !== "ok") {
    throw new Error(`Health check failed (${health.status}): ${JSON.stringify(body)}`);
  }

  const db = createPrisma();
  try {
    const [organizations, leads, demoUsers] = await Promise.all([
      db.organization.count({ where: { name: { endsWith: "(demo)" } } }),
      db.lead.count({ where: { org: { name: { endsWith: "(demo)" } } } }),
      db.user.count({ where: { email: { endsWith: "@demo.local" } } }),
    ]);
    if (organizations !== 1 || leads === 0 || demoUsers < 4) {
      throw new Error(`Demo data incomplete: organizations=${organizations}, leads=${leads}, users=${demoUsers}`);
    }
    console.log(`[demo] ready: ${leads} leads, ${demoUsers} demo users, health ${health.status}`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(`[demo] verification failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
