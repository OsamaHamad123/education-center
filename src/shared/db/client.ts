import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/shared/config/env";
import * as schema from "./schema";

/**
 * The application's database handle. It connects as `school_app`, the role WITHOUT
 * bypassrls — so every query here is subject to the policies in the RLS migration.
 *
 * Migrations and the seed use `DATABASE_OWNER_URL` instead; they never come through
 * this module.
 */
const connection = postgres(env.DATABASE_URL, {
  max: 10,
  // Cairo is the only calendar this system reasons in (shared/lib/time.ts).
  connection: { timezone: "Africa/Cairo" },
  onnotice: () => {},
});

export const db = drizzle(connection, { schema, casing: "snake_case" });

export type Database = typeof db;

/** A transaction handle — what every repository function actually receives. */
export type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

export { schema };
