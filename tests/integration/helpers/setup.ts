import { config } from "dotenv";

/**
 * Integration tests run against a real Postgres (PROJECT_PLAN section 13.2) and
 * connect as `school_app`, the role WITHOUT bypassrls — that is the whole point:
 * a test that passes here proves the RLS policy holds, not just the TypeScript.
 */
config({ path: ".env.test", quiet: true });
config({ path: ".env", quiet: true });

const required = ["DATABASE_TEST_URL", "DATABASE_TEST_OWNER_URL"] as const;

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(
      `${key} is not set. Copy .env.example to .env, then run: pnpm db:up` +
        " (integration tests need a running Postgres).",
    );
  }
}

// Cairo conversions are always explicit in the code; a local TZ here would hide bugs.
process.env.TZ = "UTC";
