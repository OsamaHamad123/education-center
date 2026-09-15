/**
 * Demo data for local development (PROJECT_PLAN Phase 1, task 6).
 *
 * Runs as the OWNER role, which has BYPASSRLS — seeding has to write rows for three
 * different branches in one pass, which no tenant context could do.
 *
 * Idempotent by truncation: `pnpm db:seed` always rebuilds the demo data from
 * scratch, so it can be run repeatedly. It refuses to run against a database that
 * looks like production.
 */
import { hashPassword } from "better-auth/crypto";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { config } from "dotenv";
import postgres from "postgres";
import { addMinutesToTime, DEFAULT_WORKING_DAYS, isoDayOfWeek, todayInCairo } from "@/shared/lib/time";
import { normalizeEgyptianPhone } from "@/shared/lib/phone";
import * as schema from "./schema";

config({ path: ".env", quiet: true });

const ownerUrl = process.env.DATABASE_OWNER_URL;
if (!ownerUrl) throw new Error("DATABASE_OWNER_URL is not set — copy .env.example to .env first.");
if (process.env.NODE_ENV === "production" && process.env.ALLOW_PRODUCTION_SEED !== "1") {
  throw new Error("Refusing to seed a production database. Set ALLOW_PRODUCTION_SEED=1 to override.");
}

const client = postgres(ownerUrl, { max: 1, onnotice: () => {} });
const db = drizzle(client, { schema, casing: "snake_case" });

// ---------------------------------------------------------------------------
// Demo constants
// ---------------------------------------------------------------------------

const DEMO_PASSWORD = "Password123!";
const TEACHER_ACCESS_CODE = "123456";

const BRANCHES = [
  { name: "فرع مدينة نصر", code: "NSR", address: "مدينة نصر، القاهرة", phone: "+201000000001" },
  { name: "فرع العبور", code: "OBR", address: "مدينة العبور، القليوبية", phone: "+201000000002" },
  { name: "فرع الجيزة", code: "GIZ", address: "الدقي، الجيزة", phone: "+201000000003" },
] as const;

const SUBJECTS = [
  "الرياضيات",
  "الفيزياء",
  "الكيمياء",
  "الأحياء",
  "اللغة العربية",
  "اللغة الإنجليزية",
  "التاريخ",
  "الجغرافيا",
] as const;

const SCIENTIFIC_SUBJECTS = ["الرياضيات", "الفيزياء", "الكيمياء", "الأحياء", "اللغة الإنجليزية"] as const;
const LITERARY_SUBJECTS = ["اللغة العربية", "التاريخ", "الجغرافيا", "اللغة الإنجليزية"] as const;

/** Two of these teach in more than one branch — the case branch isolation must survive. */
const TEACHERS = [
  {
    fullName: "أحمد محمود السيد",
    phone: "01011110001",
    specialization: "الرياضيات",
    scientific: 15000,
    literary: 12000,
    branches: ["NSR", "OBR"],
  },
  {
    fullName: "منى عبد الرحمن فؤاد",
    phone: "01011110002",
    specialization: "الفيزياء",
    scientific: 17500,
    literary: 13000,
    branches: ["NSR"],
  },
  {
    fullName: "خالد إبراهيم حسن",
    phone: "01111110003",
    specialization: "الكيمياء",
    scientific: 16000,
    literary: 12500,
    branches: ["OBR", "GIZ"],
  },
  {
    fullName: "سارة طارق عبد الله",
    phone: "01211110004",
    specialization: "اللغة العربية",
    scientific: 11000,
    literary: 14000,
    branches: ["NSR"],
  },
  {
    fullName: "محمد عاطف زكي",
    phone: "01511110005",
    specialization: "اللغة الإنجليزية",
    scientific: 13000,
    literary: 13000,
    branches: ["OBR"],
  },
  {
    fullName: "نهى سامي مصطفى",
    phone: "01011110006",
    specialization: "التاريخ",
    scientific: 10000,
    literary: 12500,
    branches: ["GIZ"],
  },
] as const;

const CLASS_TEMPLATES = [
  { name: "علمي 1 - بنين", track: "scientific", gender: "male" },
  { name: "علمي 2 - بنات", track: "scientific", gender: "female" },
  { name: "أدبي 1 - بنين", track: "literary", gender: "male" },
  { name: "أدبي 2 - بنات", track: "literary", gender: "female" },
] as const;

const GRADE_LEVEL = "الصف الثالث الثانوي";

const MALE_FIRST = [
  "محمد",
  "أحمد",
  "يوسف",
  "عمر",
  "كريم",
  "مصطفى",
  "زياد",
  "حسن",
  "طارق",
  "سيف",
  "عبد الرحمن",
  "أدهم",
  "مازن",
  "فارس",
  "بلال",
];
const FEMALE_FIRST = [
  "فاطمة",
  "مريم",
  "نور",
  "سلمى",
  "هنا",
  "جنى",
  "ملك",
  "رنا",
  "ياسمين",
  "لجين",
  "حبيبة",
  "دينا",
  "آية",
  "سما",
  "تالا",
];
const MIDDLE = ["محمود", "إبراهيم", "سامي", "عادل", "رمضان", "شعبان", "فتحي", "صلاح", "ماهر", "وائل"];
const FAMILY = [
  "عبد العزيز",
  "الشناوي",
  "المصري",
  "الجندي",
  "حجازي",
  "عثمان",
  "قنديل",
  "بدوي",
  "زهران",
  "الفقي",
];

// ---------------------------------------------------------------------------
// Deterministic pseudo-randomness — a reseed produces the same demo data, which
// makes "the number changed" a real signal when verifying reports.
// ---------------------------------------------------------------------------
let seedState = 42;
function nextRandom(): number {
  seedState = (seedState * 1103515245 + 12345) % 2147483648;
  return seedState / 2147483648;
}
function pick<T>(items: readonly T[]): T {
  const item = items[Math.floor(nextRandom() * items.length)];
  if (item === undefined) throw new Error("pick() called with an empty list");
  return item;
}

function daysAgo(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return todayInCairo(date);
}

function requirePhone(raw: string): string {
  const phone = normalizeEgyptianPhone(raw);
  if (!phone) throw new Error(`Seed contains an invalid Egyptian phone: ${raw}`);
  return phone;
}

async function makeUser(args: {
  id: string;
  name: string;
  username: string;
  email: string;
  role: schema.UserRole;
  branchId?: string;
  teacherId?: string;
  password: string;
}) {
  await db.insert(schema.user).values({
    id: args.id,
    name: args.name,
    email: args.email,
    emailVerified: true,
    username: args.username.toLowerCase(),
    displayUsername: args.username,
    role: args.role,
    branchId: args.branchId ?? null,
    teacherId: args.teacherId ?? null,
  });

  await db.insert(schema.account).values({
    id: `acc_${args.id}`,
    accountId: args.id,
    providerId: "credential",
    userId: args.id,
    password: await hashPassword(args.password),
  });
}

async function main() {
  console.log("Resetting demo data…");

  // Order matters only in that the whole set goes at once; CASCADE handles the FKs.
  await db.execute(sql`truncate table
    attendance_records, class_sessions, timetable_slots, branch_breaks,
    branch_schedule_settings, student_enrollments, student_code_counters, students,
    teacher_branches, teacher_rate_history, teachers, classes, subjects,
    audit_logs, lookup_attempts, account, session, verification, "user",
    branches, center_settings
    restart identity cascade`);

  // --- center settings -----------------------------------------------------
  await db.insert(schema.centerSettings).values({
    centerName: "مركز النخبة التعليمي",
    lookupEnabled: true,
    teacherCanMarkAttendance: true,
    attendanceEditWindowDays: 7,
  });

  // --- branches ------------------------------------------------------------
  const branchRows = await db
    .insert(schema.branches)
    .values([...BRANCHES])
    .returning();
  const branchByCode = new Map(branchRows.map((b) => [b.code, b]));

  // --- subjects ------------------------------------------------------------
  const subjectRows = await db
    .insert(schema.subjects)
    .values(SUBJECTS.map((name) => ({ name })))
    .returning();
  const subjectByName = new Map(subjectRows.map((s) => [s.name, s]));

  // --- users: one super admin, one admin per branch -------------------------
  await makeUser({
    id: "usr_super",
    name: "الإدارة العامة",
    username: "admin",
    email: "admin@example.com",
    role: "super_admin",
    password: DEMO_PASSWORD,
  });

  const adminCredentials: { username: string; branch: string }[] = [];
  for (const branch of branchRows) {
    const username = `admin_${branch.code.toLowerCase()}`;
    await makeUser({
      id: `usr_${branch.code.toLowerCase()}`,
      name: `مدير ${branch.name}`,
      username,
      email: `${username}@example.com`,
      role: "branch_admin",
      branchId: branch.id,
      password: DEMO_PASSWORD,
    });
    adminCredentials.push({ username, branch: branch.name });
  }

  // --- teachers ------------------------------------------------------------
  const teacherByName = new Map<string, schema.Teacher>();
  for (const t of TEACHERS) {
    const phone = requirePhone(t.phone);
    const [teacher] = await db
      .insert(schema.teachers)
      .values({
        fullName: t.fullName,
        phone,
        specialization: t.specialization,
        ratePiastersScientific: t.scientific,
        ratePiastersLiterary: t.literary,
      })
      .returning();
    if (!teacher) throw new Error(`Failed to insert teacher ${t.fullName}`);
    teacherByName.set(t.fullName, teacher);

    await db.insert(schema.teacherRateHistory).values({
      teacherId: teacher.id,
      ratePiastersScientific: t.scientific,
      ratePiastersLiterary: t.literary,
      effectiveFrom: daysAgo(90),
      changedBy: "usr_super",
    });

    await db.insert(schema.teacherBranches).values(
      t.branches.map((code) => {
        const branch = branchByCode.get(code);
        if (!branch) throw new Error(`Unknown branch code in seed: ${code}`);
        return { teacherId: teacher.id, branchId: branch.id };
      }),
    );

    // The teacher's username is their phone; the password is the access code (section 9).
    await makeUser({
      id: `usr_t_${teacher.id.slice(0, 8)}`,
      name: t.fullName,
      username: phone,
      email: `${phone.replace("+", "")}@teachers.local`,
      role: "teacher",
      teacherId: teacher.id,
      password: TEACHER_ACCESS_CODE,
    });
  }

  // --- classes, schedule settings, students --------------------------------
  const year = Number(todayInCairo().slice(2, 4));

  for (const branch of branchRows) {
    const classRows = await db
      .insert(schema.classes)
      .values(
        CLASS_TEMPLATES.map((c) => ({
          branchId: branch.id,
          name: c.name,
          track: c.track,
          gender: c.gender,
          gradeLevel: GRADE_LEVEL,
        })),
      )
      .returning();

    // Bell schedule per track, with one break after period 3.
    for (const track of ["scientific", "literary"] as const) {
      const [settings] = await db
        .insert(schema.branchScheduleSettings)
        .values({
          branchId: branch.id,
          track,
          dayStartTime: track === "scientific" ? "08:00" : "09:00",
          periodDurationMin: 45,
          periodsCount: 6,
          workingDays: [...DEFAULT_WORKING_DAYS],
        })
        .returning();
      if (!settings) throw new Error("Failed to insert schedule settings");

      await db.insert(schema.branchBreaks).values({
        settingsId: settings.id,
        afterPeriod: 3,
        durationMin: 20,
        label: "الفسحة",
      });
    }

    // Students: 15 per class, with sequential student codes per branch and year.
    let counter = 0;
    for (const klass of classRows) {
      const template = CLASS_TEMPLATES.find((c) => c.name === klass.name);
      if (!template) throw new Error(`Unknown class template: ${klass.name}`);
      const firstNames = template.gender === "female" ? FEMALE_FIRST : MALE_FIRST;

      for (let i = 0; i < 15; i++) {
        counter += 1;
        const studentCode = `${branch.code}-${String(year).padStart(2, "0")}-${String(counter).padStart(5, "0")}`;
        const fullName = `${firstNames[i % firstNames.length]} ${pick(MIDDLE)} ${pick(MIDDLE)} ${pick(FAMILY)}`;
        const parentPhone = requirePhone(
          `010${String(20000000 + counter + branch.code.charCodeAt(0) * 1000).slice(0, 8)}`,
        );
        const joinDate = daysAgo(120);

        const [student] = await db
          .insert(schema.students)
          .values({
            studentCode,
            fullName,
            parentPhone,
            parentWhatsapp: parentPhone,
            branchId: branch.id,
            classId: klass.id,
            joinDate,
          })
          .returning();
        if (!student) throw new Error(`Failed to insert student ${studentCode}`);

        await db.insert(schema.studentEnrollments).values({
          studentId: student.id,
          branchId: branch.id,
          classId: klass.id,
          startDate: joinDate,
          createdBy: "usr_super",
        });
      }

      await db
        .insert(schema.studentCodeCounters)
        .values({ branchId: branch.id, year, lastValue: counter })
        .onConflictDoUpdate({
          target: [schema.studentCodeCounters.branchId, schema.studentCodeCounters.year],
          set: { lastValue: counter },
        });
    }

    // --- weekly timetable --------------------------------------------------
    for (const klass of classRows) {
      const pool = klass.track === "scientific" ? SCIENTIFIC_SUBJECTS : LITERARY_SUBJECTS;
      const eligible = TEACHERS.filter((t) => t.branches.includes(branch.code as never));

      for (const day of DEFAULT_WORKING_DAYS) {
        for (let period = 1; period <= 4; period++) {
          const subjectName = pool[(period - 1 + day) % pool.length];
          const subject = subjectName ? subjectByName.get(subjectName) : undefined;
          if (!subject) continue;

          // Rotate deterministically so the same teacher is not double-booked.
          const candidate = eligible[(period + day + klass.name.length) % eligible.length];
          if (!candidate) continue;
          const teacher = teacherByName.get(candidate.fullName);
          if (!teacher) continue;

          const dayStart = klass.track === "scientific" ? "08:00" : "09:00";
          const beforeBreak = period <= 3 ? 0 : 20;
          const startTime = addMinutesToTime(dayStart, (period - 1) * 45 + beforeBreak);
          const endTime = addMinutesToTime(startTime, 45);

          // A teacher shared between branches will genuinely clash sometimes; the
          // exclusion constraint is the point, so skip the clash rather than fight it.
          await db
            .insert(schema.timetableSlots)
            .values({
              branchId: branch.id,
              classId: klass.id,
              teacherId: teacher.id,
              subjectId: subject.id,
              dayOfWeek: day,
              periodNumber: period,
              startTime,
              endTime,
            })
            .onConflictDoNothing()
            .catch(() => undefined);
        }
      }
    }
  }

  // --- two weeks of sessions and attendance --------------------------------
  const slots = await db.select().from(schema.timetableSlots);
  const studentsByClass = new Map<string, schema.Student[]>();
  for (const student of await db.select().from(schema.students)) {
    const list = studentsByClass.get(student.classId) ?? [];
    list.push(student);
    studentsByClass.set(student.classId, list);
  }
  const classById = new Map((await db.select().from(schema.classes)).map((c) => [c.id, c]));
  const teacherById = new Map((await db.select().from(schema.teachers)).map((t) => [t.id, t]));
  const subjectById = new Map(subjectRows.map((s) => [s.id, s]));

  let sessionCount = 0;
  let attendanceCount = 0;

  for (let dayOffset = 14; dayOffset >= 1; dayOffset--) {
    const sessionDate = daysAgo(dayOffset);
    const dow = isoDayOfWeek(sessionDate);
    if (!DEFAULT_WORKING_DAYS.includes(dow as (typeof DEFAULT_WORKING_DAYS)[number])) continue;

    for (const slot of slots.filter((s) => s.dayOfWeek === dow)) {
      const klass = classById.get(slot.classId);
      const teacher = teacherById.get(slot.teacherId);
      const subject = subjectById.get(slot.subjectId);
      if (!klass || !teacher || !subject) continue;

      const rate =
        klass.track === "scientific" ? teacher.ratePiastersScientific : teacher.ratePiastersLiterary;

      const [session] = await db
        .insert(schema.classSessions)
        .values({
          branchId: slot.branchId,
          classId: slot.classId,
          teacherId: slot.teacherId,
          timetableSlotId: slot.id,
          subjectName: subject.name,
          sessionDate,
          periodNumber: slot.periodNumber,
          startTime: slot.startTime,
          endTime: slot.endTime,
          trackApplied: klass.track,
          rateAppliedPiasters: rate,
          createdBy: "usr_super",
        })
        .onConflictDoNothing()
        .returning();
      if (!session) continue;
      sessionCount += 1;

      const roster = studentsByClass.get(slot.classId) ?? [];
      if (roster.length === 0) continue;

      await db.insert(schema.attendanceRecords).values(
        roster.map((student) => {
          const roll = nextRandom();
          const status: schema.AttendanceStatus =
            roll > 0.93 ? "absent" : roll > 0.88 ? "late" : roll > 0.86 ? "excused" : "present";
          return {
            sessionId: session.id,
            branchId: slot.branchId,
            studentId: student.id,
            status,
            markedBy: "usr_super",
          };
        }),
      );
      attendanceCount += roster.length;
    }
  }

  const counts = {
    branches: branchRows.length,
    subjects: subjectRows.length,
    teachers: teacherByName.size,
    classes: classById.size,
    students: studentsByClass.size ? [...studentsByClass.values()].flat().length : 0,
    timetableSlots: slots.length,
    sessions: sessionCount,
    attendanceRecords: attendanceCount,
  };

  console.log("\nSeed complete:");
  for (const [key, value] of Object.entries(counts)) console.log(`  ${key.padEnd(16)} ${value}`);

  console.log("\nLogin credentials (development only):");
  console.log(`  الإدارة العامة      admin / ${DEMO_PASSWORD}`);
  for (const admin of adminCredentials) {
    console.log(`  ${admin.branch.padEnd(18)} ${admin.username} / ${DEMO_PASSWORD}`);
  }
  console.log(`\n  المعلمون: اسم المستخدم = رقم الهاتف، كود الدخول = ${TEACHER_ACCESS_CODE}`);
  for (const t of TEACHERS) console.log(`    ${t.fullName.padEnd(24)} ${requirePhone(t.phone)}`);
}

main()
  .then(() => client.end())
  .catch(async (error: unknown) => {
    console.error(error);
    await client.end();
    process.exit(1);
  });
