import { randomUUID } from "node:crypto";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { eq } from "drizzle-orm";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "@/shared/db/schema";
import { hashPassword } from "better-auth/crypto";

/**
 * Creates the first super admin on a fresh deployment (PROJECT_PLAN Phase 10).
 *
 * `pnpm create-super-admin` — it prompts, it does not take the password as an
 * argument, because an argument ends up in the shell history and in `ps`.
 *
 * It runs as the OWNER role: `user` is subject to RLS, and there is no session yet to
 * satisfy a policy with. That is also why this is a one-off script rather than a
 * screen — the first account cannot be created from inside an app that requires an
 * account to reach.
 */

const MIN_PASSWORD = 12;

async function main(): Promise<void> {
  const url = process.env.DATABASE_OWNER_URL;
  if (!url) {
    console.error("DATABASE_OWNER_URL is not set. Migrations and this script use the owner role.");
    process.exit(1);
  }

  const rl = createInterface({ input: stdin, output: stdout });
  try {
    const name = (await rl.question("الاسم المعروض / Display name: ")).trim();
    const username = (await rl.question("اسم المستخدم / Username: ")).trim().toLowerCase();
    const password = (await rl.question("كلمة المرور / Password: ")).trim();

    if (!name || !username) {
      console.error("Name and username are both required.");
      process.exit(1);
    }
    if (!/^[a-z0-9_.]{3,32}$/.test(username)) {
      console.error("Username must be 3–32 characters of a–z, 0–9, underscore or dot.");
      process.exit(1);
    }
    if (password.length < MIN_PASSWORD) {
      console.error(`Password must be at least ${MIN_PASSWORD} characters.`);
      process.exit(1);
    }

    const client = postgres(url, { max: 1, onnotice: () => {} });
    const db = drizzle(client, { schema, casing: "snake_case" });

    try {
      const [existing] = await db
        .select({ id: schema.user.id })
        .from(schema.user)
        .where(eq(schema.user.username, username))
        .limit(1);

      if (existing) {
        console.error(`A user named "${username}" already exists. Nothing was changed.`);
        process.exit(1);
      }

      const id = `usr_${randomUUID()}`;
      await db.insert(schema.user).values({
        id,
        name,
        // Email sign-in is disabled; Better Auth still requires the column.
        email: `${username}@admins.local`,
        emailVerified: true,
        username,
        displayUsername: username,
        role: "super_admin",
        // A super admin belongs to no branch: they switch between all of them.
        branchId: null,
        teacherId: null,
        // They chose this password themselves, so there is nothing to force a change of.
        mustChangePassword: false,
      });

      await db.insert(schema.account).values({
        id: `acc_${id}`,
        accountId: id,
        providerId: "credential",
        userId: id,
        password: await hashPassword(password),
      });

      console.log(`\nCreated super admin "${username}". Sign in at /login.`);
    } finally {
      await client.end();
    }
  } finally {
    rl.close();
  }
}

await main();
