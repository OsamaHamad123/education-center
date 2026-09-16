import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { applyMigrations, appDb, closeConnections, ownerDb, resetDatabase } from "../helpers/db";
import {
  makeAttendance,
  makeCenterSettings,
  makeSession,
  makeStudent,
  makeTwoBranches,
} from "../helpers/factories";
import * as schema from "@/shared/db/schema";
import { todayInCairo } from "@/shared/lib/time";

/**
 * The public lookup (PROJECT_PLAN 10.8) — one test per attack scenario.
 *
 * This is the only query reachable without a session, so it is tested the way an
 * attacker would probe it rather than the way a parent would use it:
 *
 *   1. Can a student code be ENUMERATED? (different answers for "no such code" and
 *      "wrong digits" would confirm which codes exist)
 *   2. Can the four digits be BRUTE-FORCED? (the rate limiter's job, tested here as
 *      the counters the limiter reads)
 *   3. Does a legitimate answer OVER-EXPOSE? (a phone, a full name, another student)
 *   4. Does turning the feature OFF actually close the data path?
 *
 * Everything runs on `appDb` with NO tenant context at all — exactly the connection
 * state an anonymous request has.
 */

let fx: Awaited<ReturnType<typeof makeTwoBranches>>;
let student: Awaited<ReturnType<typeof makeStudent>>;
const TODAY = todayInCairo();
const RANGE = { from: "2000-01-01", to: "2100-01-01" };

beforeAll(async () => {
  await applyMigrations();
});

beforeEach(async () => {
  await resetDatabase();
  await makeCenterSettings();
  fx = await makeTwoBranches();
  student = await makeStudent(fx.branchA.id, fx.classA.id, {
    studentCode: "AAA-26-00777",
    fullName: "محمد شعبان الفقي",
    parentPhone: "+201012348001",
  });
});

afterAll(async () => {
  await closeConnections();
});

type LookupDoc = {
  firstName: string;
  familyInitial: string;
  branchName: string;
  className: string;
  timetable: unknown[];
  termCounts: Record<string, number>;
  monthCounts: Record<string, number>;
  absences: unknown[];
} | null;

/** Exactly what an anonymous request does: no role, no branch, no teacher. */
async function lookup(code: string, lastFour: string): Promise<LookupDoc> {
  const rows = await appDb.execute(
    sql`select app_public_lookup(${code}, ${lastFour}, ${RANGE.from}::date, ${RANGE.to}::date) as doc`,
  );
  return (rows[0] as { doc: LookupDoc }).doc;
}

describe("1. code enumeration", () => {
  it("answers a WRONG CODE and WRONG DIGITS identically", async () => {
    const unknownCode = await lookup("AAA-26-99999", "8001");
    const wrongDigits = await lookup("AAA-26-00777", "9999");

    // Both null, so nothing distinguishes "this code exists" from "it does not".
    expect(unknownCode).toBeNull();
    expect(wrongDigits).toBeNull();
    expect(unknownCode).toEqual(wrongDigits);
  });

  it("refuses a code from another branch just as blankly", async () => {
    // Branch isolation is not the point here — a parent legitimately looks up a
    // student in whichever branch they attend. The point is that a WRONG guess is
    // indistinguishable whichever branch it would have belonged to.
    expect(await lookup("BBB-26-00001", "8001")).toBeNull();
  });

  it("does not leak through a SQL wildcard in the code", async () => {
    // The code is compared with `=`, not `like`, so a wildcard is just a wrong code.
    expect(await lookup("%", "8001")).toBeNull();
    expect(await lookup("AAA-26-%", "8001")).toBeNull();
  });
});

describe("2. brute force of the last four digits", () => {
  it("accepts only the exact four digits", async () => {
    expect(await lookup("AAA-26-00777", "8001")).not.toBeNull();

    for (const guess of ["8000", "8002", "800", "80011", "", "0000"]) {
      expect(await lookup("AAA-26-00777", guess)).toBeNull();
    }
  });

  it("counts failures by IP and by CODE in separate windows", async () => {
    // Three failures from one address, and two more from different addresses against
    // the same code — the distributed attack a per-IP limit alone would never see.
    for (const [ipHash, code] of [
      ["ip-one", "AAA-26-00777"],
      ["ip-one", "AAA-26-00777"],
      ["ip-one", "AAA-26-00778"],
      ["ip-two", "AAA-26-00777"],
      ["ip-three", "AAA-26-00777"],
    ] as const) {
      await appDb.insert(schema.lookupAttempts).values({ ipHash, studentCode: code, success: false });
    }
    // A SUCCESS must not count towards either limit.
    await appDb
      .insert(schema.lookupAttempts)
      .values({ ipHash: "ip-one", studentCode: "AAA-26-00777", success: true });

    const rows = await appDb.execute(
      sql`select * from app_lookup_failures('ip-one', 'AAA-26-00777', '15 minutes'::interval, '60 minutes'::interval)`,
    );
    const counts = rows[0] as { by_ip: number; by_code: number };

    expect(counts.by_ip).toBe(3);
    // Four different addresses tried this one child's code.
    expect(counts.by_code).toBe(4);
  });

  it("forgets failures once their window has passed", async () => {
    await ownerDb.insert(schema.lookupAttempts).values({
      ipHash: "ip-old",
      studentCode: "AAA-26-00777",
      success: false,
      createdAt: new Date(Date.now() - 30 * 60 * 1000),
    });

    const rows = await appDb.execute(
      sql`select * from app_lookup_failures('ip-old', 'AAA-26-00777', '15 minutes'::interval, '60 minutes'::interval)`,
    );
    const counts = rows[0] as { by_ip: number; by_code: number };

    // Half an hour old: outside the 15-minute IP window, inside the hour for the code.
    expect(counts.by_ip).toBe(0);
    expect(counts.by_code).toBe(1);
  });
});

describe("3. over-exposure to a legitimate caller", () => {
  it("returns the first name and a family INITIAL, never the full name", async () => {
    const doc = await lookup("AAA-26-00777", "8001");

    expect(doc?.firstName).toBe("محمد");
    expect(doc?.familyInitial).toBe("ا");
    // The full name is never assembled anywhere in the document.
    expect(JSON.stringify(doc)).not.toContain("شعبان");
    expect(JSON.stringify(doc)).not.toContain("الفقي");
  });

  it("carries NO phone number and NO student id", async () => {
    const doc = await lookup("AAA-26-00777", "8001");
    const text = JSON.stringify(doc);

    expect(text).not.toContain("201012348001");
    expect(text).not.toContain("8001");
    expect(text).not.toContain(student.id);
    expect(text).not.toContain("AAA-26-00777");
  });

  it("carries no other student", async () => {
    await makeStudent(fx.branchA.id, fx.classA.id, {
      studentCode: "AAA-26-00888",
      fullName: "زميل في نفس الشعبة",
      parentPhone: "+201012349002",
    });

    const doc = await lookup("AAA-26-00777", "8001");
    expect(JSON.stringify(doc)).not.toContain("زميل");
  });

  it("gives the branch and class names, which the parent already knows", async () => {
    const doc = await lookup("AAA-26-00777", "8001");

    expect(doc?.branchName).toBe("فرع أ");
    expect(doc?.className).toBe("شعبة أ");
  });

  it("counts attendance, and EXCLUDES a cancelled lesson", async () => {
    const live = await makeSession({
      branchId: fx.branchA.id,
      classId: fx.classA.id,
      teacherId: fx.teacherA.id,
      periodNumber: 1,
      sessionDate: TODAY,
    });
    const dead = await makeSession({
      branchId: fx.branchA.id,
      classId: fx.classA.id,
      teacherId: fx.teacherA.id,
      periodNumber: 2,
      sessionDate: TODAY,
    });
    await makeAttendance({ sessionId: live.id, branchId: fx.branchA.id, studentId: student.id });
    await makeAttendance({
      sessionId: dead.id,
      branchId: fx.branchA.id,
      studentId: student.id,
      status: "absent",
    });
    await ownerDb
      .update(schema.classSessions)
      .set({ status: "cancelled", cancelReason: "غياب المعلم" })
      .where(sql`id = ${dead.id}`);

    const doc = await lookup("AAA-26-00777", "8001");

    // The absence was against a lesson that never happened, so the parent is not
    // told their child missed it (rule 10.5).
    expect(doc?.termCounts).toMatchObject({ present: 1, absent: 0 });
    expect(doc?.absences).toEqual([]);
  });

  it("refuses an ARCHIVED student — a departed record is not publicly live", async () => {
    await ownerDb
      .update(schema.students)
      .set({ status: "archived", leftDate: TODAY, leaveReason: "انتقل" })
      .where(sql`id = ${student.id}`);

    expect(await lookup("AAA-26-00777", "8001")).toBeNull();
  });
});

describe("4. the feature switch", () => {
  it("closes the DATA PATH, not just the page", async () => {
    await ownerDb.update(schema.centerSettings).set({ lookupEnabled: false });

    // Even a correct code and correct digits get nothing: the check is inside the
    // function, so no route, form or link can route around it.
    expect(await lookup("AAA-26-00777", "8001")).toBeNull();

    await ownerDb.update(schema.centerSettings).set({ lookupEnabled: true });
    expect(await lookup("AAA-26-00777", "8001")).not.toBeNull();
  });
});

describe("the floor underneath it", () => {
  it("still refuses an anonymous request that tries to read the tables directly", async () => {
    // The function is the one narrow hole. Everything else remains closed for a
    // connection with no `app.user_role` at all.
    const students = await appDb.select().from(schema.students);
    const attendance = await appDb.select().from(schema.attendanceRecords);
    const slots = await appDb.select().from(schema.timetableSlots);

    expect(students).toEqual([]);
    expect(attendance).toEqual([]);
    expect(slots).toEqual([]);
  });
});
