import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { PrismaClient } from "@/generated/prisma/client";
import { databasePoolConfig } from "@/lib/database-config";

export type Db = PrismaClient;
export type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export function createPrisma(connectionString = process.env.DATABASE_URL): PrismaClient {
  if (!connectionString) throw new Error("DATABASE_URL is required");
  const pool = new pg.Pool(databasePoolConfig(connectionString, process.env.VERCEL === "1"));
  return new PrismaClient({ adapter: new PrismaPg(pool) });
}

export const prisma: PrismaClient = globalForPrisma.prisma ?? createPrisma();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
