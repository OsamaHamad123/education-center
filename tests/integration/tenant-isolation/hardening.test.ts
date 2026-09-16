import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { applyMigrations, appDb, closeConnections, ownerDb, resetDatabase } from "../helpers/db";
import { makeCenterSettings, makeStudent, makeTwoBranches } from "../helpers/factories";
import * as schema from "@/shared/db/schema";

/**
 * Phase 10 hardening (docs/SECURITY-REVIEW.md). One block per finding that has a
 * database side; the rest — headers, error logging, the Arabic pages — are covered by
 * e2e and by reading the code.
 */

let fx: Awaited<ReturnType<typeof makeTwoBranches>>;

beforeAll(async () => {
  await applyMigrations();
});

beforeEach(async () => {
  await resetDatabase();
  await makeCenterSettings();
  fx = await makeTwoBranches();
});

afterAll(async () => {
  await closeConnections();
});

describe("finding 1 — per-account lockout", () => {
  it("counts failures per USERNAME, so a distributed attack is throttled too", async () => {
    // Ten failures against one account, each notionally from a different address —
    // the table holds no address at all, which is the point.
    for (let attempt = 0; attempt < 10; attempt++) {
      await appDb.insert(schema.loginAttempts).values({ username: "admin_nsr" });
    }
    await appDb.insert(schema.loginAttempts).values({ username: "someone_else" });

    const [row] = await appDb
      .select({ failures: sql<number>`count(*)::int` })
      .from(schema.loginAttempts)
      .where(sql`username = 'admin_nsr' and created_at > now() - interval '15 minutes'`);

    expect(row?.failures).toBe(10);
  });

  it("forgets failures older than the window", async () => {
    await ownerDb.insert(schema.loginAttempts).values({
      username: "admin_nsr",
      createdAt: new Date(Date.now() - 20 * 60 * 1000),
    });

    const [row] = await appDb
      .select({ failures: sql<number>`count(*)::int` })
      .from(schema.loginAttempts)
      .where(sql`username = 'admin_nsr' and created_at > now() - interval '15 minutes'`);

    expect(row?.failures).toBe(0);
  });

  it("stores no password, no hash and no address", async () => {
    await appDb.insert(schema.loginAttempts).values({ username: "admin_nsr" });

    const columns = await ownerDb.execute(
      sql`select column_name from information_schema.columns where table_name = 'login_attempts'`,
    );
    const names = (columns as unknown as { column_name: string }[]).map((c) => c.column_name).sort();

    expect(names).toEqual(["created_at", "id", "username"]);
  });
});

describe("finding 4 — successful lookups are audited", () => {
  it("writes one audit row with a hashed ip, no user and no branch", async () => {
    await makeStudent(fx.branchA.id, fx.classA.id, {
      studentCode: "AAA-26-00777",
      fullName: "محمد شعبان الفقي",
      parentPhone: "+201012348001",
    });

    await appDb.execute(sql`select app_record_lookup_audit('AAA-26-00777', 'hashed-ip-value')`);

    const rows = await ownerDb.select().from(schema.auditLogs);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      action: "lookup",
      entity: "student.lookup",
      entityId: "AAA-26-00777",
      ip: "hashed-ip-value",
      // A parent belongs to no branch and is no user; inventing either would make
      // the log lie about who acted.
      branchId: null,
      userId: null,
    });
  });

  it("is the ONLY way an anonymous caller can write to the audit log", async () => {
    // The policy is `app_role() IS NOT NULL`, so a public endpoint cannot flood the
    // record an administrator relies on.
    await expect(
      appDb.insert(schema.auditLogs).values({ action: "lookup", entity: "forged" }),
    ).rejects.toThrow();

    expect(await ownerDb.select().from(schema.auditLogs)).toHaveLength(0);
  });
});

describe("finding 8 — the cross-branch report index", () => {
  it("exists and covers a date-range scan", async () => {
    const rows = await ownerDb.execute(
      sql`select indexname from pg_indexes where tablename = 'class_sessions'`,
    );
    const names = (rows as unknown as { indexname: string }[]).map((r) => r.indexname);

    expect(names).toContain("class_sessions_date_status_idx");
  });
});

describe("the floor, re-checked", () => {
  it("still has RLS enabled AND forced on every tenant table", async () => {
    const rows = await ownerDb.execute(sql`
      select relname, relrowsecurity, relforcerowsecurity
      from pg_class
      where relname in (
        'students','classes','student_enrollments','teachers','teacher_branches',
        'teacher_rate_history','timetable_slots','class_sessions','attendance_records',
        'branch_schedule_settings','branch_breaks','branches','audit_logs'
      )`);

    for (const table of rows as unknown as {
      relname: string;
      relrowsecurity: boolean;
      relforcerowsecurity: boolean;
    }[]) {
      expect(table.relrowsecurity, `${table.relname} RLS enabled`).toBe(true);
      expect(table.relforcerowsecurity, `${table.relname} RLS forced`).toBe(true);
    }
  });

  it("connects as a role that CANNOT bypass it", async () => {
    const rows = await appDb.execute(
      sql`select current_user as who, (select rolbypassrls from pg_roles where rolname = current_user) as bypass`,
    );
    const row = rows[0] as { who: string; bypass: boolean };

    expect(row.who).toBe("school_app");
    // The single most important line in the whole suite.
    expect(row.bypass).toBe(false);
  });
});
