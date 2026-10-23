/**
 * Local PostgreSQL without Docker, using the `embedded-postgres` package.
 * Data lives in ./.pgdata (git-ignored). Keeps running until Ctrl+C.
 *
 *   npm run db:local
 *
 * Creates the `flightcrm` and `flightcrm_test` databases on first start.
 */
import EmbeddedPostgres from "embedded-postgres";
import { existsSync } from "node:fs";
import path from "node:path";

const dataDir = path.resolve(process.cwd(), ".pgdata");
const port = Number(process.env.LOCAL_PG_PORT ?? 5434);

async function main() {
  const pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: "flightcrm",
    password: "flightcrm",
    port,
    persistent: true,
    // Keep the local cluster UTF-8 so Spanish text and playbook symbols can be stored.
    initdbFlags: ["--encoding=UTF8"],
    postgresFlags: ["-c", "timezone=UTC", "-c", "log_timezone=UTC"],
    onLog: () => {},
  });

  const fresh = !existsSync(path.join(dataDir, "PG_VERSION"));
  if (fresh) {
    console.log(`[db] initialising new cluster in ${dataDir}`);
    await pg.initialise();
  }
  await pg.start();
  for (const name of ["flightcrm", "flightcrm_test"]) {
    try {
      await pg.createDatabase(name);
      console.log(`[db] created database ${name}`);
    } catch {
      // already exists
    }
  }
  console.log(`[db] PostgreSQL ready on localhost:${port} (Ctrl+C to stop)`);

  const stop = async () => {
    console.log("\n[db] stopping...");
    await pg.stop();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  setInterval(() => {}, 1 << 30);
}

main().catch((err) => {
  console.error("[db] failed to start:", err);
  process.exit(1);
});
