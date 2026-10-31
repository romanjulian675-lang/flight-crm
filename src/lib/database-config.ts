/** Keep Prisma's integration-managed URL direct for migrations, but pool application traffic. */
export function databasePoolConfig(connectionString: string, serverless = false) {
  const url = new URL(connectionString);
  if (url.hostname === "db.prisma.io") url.hostname = "pooled.db.prisma.io";
  const pooled = url.hostname === "pooled.db.prisma.io" || url.hostname.includes("-pooler.");
  return {
    connectionString: url.toString(),
    max: serverless ? 2 : 10,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 10_000,
    ...(pooled ? {} : { options: "-c timezone=UTC" }),
  };
}
