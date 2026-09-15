import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { applyMigrations, closeConnections, ownerDb, resetDatabase } from "../helpers/db";
import {
  makeBranch,
  makeClass,
  makeStudent,
  makeSubject,
  makeTeacher,
  makeSession,
} from "../helpers/factories";
import * as schema from "@/shared/db/schema";
import { expectConstraintViolation, pgErrorOf, PG_CODE } from "../helpers/errors";
import { todayInCairo } from "@/shared/lib/time";

/**
 * Fixtures join today, and student_enrollments_dates_ordered requires end_date to be
 * on or after start_date — so a closing date has to be today or later, not a fixed
 * date in the past.
 */
const futureDate = todayInCairo(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000));

/**
 * Constraints that protect business rules at the database level, where no bug in a
 * use case can route around them. These run as the owner: the question is whether
 * the constraint holds at all, not who is allowed to trip it.
 */

beforeAll(async () => {
  await applyMigrations();
});

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await closeConnections();
});

describe("teacher double-booking (PROJECT_PLAN 7.12)", () => {
  it("rejects overlapping slots for one teacher ACROSS branches", async () => {
    const branchA = await makeBranch({ code: "XA" });
    const branchB = await makeBranch({ code: "XB" });
    const classA = await makeClass(branchA.id);
    const classB = await makeClass(branchB.id);
    const subject = await makeSubject();
    // The same person, linked to both branches — the whole reason this constraint exists.
    const teacher = await makeTeacher([branchA.id, branchB.id]);

    await ownerDb.insert(schema.timetableSlots).values({
      branchId: branchA.id,
      classId: classA.id,
      teacherId: teacher.id,
      subjectId: subject.id,
      dayOfWeek: 6,
      periodNumber: 1,
      startTime: "08:00",
      endTime: "08:45",
    });

    await expectConstraintViolation(
      ownerDb.insert(schema.timetableSlots).values({
        branchId: branchB.id,
        classId: classB.id,
        teacherId: teacher.id,
        subjectId: subject.id,
        dayOfWeek: 6,
        periodNumber: 1,
        startTime: "08:30",
        endTime: "09:15",
      }),
      "no_teacher_overlap",
    );
  });

  it("allows back-to-back periods — 08:45 does not overlap 08:00–08:45", async () => {
    const branch = await makeBranch({ code: "XC" });
    const klass = await makeClass(branch.id);
    const subject = await makeSubject();
    const teacher = await makeTeacher([branch.id]);

    await ownerDb.insert(schema.timetableSlots).values({
      branchId: branch.id,
      classId: klass.id,
      teacherId: teacher.id,
      subjectId: subject.id,
      dayOfWeek: 6,
      periodNumber: 1,
      startTime: "08:00",
      endTime: "08:45",
    });

    const otherClass = await makeClass(branch.id);
    await expect(
      ownerDb.insert(schema.timetableSlots).values({
        branchId: branch.id,
        classId: otherClass.id,
        teacherId: teacher.id,
        subjectId: subject.id,
        dayOfWeek: 6,
        periodNumber: 2,
        startTime: "08:45",
        endTime: "09:30",
      }),
    ).resolves.not.toThrow();
  });

  it("allows the same time on a different day", async () => {
    const branch = await makeBranch({ code: "XD" });
    const klass = await makeClass(branch.id);
    const subject = await makeSubject();
    const teacher = await makeTeacher([branch.id]);

    const base = {
      branchId: branch.id,
      classId: klass.id,
      teacherId: teacher.id,
      subjectId: subject.id,
      periodNumber: 1,
      startTime: "08:00",
      endTime: "08:45",
    };

    await ownerDb.insert(schema.timetableSlots).values({ ...base, dayOfWeek: 6 });
    await expect(
      ownerDb.insert(schema.timetableSlots).values({ ...base, dayOfWeek: 7 }),
    ).resolves.not.toThrow();
  });
});

describe("student enrollment invariants (PROJECT_PLAN 7.6)", () => {
  it("allows only one open enrollment per student", async () => {
    const branch = await makeBranch({ code: "XE" });
    const klass = await makeClass(branch.id);
    const otherClass = await makeClass(branch.id);
    const student = await makeStudent(branch.id, klass.id);

    // makeStudent already opened one; a second open row would double-count the
    // student in every attendance sheet.
    await expectConstraintViolation(
      ownerDb.insert(schema.studentEnrollments).values({
        studentId: student.id,
        branchId: branch.id,
        classId: otherClass.id,
        startDate: futureDate,
      }),
      "student_enrollments_one_open",
    );
  });

  it("allows a new enrollment once the previous one is closed", async () => {
    const branch = await makeBranch({ code: "XF" });
    const klass = await makeClass(branch.id);
    const otherClass = await makeClass(branch.id);
    const student = await makeStudent(branch.id, klass.id);

    await ownerDb
      .update(schema.studentEnrollments)
      .set({ endDate: futureDate, endReason: "class_change" })
      .where(sql`student_id = ${student.id}`);

    await expect(
      ownerDb.insert(schema.studentEnrollments).values({
        studentId: student.id,
        branchId: branch.id,
        classId: otherClass.id,
        startDate: futureDate,
      }),
    ).resolves.not.toThrow();
  });

  it("refuses to close an enrollment without a reason", async () => {
    const branch = await makeBranch({ code: "XG" });
    const klass = await makeClass(branch.id);
    const student = await makeStudent(branch.id, klass.id);

    await expectConstraintViolation(
      ownerDb
        .update(schema.studentEnrollments)
        .set({ endDate: futureDate })
        .where(sql`student_id = ${student.id}`),
      "student_enrollments_closed_has_reason",
    );
  });
});

describe("student archive invariants (PROJECT_PLAN 7.5)", () => {
  it("refuses to archive a student without a date and a reason", async () => {
    const branch = await makeBranch({ code: "XH" });
    const klass = await makeClass(branch.id);
    const student = await makeStudent(branch.id, klass.id);

    await expectConstraintViolation(
      ownerDb
        .update(schema.students)
        .set({ status: "archived" })
        .where(sql`id = ${student.id}`),
      "students_archived_has_reason",
    );
  });

  it("derives parent_phone_last4 automatically", async () => {
    const branch = await makeBranch({ code: "XI" });
    const klass = await makeClass(branch.id);
    const student = await makeStudent(branch.id, klass.id, { parentPhone: "+201012345678" });

    // The public lookup matches on this column, so it must never drift from the phone.
    expect(student.parentPhoneLast4).toBe("5678");
  });
});

describe("payroll history is immutable (rule 10.6)", () => {
  it("keeps the snapshotted rate when the teacher's rate changes later", async () => {
    const branch = await makeBranch({ code: "XJ" });
    const klass = await makeClass(branch.id, { track: "scientific" });
    const teacher = await makeTeacher([branch.id], { ratePiastersScientific: 15_000 });

    const session = await makeSession({
      branchId: branch.id,
      classId: klass.id,
      teacherId: teacher.id,
      ratePiasters: teacher.ratePiastersScientific,
    });

    await ownerDb
      .update(schema.teachers)
      .set({ ratePiastersScientific: 25_000 })
      .where(sql`id = ${teacher.id}`);

    const [after] = await ownerDb
      .select()
      .from(schema.classSessions)
      .where(sql`id = ${session.id}`);

    expect(after?.rateAppliedPiasters).toBe(15_000);
  });
});

describe("session and attendance invariants", () => {
  it("rejects a second session for the same class, date and period", async () => {
    const branch = await makeBranch({ code: "XK" });
    const klass = await makeClass(branch.id);
    const teacher = await makeTeacher([branch.id]);

    await makeSession({ branchId: branch.id, classId: klass.id, teacherId: teacher.id, periodNumber: 2 });
    await expectConstraintViolation(
      makeSession({ branchId: branch.id, classId: klass.id, teacherId: teacher.id, periodNumber: 2 }),
      "class_sessions_class_date_period_unique",
    );
  });

  it("requires a reason when a session is cancelled", async () => {
    const branch = await makeBranch({ code: "XL" });
    const klass = await makeClass(branch.id);
    const teacher = await makeTeacher([branch.id]);
    const session = await makeSession({ branchId: branch.id, classId: klass.id, teacherId: teacher.id });

    await expectConstraintViolation(
      ownerDb
        .update(schema.classSessions)
        .set({ status: "cancelled" })
        .where(sql`id = ${session.id}`),
      "class_sessions_cancelled_has_reason",
    );
  });

  it("records a student at most once per session", async () => {
    const branch = await makeBranch({ code: "XM" });
    const klass = await makeClass(branch.id);
    const teacher = await makeTeacher([branch.id]);
    const student = await makeStudent(branch.id, klass.id);
    const session = await makeSession({ branchId: branch.id, classId: klass.id, teacherId: teacher.id });

    const row = {
      sessionId: session.id,
      branchId: branch.id,
      studentId: student.id,
      status: "present" as const,
    };
    await ownerDb.insert(schema.attendanceRecords).values(row);

    await expectConstraintViolation(
      ownerDb.insert(schema.attendanceRecords).values(row),
      "attendance_records_session_student_unique",
    );
  });
});

describe("center_settings is a singleton (PROJECT_PLAN 7.17)", () => {
  it("rejects a second row", async () => {
    await ownerDb.insert(schema.centerSettings).values({ centerName: "مركز أول" });

    // The singleton column is unique and always true, so a second row collides.
    const error = await pgErrorOf(ownerDb.insert(schema.centerSettings).values({ centerName: "مركز ثانٍ" }));
    expect(error.code).toBe(PG_CODE.uniqueViolation);
  });
});

describe("branch code format", () => {
  it("rejects a code that would corrupt student codes", async () => {
    await expectConstraintViolation(
      ownerDb.insert(schema.branches).values({ name: "فرع سيء", code: "bad-code" }),
      "branches_code_format",
    );
  });
});
