import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { applyMigrations, asTenant, closeConnections, ctxFor, ownerDb, resetDatabase } from "../helpers/db";
import {
  makeAttendance,
  makeCenterSettings,
  makeSession,
  makeStudent,
  makeTwoBranches,
} from "../helpers/factories";
import * as schema from "@/shared/db/schema";
import { attendanceRate, countsFrom } from "@/modules/reports";
import { todayInCairo } from "@/shared/lib/time";

/**
 * Reports (PROJECT_PLAN 10.7).
 *
 * The percentages themselves are unit-tested; what needs a database is the shape of
 * the data they are computed from — and the fact that a branch admin's report covers
 * their branch because those are the only rows they can read, not because a filter
 * was remembered.
 *
 * The queries are exercised through raw SQL here rather than through the application
 * layer, because the application layer resolves a session and these tests have none.
 * What they prove is what RLS returns; the reshaping above it is covered by e2e.
 */

let fx: Awaited<ReturnType<typeof makeTwoBranches>>;
const TODAY = todayInCairo();

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

/** Status counts for every attendance row the given context can read. */
async function readableCounts(ctx: Parameters<typeof asTenant>[0]) {
  const rows = await asTenant(ctx, (tx) => tx.select().from(schema.attendanceRecords));
  return countsFrom(rows.map((row) => row.status));
}

describe("what a branch admin's report can be computed from", () => {
  beforeEach(async () => {
    const sessionA = await makeSession({
      branchId: fx.branchA.id,
      classId: fx.classA.id,
      teacherId: fx.teacherA.id,
    });
    const sessionB = await makeSession({
      branchId: fx.branchB.id,
      classId: fx.classB.id,
      teacherId: fx.teacherB.id,
    });

    await makeAttendance({ sessionId: sessionA.id, branchId: fx.branchA.id, studentId: fx.studentA.id });
    await makeAttendance({
      sessionId: sessionB.id,
      branchId: fx.branchB.id,
      studentId: fx.studentB.id,
      status: "absent",
    });
  });

  it("is only their own branch's rows", async () => {
    const counts = await readableCounts(ctxFor.branchAdmin(fx.branchA.id));

    expect(counts).toEqual({ present: 1, absent: 0, late: 0, excused: 0 });
    // Branch B's absence does not drag branch A's rate down — nor lift it.
    expect(attendanceRate(counts)).toBe(100);
  });

  it("is every branch's rows for a super admin, which is what a comparison needs", async () => {
    const counts = await readableCounts(ctxFor.superAdmin(null));

    expect(counts.present + counts.absent).toBe(2);
    expect(attendanceRate(counts)).toBe(50);
  });
});

describe("cancelled sessions", () => {
  it("are excluded from a report joined through class_sessions", async () => {
    const live = await makeSession({
      branchId: fx.branchA.id,
      classId: fx.classA.id,
      teacherId: fx.teacherA.id,
      periodNumber: 1,
    });
    const dead = await makeSession({
      branchId: fx.branchA.id,
      classId: fx.classA.id,
      teacherId: fx.teacherA.id,
      periodNumber: 2,
    });
    await makeAttendance({ sessionId: live.id, branchId: fx.branchA.id, studentId: fx.studentA.id });
    await makeAttendance({
      sessionId: dead.id,
      branchId: fx.branchA.id,
      studentId: fx.studentA.id,
      status: "absent",
    });

    await ownerDb
      .update(schema.classSessions)
      .set({ status: "cancelled", cancelReason: "غياب المعلم" })
      .where(sql`id = ${dead.id}`);

    const rows = await asTenant(ctxFor.branchAdmin(fx.branchA.id), (tx) =>
      tx.execute(sql`
        select ar.status
        from attendance_records ar
        join class_sessions cs on cs.id = ar.session_id
        where cs.status = 'completed'`),
    );

    // The absence was recorded against a lesson that did not happen. It stays in the
    // register — rule 10.5 keeps it — and it must not count against the student here.
    expect(rows).toHaveLength(1);
    expect((rows[0] as { status: string }).status).toBe("present");
  });
});

describe("a transferred student", () => {
  it("keeps one continuous history that the new branch can report on", async () => {
    const session = await makeSession({
      branchId: fx.branchA.id,
      classId: fx.classA.id,
      teacherId: fx.teacherA.id,
    });
    const student = await makeStudent(fx.branchA.id, fx.classA.id, { fullName: "طالب منقول" });
    await makeAttendance({
      sessionId: session.id,
      branchId: fx.branchA.id,
      studentId: student.id,
      status: "absent",
    });

    await ownerDb
      .update(schema.students)
      .set({ branchId: fx.branchB.id, classId: fx.classB.id })
      .where(sql`id = ${student.id}`);

    const rows = await asTenant(ctxFor.branchAdmin(fx.branchB.id), (tx) =>
      tx
        .select()
        .from(schema.attendanceRecords)
        .where(sql`student_id = ${student.id}`),
    );

    // Their new branch needs last term's absences to know who they have taken on.
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe("absent");
  });
});

describe("the dashboard's planned-versus-done gap", () => {
  it("counts a branch's own timetable slots and its own sessions", async () => {
    const subject = await ownerDb
      .insert(schema.subjects)
      .values({ name: `مادة ${Date.now()}` })
      .returning();
    const subjectId = subject[0]?.id;
    expect(subjectId).toBeDefined();
    if (!subjectId) return;

    // One slot in each branch, on the same weekday.
    for (const [branchId, classId, teacherId] of [
      [fx.branchA.id, fx.classA.id, fx.teacherA.id],
      [fx.branchB.id, fx.classB.id, fx.teacherB.id],
    ] as const) {
      await ownerDb.insert(schema.timetableSlots).values({
        branchId,
        classId,
        teacherId,
        subjectId,
        dayOfWeek: 6,
        periodNumber: 1,
        startTime: "08:00",
        endTime: "08:45",
      });
    }

    await makeSession({
      branchId: fx.branchA.id,
      classId: fx.classA.id,
      teacherId: fx.teacherA.id,
      sessionDate: TODAY,
    });

    const slots = await asTenant(ctxFor.branchAdmin(fx.branchA.id), (tx) =>
      tx.select().from(schema.timetableSlots),
    );
    const sessions = await asTenant(ctxFor.branchAdmin(fx.branchA.id), (tx) =>
      tx.select().from(schema.classSessions),
    );

    // One planned and one done, in THIS branch. The other branch is invisible, so
    // its slot cannot inflate the "remaining" number this admin is chasing.
    expect(slots).toHaveLength(1);
    expect(sessions).toHaveLength(1);
  });
});
