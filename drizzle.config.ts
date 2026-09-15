import { defineConfig } from "drizzle-kit";
import { config } from "dotenv";

config({ path: ".env", quiet: true });

/**
 * Migrations run as the OWNER role. The app role (`school_app`) must never be able
 * to alter the schema or to disable a policy (PROJECT_PLAN section 8).
 */
const url = process.env.DATABASE_OWNER_URL;
if (!url) {
  throw new Error("DATABASE_OWNER_URL is not set — copy .env.example to .env first.");
}

export default defineConfig({
  schema: "./src/shared/db/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url },
  casing: "snake_case",
  verbose: true,
  strict: true,
});
