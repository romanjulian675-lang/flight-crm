import "dotenv/config";

// Every test process talks to the dedicated test database, never the development one.
const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error("TEST_DATABASE_URL is required to run tests (see .env.example).");
if (url === process.env.DATABASE_URL) throw new Error("TEST_DATABASE_URL must differ from DATABASE_URL: tests wipe it.");
process.env.DATABASE_URL = url;
