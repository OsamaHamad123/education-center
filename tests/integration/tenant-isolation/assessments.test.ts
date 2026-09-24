import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { applyMigrations, asTenant, closeConnections, ctxFor, ownerDb, resetDatabase } from "../helpers/db";
import {
  makeCenterSettings,
  makeScheduleSettings,
  makeSlot,
  makeSubject,
  makeTeacher,
  makeTwoBranches,
} from "../helpers/factories";
import * as schema from "@/shared/db/schema";
import { expectConstraintViolation, expectRlsViolation, pgErrorOf, PG_CODE } from "../helpers/errors";

/**
 * Marks, and who may touch them (`drizzle/0021`).
 *
 * The teacher arm is the interesting one and it is NARROWER than a branch admin's: a
 * teacher reads and writes their OWN papers in every branch they work in, and nothing
 * else. All of that is a database policy, so it is tested against the app role rather
 * than asserted about the TypeScript that also enforces it.
 */

let fx: Awaited<ReturnType<typeof makeTwoBranches>>;
let subjectId: string;

beforeAll(async () => {
  await applyMigrations();
});

beforeEach(async () => {
  await resetDatabase();
  await makeCenterSettings();
  fx = await makeTwoBranches();
  const subject = await makeSubject("الرياضيات");
  subjectId = subject.id;
});

afterAll(async () => {
  await closeConnections();
});

async function makeAssessment(args: {
  branchId: string;
  classId: string;
  teacherId: string;
  name?: string;
  maxScoreHundredths?: number;
  publishedAt?: Date | null;
}) {
  const [row] = await ownerDb
    .insert(schema.assessments)
    .values({
      branchId: args.branchId,
      classId: args.classId,
      subjectId,
      teacherId: args.teacherId,
      name: args.name ?? "امتحان الشهر",
      kind: "monthly",
      assessedOn: "2026-09-20",
      maxScoreHundredths: args.maxScoreHundredths ?? 2000,
      publishedAt: args.publishedAt ?? null,
    })
    .returning();
  if (!row) throw new Error("makeAssessment failed");
  return row;
}

describe("a branch admin", () => {
  it("sees only their own branch's assessments", async () => {
    await makeAssessment({ branchId: fx.branchA.id, classId: fx.classA.id, teacherId: fx.teacherA.id });
    await makeAssessment({ branchId: fx.branchB.id, classId: fx.classB.id, teacherId: fx.teacherB.id });

    const rows = await asTenant(ctxFor.branchAdmin(fx.branchA.id), (tx) =>
      tx.select().from(schema.assessments),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.branchId).toBe(fx.branchA.id);
  });

  it("CANNOT write an assessment into another branch", async () => {
    await expectRlsViolation(
      asTenant(ctxFor.branchAdmin(fx.branchA.id), (tx) =>
        tx.insert(schema.assessments).values({
          branchId: fx.branchB.id,
          classId: fx.classB.id,
          subjectId,
          teacherId: fx.teacherB.id,
          name: "امتحان",
          kind: "quiz",
          assessedOn: "2026-09-20",
          maxScoreHundredths: 1000,
        }),
      ),
    );
  });

  it("sees only their own branch's marks", async () => {
    const mine = await makeAssessment({
      branchId: fx.branchA.id,
      classId: fx.classA.id,
      teacherId: fx.teacherA.id,
    });
    const theirs = await makeAssessment({
      branchId: fx.branchB.id,
      classId: fx.classB.id,
      teacherId: fx.teacherB.id,
    });
    await ownerDb.insert(schema.assessmentScores).values([
      {
        assessmentId: mine.id,
        branchId: fx.branchA.id,
        studentId: fx.studentA.id,
        scoreHundredths: 1500,
        maxScoreHundredths: 2000,
      },
      {
        assessmentId: theirs.id,
        branchId: fx.branchB.id,
        studentId: fx.studentB.id,
        scoreHundredths: 1800,
        maxScoreHundredths: 2000,
      },
    ]);

    const rows = await asTenant(ctxFor.branchAdmin(fx.branchA.id), (tx) =>
      tx.select().from(schema.assessmentScores),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.studentId).toBe(fx.studentA.id);
  });
});

describe("a teacher", () => {
  it("sees their OWN assessments and not a colleague's", async () => {
    const other = await makeTeacher([fx.branchA.id], { fullName: "معلم آخر" });
    await makeAssessment({ branchId: fx.branchA.id, classId: fx.classA.id, teacherId: fx.teacherA.id });
    await makeAssessment({
      branchId: fx.branchA.id,
      classId: fx.classA.id,
      teacherId: other.id,
      name: "امتحان زميل",
    });

    const rows = await asTenant(ctxFor.teacher(fx.teacherA.id), (tx) => tx.select().from(schema.assessments));
    // Same branch, same class, same day. The only difference is whose paper it is.
    expect(rows).toHaveLength(1);
    expect(rows[0]?.teacherId).toBe(fx.teacherA.id);
  });

  it("CANNOT create an assessment for a class they do not teach", async () => {
    // Without the timetable check in `assessments_insert`, a teacher could open a
    // paper for any class in a branch they work in, and hold the marks of children
    // they have never met.
    await expectRlsViolation(
      asTenant(ctxFor.teacher(fx.teacherA.id), (tx) =>
        tx.insert(schema.assessments).values({
          branchId: fx.branchA.id,
          classId: fx.classA.id,
          subjectId,
          teacherId: fx.teacherA.id,
          name: "امتحان",
          kind: "quiz",
          assessedOn: "2026-09-20",
          maxScoreHundredths: 1000,
        }),
      ),
    );
  });

  it("CAN create one for a class on their own timetable", async () => {
    await makeScheduleSettings({ branchId: fx.branchA.id, track: "scientific" });
    await makeSlot({
      branchId: fx.branchA.id,
      classId: fx.classA.id,
      teacherId: fx.teacherA.id,
      subjectId,
    });

    const rows = await asTenant(ctxFor.teacher(fx.teacherA.id), (tx) =>
      tx
        .insert(schema.assessments)
        .values({
          branchId: fx.branchA.id,
          classId: fx.classA.id,
          subjectId,
          teacherId: fx.teacherA.id,
          name: "اختبار قصير",
          kind: "quiz",
          assessedOn: "2026-09-20",
          maxScoreHundredths: 1000,
        })
        .returning(),
    );
    expect(rows).toHaveLength(1);
  });

  it("CANNOT create one in another teacher's name", async () => {
    await makeScheduleSettings({ branchId: fx.branchA.id, track: "scientific" });
    await makeSlot({
      branchId: fx.branchA.id,
      classId: fx.classA.id,
      teacherId: fx.teacherA.id,
      subjectId,
    });
    const other = await makeTeacher([fx.branchA.id], { fullName: "معلم آخر" });

    await expectRlsViolation(
      asTenant(ctxFor.teacher(fx.teacherA.id), (tx) =>
        tx.insert(schema.assessments).values({
          branchId: fx.branchA.id,
          classId: fx.classA.id,
          subjectId,
          teacherId: other.id,
          name: "امتحان",
          kind: "quiz",
          assessedOn: "2026-09-20",
          maxScoreHundredths: 1000,
        }),
      ),
    );
  });

  it("CANNOT write a mark on a colleague's paper", async () => {
    const other = await makeTeacher([fx.branchA.id], { fullName: "معلم آخر" });
    const theirs = await makeAssessment({
      branchId: fx.branchA.id,
      classId: fx.classA.id,
      teacherId: other.id,
    });

    await expectRlsViolation(
      asTenant(ctxFor.teacher(fx.teacherA.id), (tx) =>
        tx.insert(schema.assessmentScores).values({
          assessmentId: theirs.id,
          branchId: fx.branchA.id,
          studentId: fx.studentA.id,
          scoreHundredths: 2000,
          maxScoreHundredths: 2000,
        }),
      ),
    );
  });
});

describe("the marks themselves", () => {
  it("refuse 25 out of 20", async () => {
    const assessment = await makeAssessment({
      branchId: fx.branchA.id,
      classId: fx.classA.id,
      teacherId: fx.teacherA.id,
    });

    await expectConstraintViolation(
      ownerDb.insert(schema.assessmentScores).values({
        assessmentId: assessment.id,
        branchId: fx.branchA.id,
        studentId: fx.studentA.id,
        scoreHundredths: 2500,
        maxScoreHundredths: 2000,
      }),
      "assessment_scores_in_range",
    );
  });

  it("refuse an absence that also carries a mark", async () => {
    const assessment = await makeAssessment({
      branchId: fx.branchA.id,
      classId: fx.classA.id,
      teacherId: fx.teacherA.id,
    });

    await expectConstraintViolation(
      ownerDb.insert(schema.assessmentScores).values({
        assessmentId: assessment.id,
        branchId: fx.branchA.id,
        studentId: fx.studentA.id,
        scoreHundredths: 1500,
        didNotSit: true,
        maxScoreHundredths: 2000,
      }),
      "assessment_scores_absent_xor_score",
    );
  });

  it("refuse neither a mark nor an absence", async () => {
    const assessment = await makeAssessment({
      branchId: fx.branchA.id,
      classId: fx.classA.id,
      teacherId: fx.teacherA.id,
    });

    await expectConstraintViolation(
      ownerDb.insert(schema.assessmentScores).values({
        assessmentId: assessment.id,
        branchId: fx.branchA.id,
        studentId: fx.studentA.id,
        scoreHundredths: null,
        didNotSit: false,
        maxScoreHundredths: 2000,
      }),
      "assessment_scores_absent_xor_score",
    );
  });

  it("CANNOT be attached to another branch's assessment", async () => {
    // The composite key, for the reason `drizzle/0015` spells out: foreign keys are
    // not subject to RLS, so the paper a branch admin cannot SEE is still a valid
    // target to name.
    const theirs = await makeAssessment({
      branchId: fx.branchB.id,
      classId: fx.classB.id,
      teacherId: fx.teacherB.id,
    });

    await expectConstraintViolation(
      ownerDb.insert(schema.assessmentScores).values({
        assessmentId: theirs.id,
        branchId: fx.branchA.id,
        studentId: fx.studentA.id,
        scoreHundredths: 1500,
        maxScoreHundredths: 2000,
      }),
      "assessment_scores_assessment_branch_fk",
    );
  });

  it("allow one row per student per paper and no more", async () => {
    const assessment = await makeAssessment({
      branchId: fx.branchA.id,
      classId: fx.classA.id,
      teacherId: fx.teacherA.id,
    });
    const row = {
      assessmentId: assessment.id,
      branchId: fx.branchA.id,
      studentId: fx.studentA.id,
      scoreHundredths: 1500,
      maxScoreHundredths: 2000,
    };
    await ownerDb.insert(schema.assessmentScores).values(row);

    const error = await pgErrorOf(ownerDb.insert(schema.assessmentScores).values(row));
    expect(error.code).toBe(PG_CODE.uniqueViolation);
  });

  it("keep the total they were marked out of when the paper's changes", async () => {
    // The snapshot. A parent shown 15/20 must not later see 15/40 because somebody
    // corrected the exam's header.
    const assessment = await makeAssessment({
      branchId: fx.branchA.id,
      classId: fx.classA.id,
      teacherId: fx.teacherA.id,
    });
    await ownerDb.insert(schema.assessmentScores).values({
      assessmentId: assessment.id,
      branchId: fx.branchA.id,
      studentId: fx.studentA.id,
      scoreHundredths: 1500,
      maxScoreHundredths: 2000,
    });

    await ownerDb
      .update(schema.assessments)
      .set({ maxScoreHundredths: 4000 })
      .where(eq(schema.assessments.id, assessment.id));

    const [score] = await ownerDb.select().from(schema.assessmentScores);
    expect(score?.maxScoreHundredths).toBe(2000);
  });

  it("cannot be deleted by the app role — this product corrects, it does not erase", async () => {
    const assessment = await makeAssessment({
      branchId: fx.branchA.id,
      classId: fx.classA.id,
      teacherId: fx.teacherA.id,
    });
    await ownerDb.insert(schema.assessmentScores).values({
      assessmentId: assessment.id,
      branchId: fx.branchA.id,
      studentId: fx.studentA.id,
      scoreHundredths: 1500,
      maxScoreHundredths: 2000,
    });

    const error = await pgErrorOf(
      asTenant(ctxFor.branchAdmin(fx.branchA.id), (tx) => tx.delete(schema.assessmentScores)),
    );
    expect(error.code).toBe(PG_CODE.insufficientPrivilege);
  });
});

describe("app_portal_grades", () => {
  const SALT = "test-salt";

  async function gradesFor(studentId: string, hash: string) {
    const rows = await ownerDb.execute<{ grades: { marks: unknown[] } | null }>(
      sql`select app_portal_grades(${studentId}::uuid, ${hash}, ${SALT}) as grades`,
    );
    return rows[0]?.grades ?? null;
  }

  async function hashOf(phone: string): Promise<string> {
    const rows = await ownerDb.execute<{ hash: string }>(
      sql`select encode(digest(${SALT} || ':' || ${phone}, 'sha256'), 'hex') as hash`,
    );
    if (!rows[0]) throw new Error("hashOf failed");
    return rows[0].hash;
  }

  async function openThePortal() {
    await ownerDb.update(schema.centerSettings).set({ lookupEnabled: true, portalEnabled: true });
    await ownerDb.update(schema.branches).set({ portalEnabled: true });
  }

  it("returns a PUBLISHED mark to the child's own parent", async () => {
    await openThePortal();
    const assessment = await makeAssessment({
      branchId: fx.branchA.id,
      classId: fx.classA.id,
      teacherId: fx.teacherA.id,
      publishedAt: new Date(),
    });
    await ownerDb.insert(schema.assessmentScores).values({
      assessmentId: assessment.id,
      branchId: fx.branchA.id,
      studentId: fx.studentA.id,
      scoreHundredths: 1500,
      maxScoreHundredths: 2000,
    });

    const grades = await gradesFor(fx.studentA.id, await hashOf(fx.studentA.parentPhone));
    expect(grades?.marks).toHaveLength(1);
  });

  it("HIDES an unpublished one — the single most important row in this file", async () => {
    await openThePortal();
    const assessment = await makeAssessment({
      branchId: fx.branchA.id,
      classId: fx.classA.id,
      teacherId: fx.teacherA.id,
      publishedAt: null,
    });
    await ownerDb.insert(schema.assessmentScores).values({
      assessmentId: assessment.id,
      branchId: fx.branchA.id,
      studentId: fx.studentA.id,
      scoreHundredths: 1500,
      maxScoreHundredths: 2000,
    });

    const grades = await gradesFor(fx.studentA.id, await hashOf(fx.studentA.parentPhone));
    expect(grades?.marks).toEqual([]);
  });

  it("hides an ARCHIVED paper even when it was published", async () => {
    await openThePortal();
    const assessment = await makeAssessment({
      branchId: fx.branchA.id,
      classId: fx.classA.id,
      teacherId: fx.teacherA.id,
      publishedAt: new Date(),
    });
    await ownerDb.insert(schema.assessmentScores).values({
      assessmentId: assessment.id,
      branchId: fx.branchA.id,
      studentId: fx.studentA.id,
      scoreHundredths: 1500,
      maxScoreHundredths: 2000,
    });
    await ownerDb
      .update(schema.assessments)
      .set({ isActive: false })
      .where(eq(schema.assessments.id, assessment.id));

    const grades = await gradesFor(fx.studentA.id, await hashOf(fx.studentA.parentPhone));
    expect(grades?.marks).toEqual([]);
  });

  it("refuses a parent asking about somebody else's child", async () => {
    await openThePortal();
    const grades = await gradesFor(fx.studentB.id, await hashOf(fx.studentA.parentPhone));
    // Null, not an empty list: the same answer a tampered id gets.
    expect(grades).toBeNull();
  });

  it("refuses everybody while the centre's portal is switched off", async () => {
    // Switched off EXPLICITLY: the integration factories open the portal by default
    // so the other portal suites do not have to, while `drizzle/0011` defaults both
    // switches to false in a real database. P7 made that gate the whole rollout, and
    // this asserts marks are behind it like everything else.
    await openThePortal();
    await ownerDb.update(schema.centerSettings).set({ portalEnabled: false });

    const assessment = await makeAssessment({
      branchId: fx.branchA.id,
      classId: fx.classA.id,
      teacherId: fx.teacherA.id,
      publishedAt: new Date(),
    });
    await ownerDb.insert(schema.assessmentScores).values({
      assessmentId: assessment.id,
      branchId: fx.branchA.id,
      studentId: fx.studentA.id,
      scoreHundredths: 1500,
      maxScoreHundredths: 2000,
    });

    const grades = await gradesFor(fx.studentA.id, await hashOf(fx.studentA.parentPhone));
    expect(grades).toBeNull();
  });

  it("says nothing about the class — no average, no rank, no other child", async () => {
    await openThePortal();
    const assessment = await makeAssessment({
      branchId: fx.branchA.id,
      classId: fx.classA.id,
      teacherId: fx.teacherA.id,
      publishedAt: new Date(),
    });
    await ownerDb.insert(schema.assessmentScores).values([
      {
        assessmentId: assessment.id,
        branchId: fx.branchA.id,
        studentId: fx.studentA.id,
        scoreHundredths: 1500,
        maxScoreHundredths: 2000,
      },
    ]);

    const grades = await gradesFor(fx.studentA.id, await hashOf(fx.studentA.parentPhone));
    const payload = JSON.stringify(grades);
    expect(Object.keys(grades ?? {})).toEqual(["marks"]);
    expect(payload).not.toMatch(/average|rank|classAverage/i);
  });
});
