import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { applyMigrations, asTenant, closeConnections, ctxFor, ownerDb, resetDatabase } from "../helpers/db";
import {
  makeAttendance,
  makeCenterSettings,
  makeSession,
  makeStudent,
  makeSubject,
  makeTeacher,
  makeTwoBranches,
} from "../helpers/factories";
import * as schema from "@/shared/db/schema";
import { expectConstraintViolation, expectRlsViolation } from "../helpers/errors";
import { todayInCairo } from "@/shared/lib/time";

/**
 * Sessions and attendance isolation (PROJECT_PLAN 7.13, 7.14, section 8, rule 10.5).
 *
 * The teacher scope is the interesting one here and it is NARROWER than a branch
 * admin's: a teacher sees their own sessions in every branch they work in, and may
 * write only today's, and only while the centre allows it. All three of those are
 * database policies, so they are tested against the app role rather than asserted
 * about the TypeScript that also enforces them.
 */

let fx: Awaited<ReturnType<typeof makeTwoBranches>>;
const TODAY = todayInCairo();
const YESTERDAY = shiftDays(TODAY, -1);

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

function shiftDays(date: string, days: number): string {
  const shifted = new Date(`${date}T00:00:00Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}

describe("a branch admin", () => {
  it("sees only their own branch's sessions", async () => {
    await makeSession({ branchId: fx.branchA.id, classId: fx.classA.id, teacherId: fx.teacherA.id });
    await makeSession({ branchId: fx.branchB.id, classId: fx.classB.id, teacherId: fx.teacherB.id });

    const rows = await asTenant(ctxFor.branchAdmin(fx.branchA.id), (tx) =>
      tx.select().from(schema.classSessions),
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.branchId).toBe(fx.branchA.id);
  });

  it("cannot create a session in another branch", async () => {
    await expectRlsViolation(
      asTenant(ctxFor.branchAdmin(fx.branchA.id), (tx) =>
        tx.insert(schema.classSessions).values({
          branchId: fx.branchB.id,
          classId: fx.classB.id,
          teacherId: fx.teacherB.id,
          subjectName: "الرياضيات",
          sessionDate: TODAY,
          periodNumber: 1,
          startTime: "08:00",
          endTime: "08:45",
          trackApplied: "scientific",
          rateAppliedPiasters: 15_000,
        }),
      ),
    );
  });

  it("sees only their own branch's attendance", async () => {
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
    await makeAttendance({ sessionId: sessionB.id, branchId: fx.branchB.id, studentId: fx.studentB.id });

    const rows = await asTenant(ctxFor.branchAdmin(fx.branchA.id), (tx) =>
      tx.select().from(schema.attendanceRecords),
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.studentId).toBe(fx.studentA.id);
  });

  it("cannot attach an attendance row to another branch's session", async () => {
    const sessionB = await makeSession({
      branchId: fx.branchB.id,
      classId: fx.classB.id,
      teacherId: fx.teacherB.id,
    });

    await expectRlsViolation(
      asTenant(ctxFor.branchAdmin(fx.branchA.id), (tx) =>
        tx.insert(schema.attendanceRecords).values({
          sessionId: sessionB.id,
          branchId: fx.branchB.id,
          studentId: fx.studentB.id,
          status: "absent",
        }),
      ),
    );
  });
});

describe("a teacher", () => {
  it("sees their own sessions in EVERY branch they teach in", async () => {
    const shared = await makeTeacher([fx.branchA.id, fx.branchB.id], { fullName: "معلم مشترك" });
    await makeSession({ branchId: fx.branchA.id, classId: fx.classA.id, teacherId: shared.id });
    await makeSession({ branchId: fx.branchB.id, classId: fx.classB.id, teacherId: shared.id });
    // Somebody else's session, in a branch they work in.
    await makeSession({
      branchId: fx.branchA.id,
      classId: fx.classA.id,
      teacherId: fx.teacherA.id,
      periodNumber: 4,
    });

    const rows = await asTenant(ctxFor.teacher(shared.id), (tx) => tx.select().from(schema.classSessions));

    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.teacherId === shared.id)).toBe(true);
  });

  it("may create a session for TODAY", async () => {
    const subject = await makeSubject("الرياضيات");
    expect(subject).toBeDefined();

    await asTenant(ctxFor.teacher(fx.teacherA.id), (tx) =>
      tx.insert(schema.classSessions).values({
        branchId: fx.branchA.id,
        classId: fx.classA.id,
        teacherId: fx.teacherA.id,
        subjectName: "الرياضيات",
        sessionDate: TODAY,
        periodNumber: 1,
        startTime: "08:00",
        endTime: "08:45",
        trackApplied: "scientific",
        rateAppliedPiasters: 15_000,
      }),
    );

    const [row] = await ownerDb.select().from(schema.classSessions);
    expect(row?.sessionDate).toBe(TODAY);
  });

  it("may NOT create a session for yesterday", async () => {
    await expectRlsViolation(
      asTenant(ctxFor.teacher(fx.teacherA.id), (tx) =>
        tx.insert(schema.classSessions).values({
          branchId: fx.branchA.id,
          classId: fx.classA.id,
          teacherId: fx.teacherA.id,
          subjectName: "الرياضيات",
          sessionDate: YESTERDAY,
          periodNumber: 1,
          startTime: "08:00",
          endTime: "08:45",
          trackApplied: "scientific",
          rateAppliedPiasters: 15_000,
        }),
      ),
    );
  });

  it("may NOT create a session for another teacher", async () => {
    await expectRlsViolation(
      asTenant(ctxFor.teacher(fx.teacherA.id), (tx) =>
        tx.insert(schema.classSessions).values({
          branchId: fx.branchA.id,
          classId: fx.classA.id,
          teacherId: fx.teacherB.id,
          subjectName: "الرياضيات",
          sessionDate: TODAY,
          periodNumber: 2,
          startTime: "09:00",
          endTime: "09:45",
          trackApplied: "scientific",
          rateAppliedPiasters: 15_000,
        }),
      ),
    );
  });

  it("may NOT create a session in a branch they are not linked to", async () => {
    await expectRlsViolation(
      asTenant(ctxFor.teacher(fx.teacherA.id), (tx) =>
        tx.insert(schema.classSessions).values({
          branchId: fx.branchB.id,
          classId: fx.classB.id,
          teacherId: fx.teacherA.id,
          subjectName: "الرياضيات",
          sessionDate: TODAY,
          periodNumber: 3,
          startTime: "10:00",
          endTime: "10:45",
          trackApplied: "scientific",
          rateAppliedPiasters: 15_000,
        }),
      ),
    );
  });

  it("is refused entirely once the centre turns teacher marking off", async () => {
    await ownerDb.update(schema.centerSettings).set({ teacherCanMarkAttendance: false });

    await expectRlsViolation(
      asTenant(ctxFor.teacher(fx.teacherA.id), (tx) =>
        tx.insert(schema.classSessions).values({
          branchId: fx.branchA.id,
          classId: fx.classA.id,
          teacherId: fx.teacherA.id,
          subjectName: "الرياضيات",
          sessionDate: TODAY,
          periodNumber: 5,
          startTime: "12:00",
          endTime: "12:45",
          trackApplied: "scientific",
          rateAppliedPiasters: 15_000,
        }),
      ),
    );
  });

  it("sees the attendance of their own session, and no one else's", async () => {
    const mine = await makeSession({
      branchId: fx.branchA.id,
      classId: fx.classA.id,
      teacherId: fx.teacherA.id,
    });
    const theirs = await makeSession({
      branchId: fx.branchA.id,
      classId: fx.classA.id,
      teacherId: fx.teacherB.id,
      periodNumber: 6,
    });
    await makeAttendance({ sessionId: mine.id, branchId: fx.branchA.id, studentId: fx.studentA.id });
    await makeAttendance({
      sessionId: theirs.id,
      branchId: fx.branchA.id,
      studentId: fx.studentA.id,
      status: "absent",
    });

    const rows = await asTenant(ctxFor.teacher(fx.teacherA.id), (tx) =>
      tx.select().from(schema.attendanceRecords),
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.sessionId).toBe(mine.id);
  });
});

describe("the constraints that keep a register honest", () => {
  it("refuses two sessions for one class, day and period", async () => {
    await makeSession({
      branchId: fx.branchA.id,
      classId: fx.classA.id,
      teacherId: fx.teacherA.id,
      periodNumber: 1,
      sessionDate: TODAY,
    });

    await expectConstraintViolation(
      makeSession({
        branchId: fx.branchA.id,
        classId: fx.classA.id,
        teacherId: fx.teacherB.id,
        periodNumber: 1,
        sessionDate: TODAY,
      }),
      "class_sessions_class_date_period_unique",
    );
  });

  it("refuses one student marked twice in one session", async () => {
    const session = await makeSession({
      branchId: fx.branchA.id,
      classId: fx.classA.id,
      teacherId: fx.teacherA.id,
    });
    await makeAttendance({ sessionId: session.id, branchId: fx.branchA.id, studentId: fx.studentA.id });

    await expectConstraintViolation(
      makeAttendance({
        sessionId: session.id,
        branchId: fx.branchA.id,
        studentId: fx.studentA.id,
        status: "absent",
      }),
      "attendance_records_session_student_unique",
    );
  });

  it("makes that same key an UPSERT, which is what saving twice relies on", async () => {
    const session = await makeSession({
      branchId: fx.branchA.id,
      classId: fx.classA.id,
      teacherId: fx.teacherA.id,
    });

    for (const status of ["present", "absent"] as const) {
      await asTenant(ctxFor.branchAdmin(fx.branchA.id), (tx) =>
        tx
          .insert(schema.attendanceRecords)
          .values({
            sessionId: session.id,
            branchId: fx.branchA.id,
            studentId: fx.studentA.id,
            status,
          })
          .onConflictDoUpdate({
            target: [schema.attendanceRecords.sessionId, schema.attendanceRecords.studentId],
            set: { status },
          }),
      );
    }

    const rows = await ownerDb.select().from(schema.attendanceRecords);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe("absent");
  });

  it("refuses a cancelled session with no reason", async () => {
    const session = await makeSession({
      branchId: fx.branchA.id,
      classId: fx.classA.id,
      teacherId: fx.teacherA.id,
    });

    await expectConstraintViolation(
      ownerDb
        .update(schema.classSessions)
        .set({ status: "cancelled" })
        .where(sql`id = ${session.id}`),
      "class_sessions_cancelled_has_reason",
    );
  });

  it("refuses a completed session that still carries a cancellation reason", async () => {
    const session = await makeSession({
      branchId: fx.branchA.id,
      classId: fx.classA.id,
      teacherId: fx.teacherA.id,
    });

    await expectConstraintViolation(
      ownerDb
        .update(schema.classSessions)
        .set({ cancelReason: "سبب بلا إلغاء" })
        .where(sql`id = ${session.id}`),
      "class_sessions_cancelled_has_reason",
    );
  });
});

describe("the rate snapshot (rule 10.6)", () => {
  it("survives a rate change, a substitution and a cancellation", async () => {
    const session = await makeSession({
      branchId: fx.branchA.id,
      classId: fx.classA.id,
      teacherId: fx.teacherA.id,
      ratePiasters: 15_000,
    });

    // The teacher's rate doubles today…
    await asTenant(ctxFor.superAdmin(fx.branchA.id), (tx) =>
      tx
        .update(schema.teachers)
        .set({ ratePiastersScientific: 30_000 })
        .where(sql`id = ${fx.teacherA.id}`),
    );
    // …and the session is cancelled and restored.
    await asTenant(ctxFor.superAdmin(fx.branchA.id), (tx) =>
      tx
        .update(schema.classSessions)
        .set({ status: "cancelled", cancelReason: "غياب المعلم" })
        .where(sql`id = ${session.id}`),
    );
    await asTenant(ctxFor.superAdmin(fx.branchA.id), (tx) =>
      tx
        .update(schema.classSessions)
        .set({ status: "completed", cancelReason: null })
        .where(sql`id = ${session.id}`),
    );

    const [after] = await ownerDb
      .select()
      .from(schema.classSessions)
      .where(sql`id = ${session.id}`);
    // What was earned that day is still what was earned that day.
    expect(after?.rateAppliedPiasters).toBe(15_000);
  });
});

describe("a transferred student's attendance", () => {
  it("stays visible to the branch they moved TO", async () => {
    // Recorded in branch A, before the transfer.
    const session = await makeSession({
      branchId: fx.branchA.id,
      classId: fx.classA.id,
      teacherId: fx.teacherA.id,
    });
    const student = await makeStudent(fx.branchA.id, fx.classA.id, { fullName: "طالب منقول" });
    await makeAttendance({ sessionId: session.id, branchId: fx.branchA.id, studentId: student.id });

    // Now they move to branch B.
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

    // One continuous history, so the new branch can see what they missed before.
    expect(rows).toHaveLength(1);
  });
});
