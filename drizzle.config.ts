import "dotenv/config";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./db/schema.ts",
  out: "./db/migrations",
  // Generation works offline; runtime migrations validate via lib/env.ts.
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
});
