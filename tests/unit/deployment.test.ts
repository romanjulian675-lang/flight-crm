import { describe, expect, it } from "vitest";
import { deploymentSteps } from "../../scripts/build-vercel";

const production = {
  VERCEL_ENV: "production", DATABASE_URL: "postgresql://user:example@db.example.com/crm",
  APP_URL: "https://crm.example.com", BETTER_AUTH_URL: "https://crm.example.com",
  BETTER_AUTH_SECRET: "a".repeat(32), CRON_SECRET: "b".repeat(32), TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString("base64"),
};
describe("Vercel deployment", () => {
  it("migrates only production and never automatically migrates previews/local builds", () => {
    expect(deploymentSteps(production)).toEqual(["migrate", "build"]);
    expect(deploymentSteps({ ...production, VERCEL_ENV: "preview" })).toEqual(["build"]);
    expect(deploymentSteps({})).toEqual(["build"]);
  });
  it("fails before migration when production configuration is missing or unsafe", () => {
    for (const name of ["DATABASE_URL", "APP_URL", "BETTER_AUTH_URL", "BETTER_AUTH_SECRET", "TOKEN_ENCRYPTION_KEY", "CRON_SECRET"]) {
      expect(() => deploymentSteps({ ...production, [name]: "" })).toThrow(/Missing production/);
    }
    expect(() => deploymentSteps({ ...production, DATABASE_URL: "postgresql://user:password@localhost/crm" })).toThrow(/hosted PostgreSQL/);
    expect(() => deploymentSteps({ ...production, BETTER_AUTH_URL: "https://wrong.example.com" })).toThrow(/HTTPS origin/);
    expect(() => deploymentSteps({ ...production, CRON_SECRET: "weak" })).toThrow(/strong/);
    expect(() => deploymentSteps({ ...production, TOKEN_ENCRYPTION_KEY: "bad" })).toThrow(/strong/);
  });
});
