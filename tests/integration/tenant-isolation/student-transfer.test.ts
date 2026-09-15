import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { applyMigrations, asTenant, closeConnections, ctxFor, ownerDb, resetDatabase } from "../helpers/db";
import { makeCenterSettings, makeTwoBranches } from "../helpers/factories";
import * as schema from "@/shared/db/schema";
import { todayInCairo } from "@/shared/lib/time";

/**
 * Transferring a student between branches (rule 10.3) touches the two hardest
 * properties in the system at once: the student's identity must survive the move, and
 * BOTH branches must end up with the right visibility — the new one gains a student,
 * the old one keeps a read-only record of someone it taught for two years.
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

/** Moves studentA from branch A to branch B, the way the use case does. */
async function transferStudentA() {
  const today = todayInCairo();
  await ownerDb
    .update(schema.studentEnrollments)
    .set({ endDate: today, endReason: "branch_transfer" })
    .where(sql`student_id = ${fx.studentA.id} and end_date is null`);
  await ownerDb.insert(schema.studentEnrollments).values({
    studentId: fx.studentA.id,
    branchId: fx.branchB.id,
    classId: fx.classB.id,
    startDate: today,
  });
  await ownerDb
    .update(schema.students)
    .set({ branchId: fx.branchB.id, classId: fx.classB.id })
    .where(sql`id = ${fx.studentA.id}`);
}

describe("after a transfer", () => {
  beforeEach(async () => {
    await transferStudentA();
  });

  it("keeps the student code unchanged — it is their identity", async () => {
    const [moved] = await ownerDb
      .select()
      .from(schema.students)
      .where(sql`id = ${fx.studentA.id}`);

    expect(moved?.studentCode).toBe("AAA-26-00001");
    expect(moved?.branchId).toBe(fx.branchB.id);
  });

  it("gives the NEW branch the student and their whole history", async () => {
    const rows = await asTenant(ctxFor.branchAdmin(fx.branchB.id), (tx) => tx.select().from(schema.students));
    expect(rows.map((r) => r.studentCode).sort()).toEqual(["AAA-26-00001", "BBB-26-00001"]);

    // Including the enrollment recorded by the branch they came from.
    const history = await asTenant(ctxFor.branchAdmin(fx.branchB.id), (tx) =>
      tx
        .select()
        .from(schema.studentEnrollments)
        .where(sql`student_id = ${fx.studentA.id}`),
    );
    expect(history).toHaveLength(2);
    expect(history.some((row) => row.branchId === fx.branchA.id)).toBe(true);
  });

  it("leaves the OLD branch a read-only record of the student it taught", async () => {
    const rows = await asTenant(ctxFor.branchAdmin(fx.branchA.id), (tx) => tx.select().from(schema.students));

    expect(rows.map((r) => r.studentCode)).toEqual(["AAA-26-00001"]);
    // They can see them, but the row now belongs to the other branch.
    expect(rows[0]?.branchId).toBe(fx.branchB.id);
  });

  it("does NOT let the old branch edit the student any more", async () => {
    // The UPDATE policy's USING clause excludes the row, so it matches nothing and
    // returns quietly — the same shape as any other foreign-row update. What matters
    // is that nothing changed.
    await asTenant(ctxFor.branchAdmin(fx.branchA.id), (tx) =>
      tx
        .update(schema.students)
        .set({ fullName: "اسم مُعدَّل" })
        .where(sql`id = ${fx.studentA.id}`),
    );

    const [after] = await ownerDb
      .select()
      .from(schema.students)
      .where(sql`id = ${fx.studentA.id}`);
    expect(after?.fullName).toBe(fx.studentA.fullName);
  });

  it("does not let the old branch archive them either", async () => {
    await asTenant(ctxFor.branchAdmin(fx.branchA.id), (tx) =>
      tx
        .update(schema.students)
        .set({ status: "archived", leftDate: todayInCairo(), leaveReason: "محاولة" })
        .where(sql`id = ${fx.studentA.id}`),
    );

    const [after] = await ownerDb
      .select()
      .from(schema.students)
      .where(sql`id = ${fx.studentA.id}`);
    expect(after?.status).toBe("active");
  });

  it("still hides branch B's own students from branch A", async () => {
    // The widened SELECT must not become a general-purpose window into branch B.
    const rows = await asTenant(ctxFor.branchAdmin(fx.branchA.id), (tx) =>
      tx
        .select()
        .from(schema.students)
        .where(sql`student_code = 'BBB-26-00001'`),
    );
    expect(rows).toHaveLength(0);
  });

  it("keeps attendance recorded before the move readable by both branches", async () => {
    const { makeSession, makeAttendance } = await import("../helpers/factories");
    const session = await makeSession({
      branchId: fx.branchA.id,
      classId: fx.classA.id,
      teacherId: fx.teacherA.id,
    });
    await makeAttendance({
      sessionId: session.id,
      branchId: fx.branchA.id,
      studentId: fx.studentA.id,
      status: "present",
    });

    const fromOld = await asTenant(ctxFor.branchAdmin(fx.branchA.id), (tx) =>
      tx.select().from(schema.attendanceRecords),
    );
    const fromNew = await asTenant(ctxFor.branchAdmin(fx.branchB.id), (tx) =>
      tx.select().from(schema.attendanceRecords),
    );

    // The branch that ran the session keeps its record; the student's new branch
    // sees it too, so their profile shows one continuous history.
    expect(fromOld).toHaveLength(1);
    expect(fromNew).toHaveLength(1);
  });
});

describe("enrollment invariants hold through a transfer", () => {
  it("leaves exactly one open enrollment", async () => {
    await transferStudentA();

    const open = await ownerDb
      .select()
      .from(schema.studentEnrollments)
      .where(sql`student_id = ${fx.studentA.id} and end_date is null`);

    expect(open).toHaveLength(1);
    expect(open[0]?.branchId).toBe(fx.branchB.id);
  });

  it("records why the previous enrollment ended", async () => {
    await transferStudentA();

    const closed = await ownerDb
      .select()
      .from(schema.studentEnrollments)
      .where(sql`student_id = ${fx.studentA.id} and end_date is not null`);

    expect(closed).toHaveLength(1);
    expect(closed[0]?.endReason).toBe("branch_transfer");
  });
});

describe("a student who never left", () => {
  it("is invisible to a branch that never enrolled them", async () => {
    const rows = await asTenant(ctxFor.branchAdmin(fx.branchA.id), (tx) =>
      tx
        .select()
        .from(schema.students)
        .where(sql`id = ${fx.studentB.id}`),
    );
    expect(rows).toHaveLength(0);
  });
});
