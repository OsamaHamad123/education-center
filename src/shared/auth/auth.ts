import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { username } from "better-auth/plugins/username";
import { env } from "@/shared/config/env";
import { db } from "@/shared/db/client";
import { account, session, user, verification } from "@/shared/db/schema";
import { LOGIN_LIMITS } from "@/shared/config/constants";
import { recordLogin } from "./record-login";

/**
 * PROJECT_PLAN section 9.
 *
 * Nobody signs up here: a super admin creates admin accounts, and teacher accounts are
 * created with the teacher (Phase 5). Email/password is the underlying credential
 * provider because the username plugin builds on it, but no email is ever sent and no
 * email field is shown — people sign in with a username, or with their phone number
 * if they are a teacher.
 */
export const auth = betterAuth({
  appName: "education-center",
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,

  database: drizzleAdapter(db, {
    provider: "pg",
    schema: { user, session, account, verification },
  }),

  emailAndPassword: {
    enabled: true,
    // Accounts are provisioned by admins. A public sign-up route would be a way in.
    disableSignUp: true,
    requireEmailVerification: false,
    // Teachers sign in with a 6-digit access code (section 9), so the floor is 6.
    minPasswordLength: 6,
    maxPasswordLength: 128,
  },

  user: {
    additionalFields: {
      role: { type: "string", required: true, input: false },
      branchId: { type: "string", required: false, input: false },
      teacherId: { type: "string", required: false, input: false },
      isActive: { type: "boolean", required: false, defaultValue: true, input: false },
      mustChangePassword: { type: "boolean", required: false, defaultValue: false, input: false },
    },
  },

  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // rolling: refreshed at most once a day
  },

  /**
   * Brute-force protection (section 9), with one correction to the spec.
   *
   * The spec asks for "lockout after 5 failed attempts", but Better Auth's limiter
   * counts every REQUEST to an endpoint, successful or not. Configuring 5 per 15
   * minutes would lock out a whole branch office the moment its fifth admin signed
   * in that quarter hour — they share one public IP. So this is a deliberate
   * per-IP request budget instead: still far too slow to brute-force a password,
   * without turning a busy morning into an outage. Per-ACCOUNT failure lockout is
   * tracked in docs/PROGRESS.md.
   */
  rateLimit: {
    enabled: process.env.DISABLE_RATE_LIMIT !== "1",
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/username": { window: LOGIN_LIMITS.windowMinutes * 60, max: LOGIN_LIMITS.maxAttemptsPerIp },
      "/sign-in/email": { window: LOGIN_LIMITS.windowMinutes * 60, max: LOGIN_LIMITS.maxAttemptsPerIp },
    },
  },

  advanced: {
    cookiePrefix: "ec",
    useSecureCookies: env.NODE_ENV === "production",
    defaultCookieAttributes: {
      httpOnly: true,
      sameSite: "lax",
    },
  },

  databaseHooks: {
    session: {
      create: {
        // Every successful sign-in creates a session, so this is the one place a
        // login can be audited without threading it through each form (task 7).
        after: async (created) => {
          await recordLogin(created.userId);
        },
      },
    },
  },

  // nextCookies() must be last: it flushes Set-Cookie from server actions.
  plugins: [
    username({
      minUsernameLength: 3,
      maxUsernameLength: 32,
      /**
       * The plugin's default validator is /^[a-zA-Z0-9_.]+$/, which rejects the "+"
       * in a teacher's username — and a teacher's username IS their normalized phone
       * (section 9). This accepts an admin-style username OR a normalized Egyptian
       * mobile, and nothing else.
       */
      usernameValidator: (value) => /^[a-zA-Z0-9_.]+$/.test(value) || /^\+201[0125][0-9]{8}$/.test(value),
    }),
    nextCookies(),
  ],
});

export type Auth = typeof auth;
