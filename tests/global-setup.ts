import "dotenv/config";
import { prepareDatabase } from "./db-admin";

export default async function setup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL is required");
  await prepareDatabase(url);
}
