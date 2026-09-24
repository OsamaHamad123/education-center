import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { applyMigrations, closeConnections, ownerDb, resetDatabase } from "../helpers/db";
import { makeCenterSettings, makeSession, makeTeacher, makeTwoBranches } from "../helpers/factories";
import * as schema from "@/shared/db/schema";
import { expectConstraintViolation, pgErrorOf, PG_CODE } from "../helpers/errors";

/**
 * The three holes `drizzle/0020` closes, asserted against the database rather than
 * against the TypeScript that also guards them.
 *
 * The use case refuses all of this with an Arabic message first. These tests are about
 * what happens when the use case is not the one writing — a second clerk racing the
 * first, or anything that reaches the table by another path. "Prevented" and
 * "not reachable through the application" are different claims, and this product's
 * claim about its ledgers is the first one.
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

/** An extra session — the only kind allowed to make up for anything. */
async function makeExtra(args: {
  branchId: string;
  classId: string;
  teacherId: string;
  periodNumber?: number;
  makesUpSessionId?: string | null;
}) {
  const [row] = await ownerDb
    .insert(schema.classSessions)
    .values({
      branchId: args.branchId,
      classId: args.classId,
      teacherId: args.teacherId,
      subjectName: "الرياضيات",
      sessionDate: "2026-09-16",
      periodNumber: args.periodNumber ?? 7,
      startTime: "14:00",
      endTime: "14:45",
      trackApplied: "scientific",
      rateAppliedPiasters: 15_000,
      isExtra: true,
      makesUpSessionId: args.makesUpSessionId ?? null,
    })
    .returning();
  if (!row) throw new Error("makeExtra failed");
  return row;
}

describe("a make-up lesson", () => {
  it("links to the lesson it makes up for", async () => {
    const missed = await makeSession({
      branchId: fx.branchA.id,
      classId: fx.classA.id,
      teacherId: fx.teacherA.id,
      sessionDate: "2026-09-13",
    });

    const makeUp = await makeExtra({
      branchId: fx.branchA.id,
      classId: fx.classA.id,
      teacherId: fx.teacherA.id,
      makesUpSessionId: missed.id,
    });

    expect(makeUp.makesUpSessionId).toBe(missed.id);
  });

  it("CANNOT make up for a lesson in another branch", async () => {
    // The point of the composite key. A foreign key is not subject to RLS, so the
    // session a branch admin cannot SEE was still a valid target to name — exactly
    // the hole `drizzle/0015` closed for payments.
    const otherBranch = await makeSession({
      branchId: fx.branchB.id,
      classId: fx.classB.id,
      teacherId: fx.teacherB.id,
      sessionDate: "2026-09-13",
    });

    await expectConstraintViolation(
      makeExtra({
        branchId: fx.branchA.id,
        classId: fx.classA.id,
        teacherId: fx.teacherA.id,
        makesUpSessionId: otherBranch.id,
      }),
      "class_sessions_makes_up_branch_fk",
    );
  });

  it("refuses a SECOND make-up for one missed lesson", async () => {
    // Two clerks, one missed lesson, two extra sessions — and the teacher paid twice.
    // The check in the use case loses this race; the index does not.
    const missed = await makeSession({
      branchId: fx.branchA.id,
      classId: fx.classA.id,
      teacherId: fx.teacherA.id,
      sessionDate: "2026-09-13",
    });

    await makeExtra({
      branchId: fx.branchA.id,
      classId: fx.classA.id,
      teacherId: fx.teacherA.id,
      periodNumber: 7,
      makesUpSessionId: missed.id,
    });

    const error = await pgErrorOf(
      makeExtra({
        branchId: fx.branchA.id,
        classId: fx.classA.id,
        teacherId: fx.teacherA.id,
        periodNumber: 8,
        makesUpSessionId: missed.id,
      }),
    );
    expect(error.code).toBe(PG_CODE.uniqueViolation);
    expect(error.message).toMatch(/class_sessions_makes_up_unique/);
  });

  it("allows many extra sessions that make up for nothing", async () => {
    // Null is the normal state, so the unique index has to be partial.
    await makeExtra({
      branchId: fx.branchA.id,
      classId: fx.classA.id,
      teacherId: fx.teacherA.id,
      periodNumber: 7,
    });
    await makeExtra({
      branchId: fx.branchA.id,
      classId: fx.classA.id,
      teacherId: fx.teacherA.id,
      periodNumber: 8,
    });

    const rows = await ownerDb
      .select()
      .from(schema.classSessions)
      .where(eq(schema.classSessions.classId, fx.classA.id));
    expect(rows).toHaveLength(2);
  });

  it("refuses a TIMETABLED lesson that claims to make up for one", async () => {
    const missed = await makeSession({
      branchId: fx.branchA.id,
      classId: fx.classA.id,
      teacherId: fx.teacherA.id,
      sessionDate: "2026-09-13",
    });

    await expectConstraintViolation(
      ownerDb.insert(schema.classSessions).values({
        branchId: fx.branchA.id,
        classId: fx.classA.id,
        teacherId: fx.teacherA.id,
        subjectName: "الرياضيات",
        sessionDate: "2026-09-16",
        periodNumber: 2,
        startTime: "09:00",
        endTime: "09:45",
        trackApplied: "scientific",
        rateAppliedPiasters: 15_000,
        isExtra: false,
        makesUpSessionId: missed.id,
      }),
      "class_sessions_makes_up_is_extra",
    );
  });

  it("cannot make up for itself", async () => {
    const extra = await makeExtra({
      branchId: fx.branchA.id,
      classId: fx.classA.id,
      teacherId: fx.teacherA.id,
    });

    await expectConstraintViolation(
      ownerDb
        .update(schema.classSessions)
        .set({ makesUpSessionId: extra.id })
        .where(eq(schema.classSessions.id, extra.id)),
      "class_sessions_makes_up_not_self",
    );
  });
});

describe("a substituted lesson", () => {
  it("remembers whose lesson it was", async () => {
    const session = await makeSession({
      branchId: fx.branchA.id,
      classId: fx.classA.id,
      teacherId: fx.teacherA.id,
    });

    const cover = await makeTeacher([fx.branchA.id], { fullName: "معلم بديل" });

    const [updated] = await ownerDb
      .update(schema.classSessions)
      .set({ teacherId: cover.id, substitutedFromTeacherId: fx.teacherA.id })
      .where(eq(schema.classSessions.id, session.id))
      .returning();

    expect(updated?.substitutedFromTeacherId).toBe(fx.teacherA.id);
  });

  it("refuses a row that says it was taken from the person teaching it", async () => {
    const session = await makeSession({
      branchId: fx.branchA.id,
      classId: fx.classA.id,
      teacherId: fx.teacherA.id,
    });

    await expectConstraintViolation(
      ownerDb
        .update(schema.classSessions)
        .set({ substitutedFromTeacherId: fx.teacherA.id })
        .where(eq(schema.classSessions.id, session.id)),
      "class_sessions_substitute_differs",
    );
  });
});
