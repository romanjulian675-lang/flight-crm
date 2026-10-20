import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { PrismaClient } from "@/generated/prisma/client";

export type Db = PrismaClient;
export type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export function createPrisma(connectionString = process.env.DATABASE_URL): PrismaClient {
  if (!connectionString) throw new Error("DATABASE_URL is required");
  // Timestamps are UTC throughout. A non-UTC server default shifts timestamptz values written by the
  // driver (found with embedded Postgres inheriting the OS timezone), so force UTC per session.
  // Connection poolers (e.g. Neon "-pooler" hosts) may reject the startup `options` parameter; those
  // hosted databases run in UTC already, so the option is only sent to direct connections.
  const pooled = /-pooler\./.test(connectionString);
  const pool = new pg.Pool({ connectionString, ...(pooled ? {} : { options: "-c timezone=UTC" }) });
  return new PrismaClient({ adapter: new PrismaPg(pool) });
}

export const prisma: PrismaClient = globalForPrisma.prisma ?? createPrisma();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
