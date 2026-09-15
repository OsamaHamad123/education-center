import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { applyMigrations, asTenant, closeConnections, ctxFor, ownerDb, resetDatabase } from "../helpers/db";
import { makeCenterSettings, makeTwoBranches } from "../helpers/factories";
import * as schema from "@/shared/db/schema";
import { todayInCairo } from "@/shared/lib/time";

/**
 * The mandatory isolation suite (PROJECT_PLAN 13.2).
 *
 * Every query here runs on the `school_app` connection, which has NOBYPASSRLS. The
 * queries are deliberately written WITHOUT a branch_id filter: if a policy is wrong,
 * these tests return another branch's rows and fail. An application-level `where`
 * would make them pass for the wrong reason.
 */

let fixtures: Awaited<ReturnType<typeof makeTwoBranches>>;

beforeAll(async () => {
  await applyMigrations();
});

beforeEach(async () => {
  await resetDatabase();
  await makeCenterSettings();
  fixtures = await makeTwoBranches();
});

afterAll(async () => {
  await closeConnections();
});

describe("branch admin cannot reach another branch", () => {
  it("sees only its own classes, even with an unfiltered query", async () => {
    const rows = await asTenant(ctxFor.branchAdmin(fixtures.branchA.id), (tx) =>
      tx.select().from(schema.classes),
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(fixtures.classA.id);
  });

  it("sees only its own students", async () => {
    const rows = await asTenant(ctxFor.branchAdmin(fixtures.branchA.id), (tx) =>
      tx.select().from(schema.students),
    );

    expect(rows.map((r) => r.studentCode)).toEqual(["AAA-26-00001"]);
  });

  it("counts only its own students — an aggregate must not leak either", async () => {
    const result = await asTenant(ctxFor.branchAdmin(fixtures.branchA.id), (tx) =>
      tx.execute(sql`select count(*)::int as total from students`),
    );

    expect(result[0]).toMatchObject({ total: 1 });
  });

  it("cannot fetch a foreign student by id — the row is absent, not forbidden", async () => {
    const rows = await asTenant(ctxFor.branchAdmin(fixtures.branchA.id), (tx) =>
      tx
        .select()
        .from(schema.students)
        .where(sql`id = ${fixtures.studentB.id}`),
    );

    // Zero rows is what lets the use case answer NOT_FOUND instead of revealing
    // that the id exists somewhere else (CLAUDE.md, "Multi-branch isolation").
    expect(rows).toHaveLength(0);
  });

  it("cannot search foreign students by name", async () => {
    const rows = await asTenant(ctxFor.branchAdmin(fixtures.branchA.id), (tx) =>
      tx
        .select()
        .from(schema.students)
        .where(sql`full_name ilike '%طالب%'`),
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.branchId).toBe(fixtures.branchA.id);
  });

  it("does not learn that other branches exist", async () => {
    const rows = await asTenant(ctxFor.branchAdmin(fixtures.branchA.id), (tx) =>
      tx.select().from(schema.branches),
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.code).toBe("AAA");
  });

  it("sees only teachers linked to its own branch", async () => {
    const rows = await asTenant(ctxFor.branchAdmin(fixtures.branchA.id), (tx) =>
      tx.select().from(schema.teachers),
    );

    expect(rows.map((r) => r.fullName)).toEqual(["معلم أ"]);
  });

  it("cannot insert a row carrying another branch's id", async () => {
    await expect(
      asTenant(ctxFor.branchAdmin(fixtures.branchA.id), (tx) =>
        tx.insert(schema.classes).values({
          branchId: fixtures.branchB.id,
          name: "شعبة مهربة",
          track: "scientific",
          gender: "mixed",
          gradeLevel: "الصف الثالث الثانوي",
        }),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it("cannot update a foreign row — the update silently matches nothing", async () => {
    await asTenant(ctxFor.branchAdmin(fixtures.branchA.id), (tx) =>
      tx
        .update(schema.classes)
        .set({ name: "مُخترَق" })
        .where(sql`id = ${fixtures.classB.id}`),
    );

    const [after] = await ownerDb
      .select()
      .from(schema.classes)
      .where(sql`id = ${fixtures.classB.id}`);
    expect(after?.name).toBe("شعبة ب");
  });

  it("cannot move one of its own students into another branch", async () => {
    await expect(
      asTenant(ctxFor.branchAdmin(fixtures.branchA.id), (tx) =>
        tx
          .update(schema.students)
          .set({ branchId: fixtures.branchB.id, classId: fixtures.classB.id })
          .where(sql`id = ${fixtures.studentA.id}`),
      ),
    ).rejects.toThrow(/row-level security/i);
  });
});

describe("super admin", () => {
  it("sees every branch's data in 'كافة الفروع' mode", async () => {
    const rows = await asTenant(ctxFor.superAdmin(null), (tx) => tx.select().from(schema.students));
    expect(rows).toHaveLength(2);
  });

  it("is scoped to one branch once a branch is selected", async () => {
    const rows = await asTenant(ctxFor.superAdmin(fixtures.branchA.id), (tx) =>
      tx.select().from(schema.students),
    );
    expect(rows.map((r) => r.studentCode)).toEqual(["AAA-26-00001"]);
  });

  it("cannot mutate while in 'كافة الفروع' mode", async () => {
    // branchId null means no branch is selected, and every write policy requires one.
    await expect(
      asTenant(ctxFor.superAdmin(null), (tx) =>
        tx.insert(schema.classes).values({
          branchId: fixtures.branchA.id,
          name: "شعبة جديدة",
          track: "literary",
          gender: "mixed",
          gradeLevel: "الصف الثالث الثانوي",
        }),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it("can transfer a student between branches, which a branch admin cannot", async () => {
    await asTenant(ctxFor.superAdmin(fixtures.branchA.id), (tx) =>
      tx
        .update(schema.students)
        .set({ branchId: fixtures.branchB.id, classId: fixtures.classB.id })
        .where(sql`id = ${fixtures.studentA.id}`),
    );

    const [moved] = await ownerDb
      .select()
      .from(schema.students)
      .where(sql`id = ${fixtures.studentA.id}`);
    expect(moved?.branchId).toBe(fixtures.branchB.id);
    // The code survives the move — it is the student's identity (rule 10.3).
    expect(moved?.studentCode).toBe("AAA-26-00001");
  });
});

describe("teacher scope", () => {
  it("sees only their own sessions", async () => {
    const { makeSession } = await import("../helpers/factories");
    await makeSession({
      branchId: fixtures.branchA.id,
      classId: fixtures.classA.id,
      teacherId: fixtures.teacherA.id,
    });
    await makeSession({
      branchId: fixtures.branchB.id,
      classId: fixtures.classB.id,
      teacherId: fixtures.teacherB.id,
    });

    const rows = await asTenant(ctxFor.teacher(fixtures.teacherA.id), (tx) =>
      tx.select().from(schema.classSessions),
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.teacherId).toBe(fixtures.teacherA.id);
  });

  it("sees only their own profile, not other teachers' rates", async () => {
    const rows = await asTenant(ctxFor.teacher(fixtures.teacherA.id), (tx) =>
      tx.select().from(schema.teachers),
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(fixtures.teacherA.id);
  });

  it("sees students only in branches they are linked to", async () => {
    const rows = await asTenant(ctxFor.teacher(fixtures.teacherA.id), (tx) =>
      tx.select().from(schema.students),
    );

    expect(rows.map((r) => r.branchId)).toEqual([fixtures.branchA.id]);
  });

  it("cannot create a session for a different teacher", async () => {
    await expect(
      asTenant(ctxFor.teacher(fixtures.teacherA.id), (tx) =>
        tx.insert(schema.classSessions).values({
          branchId: fixtures.branchB.id,
          classId: fixtures.classB.id,
          teacherId: fixtures.teacherB.id,
          subjectName: "الفيزياء",
          sessionDate: todayInCairo(),
          periodNumber: 1,
          startTime: "08:00",
          endTime: "08:45",
          trackApplied: "scientific",
          rateAppliedPiasters: 15_000,
        }),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it("cannot create a session dated in the past", async () => {
    await expect(
      asTenant(ctxFor.teacher(fixtures.teacherA.id), (tx) =>
        tx.insert(schema.classSessions).values({
          branchId: fixtures.branchA.id,
          classId: fixtures.classA.id,
          teacherId: fixtures.teacherA.id,
          subjectName: "الرياضيات",
          sessionDate: "2020-01-01",
          periodNumber: 1,
          startTime: "08:00",
          endTime: "08:45",
          trackApplied: "scientific",
          rateAppliedPiasters: 15_000,
        }),
      ),
    ).rejects.toThrow(/row-level security/i);
  });
});

describe("audit log", () => {
  it("is append-only: the app role has no DELETE privilege", async () => {
    await asTenant(ctxFor.branchAdmin(fixtures.branchA.id), (tx) =>
      tx.insert(schema.auditLogs).values({
        branchId: fixtures.branchA.id,
        action: "create",
        entity: "class",
        entityId: fixtures.classA.id,
      }),
    );

    await expect(
      asTenant(ctxFor.branchAdmin(fixtures.branchA.id), (tx) =>
        tx.delete(schema.auditLogs).where(sql`entity = 'class'`),
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it("shows a branch admin only their own branch's entries", async () => {
    await ownerDb.insert(schema.auditLogs).values([
      { branchId: fixtures.branchA.id, action: "create", entity: "student" },
      { branchId: fixtures.branchB.id, action: "create", entity: "student" },
    ]);

    const rows = await asTenant(ctxFor.branchAdmin(fixtures.branchA.id), (tx) =>
      tx.select().from(schema.auditLogs),
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.branchId).toBe(fixtures.branchA.id);
  });
});

describe("no tenant context", () => {
  it("returns nothing when app.user_role was never set", async () => {
    // A query that forgets withTenant() must fail closed, not open.
    const rows = await asTenant({ userId: "x", role: "" as never, branchId: null, teacherId: null }, (tx) =>
      tx.select().from(schema.students),
    );

    expect(rows).toHaveLength(0);
  });
});
