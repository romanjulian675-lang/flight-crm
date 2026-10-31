import { describe, expect, it } from "vitest";
import { databasePoolConfig } from "../../src/lib/database-config";

describe("hosted database connection configuration", () => {
  it("uses Prisma's documented pooled host for runtime without losing credentials or SSL parameters", () => {
    const config = databasePoolConfig("postgres://user:p%40ss@db.prisma.io:5432/postgres?sslmode=require", true);
    const runtime = new URL(config.connectionString);
    expect(runtime.hostname).toBe("pooled.db.prisma.io");
    expect(runtime.username).toBe("user");
    expect(runtime.password).toBe("p%40ss");
    expect(runtime.searchParams.get("sslmode")).toBe("require");
    expect(config.max).toBe(2);
    expect(config).not.toHaveProperty("options");
  });
  it("keeps direct local connections in UTC and avoids altering other hosts", () => {
    const config = databasePoolConfig("postgresql://local:local@localhost:5434/flightcrm_test");
    expect(new URL(config.connectionString).hostname).toBe("localhost");
    expect(config.options).toBe("-c timezone=UTC");
    expect(config.max).toBe(10);
    const neon = databasePoolConfig("postgres://user:pass@project-pooler.example.com/db?sslmode=require", true);
    expect(new URL(neon.connectionString).hostname).toBe("project-pooler.example.com");
    expect(neon).not.toHaveProperty("options");
  });
});
