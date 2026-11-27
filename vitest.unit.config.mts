import { defineConfig } from "vitest/config";
import base from "./vitest.config.mjs";

// Pure service/unit tests don't require starting PostgreSQL or running migrations.
export default defineConfig({ ...base, test: { ...base.test, include: ["tests/unit/**/*.test.ts"], globalSetup: [], setupFiles: [] } });
