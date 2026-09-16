import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

/**
 * Fail at boot, not at the first request: a missing DATABASE_URL should stop the
 * process, never surface as a 500 to a branch admin marking attendance.
 */
export const env = createEnv({
  server: {
    /** Application role (`school_app`) — NOBYPASSRLS. Everything the app does uses this. */
    DATABASE_URL: z.string().url(),
    /** Owner role (`school_owner`) — migrations and seeds only. */
    DATABASE_OWNER_URL: z.string().url(),

    BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET must be at least 32 characters"),
    BETTER_AUTH_URL: z.string().url(),

    /** Salt for hashing visitor IPs in `lookup_attempts` — we never store a raw IP. */
    LOOKUP_IP_SALT: z.string().min(16),
    /**
     * Salts the parent's phone in `portal_sessions` and in the portal's SQL functions.
     * Separate from LOOKUP_IP_SALT so that rotating one does not invalidate the other,
     * and so a leak of either does not link a session to a lookup.
     */
    PORTAL_PHONE_SALT: z.string().min(16),

    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  },

  client: {},

  /** Next.js only inlines what is listed here, so server vars stay server-side. */
  experimental__runtimeEnv: {},

  emptyStringAsUndefined: true,
  /** Lets `next build` and `pnpm lint` run in CI without production secrets. */
  skipValidation: process.env.SKIP_ENV_VALIDATION === "1",
});
