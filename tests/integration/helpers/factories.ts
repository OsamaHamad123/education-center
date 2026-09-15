import * as schema from "@/shared/db/schema";
import { todayInCairo } from "@/shared/lib/time";
import { ownerDb } from "./db";

/**
 * Fixtures are created through the OWNER connection so a single test can set up two
 * branches at once. What the test then asserts always goes through the app role.
 */

let counter = 0;
const uniq = () => (counter += 1);

/** 1 → "B", 27 → "BB" … keeps generated branch codes inside ^[A-Z]{2,5}$. */
function toLetters(n: number): string {
  let rest = n;
  let out = "";
  do {
    out = String.fromCharCode(65 + (rest % 26)) + out;
    rest = Math.floor(rest / 26);
  } while (rest > 0);
  return out;
}

export async function makeBranch(overrides: Partial<schema.NewBranch> = {}) {
  const n = uniq();
  const [branch] = await ownerDb
    .insert(schema.branches)
    .values({
      name: overrides.name ?? `فرع اختبار ${n}`,
      // The code must match ^[A-Z]{2,5}$ — letters only, so the counter is spelled
      // in letters rather than digits.
      code: overrides.code ?? `Z${toLetters(n)}`.slice(0, 5),
      isActive: overrides.isActive ?? true,
      ...overrides,
    })
    .returning();
  if (!branch) throw new Error("makeBranch failed");
  return branch;
}

export async function makeClass(branchId: string, overrides: Partial<schema.NewClass> = {}) {
  const n = uniq();
  const [klass] = await ownerDb
    .insert(schema.classes)
    .values({
      branchId,
      name: overrides.name ?? `شعبة ${n}`,
      track: overrides.track ?? "scientific",
      gender: overrides.gender ?? "mixed",
      gradeLevel: overrides.gradeLevel ?? "الصف الثالث الثانوي",
      ...overrides,
    })
    .returning();
  if (!klass) throw new Error("makeClass failed");
  return klass;
}

export async function makeSubject(name?: string) {
  const [subject] = await ownerDb
    .insert(schema.subjects)
    .values({ name: name ?? `مادة ${uniq()}` })
    .returning();
  if (!subject) throw new Error("makeSubject failed");
  return subject;
}

export async function makeTeacher(branchIds: string[] = [], overrides: Partial<schema.NewTeacher> = {}) {
  const n = uniq();
  const [teacher] = await ownerDb
    .insert(schema.teachers)
    .values({
      fullName: overrides.fullName ?? `معلم اختبار ${n}`,
      phone: overrides.phone ?? `+2010${String(10_000_000 + n).slice(0, 8)}`,
      ratePiastersScientific: overrides.ratePiastersScientific ?? 15_000,
      ratePiastersLiterary: overrides.ratePiastersLiterary ?? 12_000,
      ...overrides,
    })
    .returning();
  if (!teacher) throw new Error("makeTeacher failed");

  if (branchIds.length > 0) {
    await ownerDb
      .insert(schema.teacherBranches)
      .values(branchIds.map((branchId) => ({ teacherId: teacher.id, branchId })));
  }
  return teacher;
}

export async function makeStudent(
  branchId: string,
  classId: string,
  overrides: Partial<schema.NewStudent> = {},
) {
  const n = uniq();
  const [student] = await ownerDb
    .insert(schema.students)
    .values({
      studentCode: overrides.studentCode ?? `TST-26-${String(n).padStart(5, "0")}`,
      fullName: overrides.fullName ?? `طالب اختبار ${n}`,
      parentPhone: overrides.parentPhone ?? `+2010${String(20_000_000 + n).slice(0, 8)}`,
      branchId,
      classId,
      joinDate: overrides.joinDate ?? todayInCairo(),
      ...overrides,
    })
    .returning();
  if (!student) throw new Error("makeStudent failed");

  await ownerDb.insert(schema.studentEnrollments).values({
    studentId: student.id,
    branchId,
    classId,
    startDate: student.joinDate,
  });
  return student;
}

export async function makeSession(args: {
  branchId: string;
  classId: string;
  teacherId: string;
  sessionDate?: string;
  periodNumber?: number;
  ratePiasters?: number;
  track?: schema.Track;
}) {
  const [session] = await ownerDb
    .insert(schema.classSessions)
    .values({
      branchId: args.branchId,
      classId: args.classId,
      teacherId: args.teacherId,
      subjectName: "الرياضيات",
      sessionDate: args.sessionDate ?? todayInCairo(),
      periodNumber: args.periodNumber ?? 1,
      startTime: "08:00",
      endTime: "08:45",
      trackApplied: args.track ?? "scientific",
      rateAppliedPiasters: args.ratePiasters ?? 15_000,
    })
    .returning();
  if (!session) throw new Error("makeSession failed");
  return session;
}

export async function makeAttendance(args: {
  sessionId: string;
  branchId: string;
  studentId: string;
  status?: schema.AttendanceStatus;
}) {
  const [record] = await ownerDb
    .insert(schema.attendanceRecords)
    .values({
      sessionId: args.sessionId,
      branchId: args.branchId,
      studentId: args.studentId,
      status: args.status ?? "present",
    })
    .returning();
  if (!record) throw new Error("makeAttendance failed");
  return record;
}

export async function makeCenterSettings(overrides: { teacherCanMarkAttendance?: boolean } = {}) {
  const [settings] = await ownerDb
    .insert(schema.centerSettings)
    .values({
      centerName: "مركز اختبار",
      teacherCanMarkAttendance: overrides.teacherCanMarkAttendance ?? true,
    })
    .returning();
  if (!settings) throw new Error("makeCenterSettings failed");
  return settings;
}

export async function makeScheduleSettings(args: {
  branchId: string;
  track?: schema.Track;
  dayStartTime?: string;
  periodDurationMin?: number;
  periodsCount?: number;
  workingDays?: number[];
  breaks?: { afterPeriod: number; durationMin: number; label?: string }[];
}) {
  const [settings] = await ownerDb
    .insert(schema.branchScheduleSettings)
    .values({
      branchId: args.branchId,
      track: args.track ?? "scientific",
      dayStartTime: args.dayStartTime ?? "08:00",
      periodDurationMin: args.periodDurationMin ?? 45,
      periodsCount: args.periodsCount ?? 6,
      workingDays: args.workingDays ?? [6, 7, 1, 2, 3, 4],
    })
    .returning();
  if (!settings) throw new Error("makeScheduleSettings failed");

  for (const item of args.breaks ?? []) {
    await ownerDb.insert(schema.branchBreaks).values({
      settingsId: settings.id,
      afterPeriod: item.afterPeriod,
      durationMin: item.durationMin,
      label: item.label ?? "الفسحة",
    });
  }
  return settings;
}

export async function makeSlot(args: {
  branchId: string;
  classId: string;
  teacherId: string;
  subjectId: string;
  dayOfWeek?: number;
  periodNumber?: number;
  startTime?: string;
  endTime?: string;
}) {
  const [slot] = await ownerDb
    .insert(schema.timetableSlots)
    .values({
      branchId: args.branchId,
      classId: args.classId,
      teacherId: args.teacherId,
      subjectId: args.subjectId,
      dayOfWeek: args.dayOfWeek ?? 6,
      periodNumber: args.periodNumber ?? 1,
      startTime: args.startTime ?? "08:00",
      endTime: args.endTime ?? "08:45",
    })
    .returning();
  if (!slot) throw new Error("makeSlot failed");
  return slot;
}

/**
 * Two branches, each with a class, a student and a teacher — the arrangement almost
 * every isolation test needs.
 */
export async function makeTwoBranches() {
  const branchA = await makeBranch({ name: "فرع أ", code: "AAA" });
  const branchB = await makeBranch({ name: "فرع ب", code: "BBB" });

  const classA = await makeClass(branchA.id, { name: "شعبة أ" });
  const classB = await makeClass(branchB.id, { name: "شعبة ب" });

  const studentA = await makeStudent(branchA.id, classA.id, { studentCode: "AAA-26-00001" });
  const studentB = await makeStudent(branchB.id, classB.id, { studentCode: "BBB-26-00001" });

  const teacherA = await makeTeacher([branchA.id], { fullName: "معلم أ" });
  const teacherB = await makeTeacher([branchB.id], { fullName: "معلم ب" });

  return { branchA, branchB, classA, classB, studentA, studentB, teacherA, teacherB };
}
