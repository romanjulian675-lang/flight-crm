import { describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/health/route";
import { prisma } from "../helpers";

describe("health endpoint", () => {
  it("reports the application and database as healthy", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "ok", database: "ok" });
  });

  it("returns service unavailable when the database check fails", async () => {
    const query = vi.spyOn(prisma, "$queryRaw").mockRejectedValueOnce(new Error("database unavailable"));

    try {
      const response = await GET();

      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toEqual({ status: "error", database: "unavailable" });
    } finally {
      query.mockRestore();
    }
  });
});
