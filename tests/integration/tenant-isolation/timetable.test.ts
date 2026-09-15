import { sql } from "drizzle-orm";
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
import { expectConstraintViolation, expectRlsViolation } from "../helpers/errors";

/**
 * Timetable isolation (PROJECT_PLAN 7.10–7.12, 10.4).
 *
 * Two guarantees are under test here, and they are different in kind:
 *
 *   1. RLS — a branch admin reads and writes only their own branch's grid.
 *   2. `no_teacher_overlap` — a teacher cannot be in two classrooms at once, ACROSS
 *      branches, even though neither branch can see the other's rows. That constraint
 *      is the only thing standing between "isolated" and "wrong".
 *
 * And one that is neither: `app_timetable_conflicts` has to explain a clash it can see
 * to a caller who may not. What it refuses to say is asserted below, character by
 * character, because a leak there is a leak of another branch's entire timetable.
 */

let fx: Awaited<ReturnType<typeof makeTwoBranches>>;
let subject: Awaited<ReturnType<typeof makeSubject>>;

beforeAll(async () => {
  await applyMigrations();
});

beforeEach(async () => {
  await resetDatabase();
  await makeCenterSettings();
  fx = await makeTwoBranches();
  subject = await makeSubject("الرياضيات");
});

afterAll(async () => {
  await closeConnections();
});

describe("the bell schedule", () => {
  it("is readable only inside its own branch", async () => {
    await makeScheduleSettings({ branchId: fx.branchA.id });
    await makeScheduleSettings({ branchId: fx.branchB.id, dayStartTime: "09:00" });

    const rows = await asTenant(ctxFor.branchAdmin(fx.branchA.id), (tx) =>
      tx.select().from(schema.branchScheduleSettings),
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.branchId).toBe(fx.branchA.id);
  });

  it("hides another branch's breaks, which are only reachable through its settings", async () => {
    const settingsB = await makeScheduleSettings({
      branchId: fx.branchB.id,
      breaks: [{ afterPeriod: 3, durationMin: 20 }],
    });

    const rows = await asTenant(ctxFor.branchAdmin(fx.branchA.id), (tx) =>
      tx
        .select()
        .from(schema.branchBreaks)
        .where(sql`settings_id = ${settingsB.id}`),
    );

    expect(rows).toEqual([]);
  });

  it("refuses to let a branch admin configure another branch", async () => {
    await expectRlsViolation(
      asTenant(ctxFor.branchAdmin(fx.branchA.id), (tx) =>
        tx.insert(schema.branchScheduleSettings).values({
          branchId: fx.branchB.id,
          track: "scientific",
          dayStartTime: "08:00",
          periodDurationMin: 45,
          periodsCount: 6,
        }),
      ),
    );
  });
});

describe("slots", () => {
  it("shows a branch admin only their own branch's grid", async () => {
    await makeSlot({
      branchId: fx.branchA.id,
      classId: fx.classA.id,
      teacherId: fx.teacherA.id,
      subjectId: subject.id,
    });
    await makeSlot({
      branchId: fx.branchB.id,
      classId: fx.classB.id,
      teacherId: fx.teacherB.id,
      subjectId: subject.id,
      periodNumber: 2,
      startTime: "09:00",
      endTime: "09:45",
    });

    const rows = await asTenant(ctxFor.branchAdmin(fx.branchA.id), (tx) =>
      tx.select().from(schema.timetableSlots),
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.branchId).toBe(fx.branchA.id);
  });

  it("refuses to write a slot into another branch", async () => {
    await expectRlsViolation(
      asTenant(ctxFor.branchAdmin(fx.branchA.id), (tx) =>
        tx.insert(schema.timetableSlots).values({
          branchId: fx.branchB.id,
          classId: fx.classB.id,
          teacherId: fx.teacherB.id,
          subjectId: subject.id,
          dayOfWeek: 6,
          periodNumber: 1,
          startTime: "08:00",
          endTime: "08:45",
        }),
      ),
    );
  });

  it("lets a teacher see their own slots in every branch they work in", async () => {
    const shared = await makeTeacher([fx.branchA.id, fx.branchB.id], { fullName: "معلم مشترك" });
    await makeSlot({
      branchId: fx.branchA.id,
      classId: fx.classA.id,
      teacherId: shared.id,
      subjectId: subject.id,
    });
    await makeSlot({
      branchId: fx.branchB.id,
      classId: fx.classB.id,
      teacherId: shared.id,
      subjectId: subject.id,
      startTime: "10:00",
      endTime: "10:45",
    });

    const rows = await asTenant(ctxFor.teacher(shared.id), (tx) => tx.select().from(schema.timetableSlots));
    expect(rows).toHaveLength(2);
  });

  it("does not let a teacher edit the timetable", async () => {
    const slot = await makeSlot({
      branchId: fx.branchA.id,
      classId: fx.classA.id,
      teacherId: fx.teacherA.id,
      subjectId: subject.id,
    });

    await asTenant(ctxFor.teacher(fx.teacherA.id), (tx) =>
      tx
        .update(schema.timetableSlots)
        .set({ periodNumber: 5 })
        .where(sql`id = ${slot.id}`),
    );

    const [after] = await ownerDb
      .select()
      .from(schema.timetableSlots)
      .where(sql`id = ${slot.id}`);
    expect(after?.periodNumber).toBe(1);
  });
});

describe("no_teacher_overlap, across branches", () => {
  it("refuses to double-book a teacher in two DIFFERENT branches", async () => {
    const shared = await makeTeacher([fx.branchA.id, fx.branchB.id], { fullName: "معلم مشترك" });
    await makeSlot({
      branchId: fx.branchA.id,
      classId: fx.classA.id,
      teacherId: shared.id,
      subjectId: subject.id,
      dayOfWeek: 6,
      startTime: "08:00",
      endTime: "08:45",
    });

    // Branch B cannot SEE that slot. The constraint still stops it.
    await expectConstraintViolation(
      makeSlot({
        branchId: fx.branchB.id,
        classId: fx.classB.id,
        teacherId: shared.id,
        subjectId: subject.id,
        dayOfWeek: 6,
        startTime: "08:30",
        endTime: "09:15",
      }),
      "no_teacher_overlap",
    );
  });

  it("allows back-to-back periods in two branches — 08:45 does not overlap 08:45", async () => {
    const shared = await makeTeacher([fx.branchA.id, fx.branchB.id]);
    await makeSlot({
      branchId: fx.branchA.id,
      classId: fx.classA.id,
      teacherId: shared.id,
      subjectId: subject.id,
      startTime: "08:00",
      endTime: "08:45",
    });

    await expect(
      makeSlot({
        branchId: fx.branchB.id,
        classId: fx.classB.id,
        teacherId: shared.id,
        subjectId: subject.id,
        startTime: "08:45",
        endTime: "09:30",
      }),
    ).resolves.toBeDefined();
  });

  it("refuses two subjects in one class period", async () => {
    await makeSlot({
      branchId: fx.branchA.id,
      classId: fx.classA.id,
      teacherId: fx.teacherA.id,
      subjectId: subject.id,
      dayOfWeek: 6,
      periodNumber: 1,
    });
    const other = await makeTeacher([fx.branchA.id]);

    await expectConstraintViolation(
      makeSlot({
        branchId: fx.branchA.id,
        classId: fx.classA.id,
        teacherId: other.id,
        subjectId: subject.id,
        dayOfWeek: 6,
        periodNumber: 1,
        startTime: "09:00",
        endTime: "09:45",
      }),
      "timetable_slots_class_day_period_unique",
    );
  });

  it("frees the cell again once the slot is deactivated", async () => {
    const slot = await makeSlot({
      branchId: fx.branchA.id,
      classId: fx.classA.id,
      teacherId: fx.teacherA.id,
      subjectId: subject.id,
    });
    await ownerDb
      .update(schema.timetableSlots)
      .set({ isActive: false })
      .where(sql`id = ${slot.id}`);

    // The unique index and the exclusion constraint are both `where (is_active)`, so
    // clearing a cell really does clear it — while the row stays for class_sessions.
    await expect(
      makeSlot({
        branchId: fx.branchA.id,
        classId: fx.classA.id,
        teacherId: fx.teacherA.id,
        subjectId: subject.id,
      }),
    ).resolves.toBeDefined();
  });
});

describe("app_timetable_conflicts — explaining a clash without leaking", () => {
  type ConflictRow = {
    candidate_index: number;
    slot_id: string | null;
    branch_id: string | null;
    class_id: string | null;
    period_number: number | null;
    same_branch: boolean;
    class_name: string | null;
    branch_name: string | null;
  };

  async function ask(ctx: Parameters<typeof asTenant>[0], teacherId: string) {
    const rows = await asTenant(ctx, (tx) =>
      tx.execute(
        sql`select * from app_timetable_conflicts(${JSON.stringify([
          { teacherId, dayOfWeek: 6, startTime: "08:30", endTime: "09:15", ignoreSlotId: "" },
        ])}::jsonb)`,
      ),
    );
    return rows as unknown as ConflictRow[];
  }

  let shared: Awaited<ReturnType<typeof makeTeacher>>;

  beforeEach(async () => {
    shared = await makeTeacher([fx.branchA.id, fx.branchB.id], { fullName: "معلم مشترك" });
    // The teacher is busy in branch B, which branch A may not know about at all.
    await makeSlot({
      branchId: fx.branchB.id,
      classId: fx.classB.id,
      teacherId: shared.id,
      subjectId: subject.id,
      dayOfWeek: 6,
      startTime: "08:00",
      endTime: "08:45",
    });
  });

  it("tells a branch admin THAT the teacher is busy, and nothing else", async () => {
    const [row] = await ask(ctxFor.branchAdmin(fx.branchA.id), shared.id);

    expect(row).toBeDefined();
    expect(row?.same_branch).toBe(false);
    // Every identifying column is redacted by the function itself, so the branch
    // admin's server process never even holds branch B's data.
    expect(row?.slot_id).toBeNull();
    expect(row?.branch_id).toBeNull();
    expect(row?.class_id).toBeNull();
    expect(row?.period_number).toBeNull();
    expect(row?.class_name).toBeNull();
    expect(row?.branch_name).toBeNull();
    expect(JSON.stringify(row)).not.toContain("فرع ب");
    expect(JSON.stringify(row)).not.toContain("شعبة ب");
  });

  it("tells a super admin exactly which branch and class", async () => {
    const [row] = await ask(ctxFor.superAdmin(fx.branchA.id), shared.id);

    expect(row?.branch_name).toBe("فرع ب");
    expect(row?.class_name).toBe("شعبة ب");
    expect(row?.branch_id).toBe(fx.branchB.id);
  });

  it("names the class when the clash is in the admin's OWN branch", async () => {
    await makeSlot({
      branchId: fx.branchA.id,
      classId: fx.classA.id,
      teacherId: shared.id,
      subjectId: subject.id,
      dayOfWeek: 6,
      periodNumber: 4,
      startTime: "12:00",
      endTime: "12:45",
    });

    const rows = await asTenant(ctxFor.branchAdmin(fx.branchA.id), (tx) =>
      tx.execute(
        sql`select * from app_timetable_conflicts(${JSON.stringify([
          { teacherId: shared.id, dayOfWeek: 6, startTime: "12:15", endTime: "13:00", ignoreSlotId: "" },
        ])}::jsonb)`,
      ),
    );

    const [row] = rows as unknown as ConflictRow[];
    expect(row?.same_branch).toBe(true);
    expect(row?.class_name).toBe("شعبة أ");
    expect(row?.period_number).toBe(4);
  });

  it("answers a teacher with nothing at all — they do not build timetables", async () => {
    expect(await ask(ctxFor.teacher(shared.id), shared.id)).toEqual([]);
  });

  it("finds no conflict when the periods merely touch", async () => {
    const rows = await asTenant(ctxFor.superAdmin(null), (tx) =>
      tx.execute(
        sql`select * from app_timetable_conflicts(${JSON.stringify([
          { teacherId: shared.id, dayOfWeek: 6, startTime: "08:45", endTime: "09:30", ignoreSlotId: "" },
        ])}::jsonb)`,
      ),
    );

    expect(rows as unknown as ConflictRow[]).toEqual([]);
  });

  it("ignores the slot being edited, so a cell never conflicts with itself", async () => {
    const [own] = await ownerDb
      .select()
      .from(schema.timetableSlots)
      .where(sql`teacher_id = ${shared.id}`);
    expect(own).toBeDefined();

    const rows = await asTenant(ctxFor.superAdmin(fx.branchB.id), (tx) =>
      tx.execute(
        sql`select * from app_timetable_conflicts(${JSON.stringify([
          {
            teacherId: shared.id,
            dayOfWeek: 6,
            startTime: "08:30",
            endTime: "09:15",
            ignoreSlotId: own?.id ?? "",
          },
        ])}::jsonb)`,
      ),
    );

    expect(rows as unknown as ConflictRow[]).toEqual([]);
  });

  it("answers several candidates in one call, keyed by their position", async () => {
    const rows = await asTenant(ctxFor.superAdmin(null), (tx) =>
      tx.execute(
        sql`select * from app_timetable_conflicts(${JSON.stringify([
          { teacherId: shared.id, dayOfWeek: 6, startTime: "08:45", endTime: "09:30", ignoreSlotId: "" },
          { teacherId: shared.id, dayOfWeek: 6, startTime: "08:15", endTime: "09:00", ignoreSlotId: "" },
        ])}::jsonb)`,
      ),
    );

    const conflicts = rows as unknown as ConflictRow[];
    expect(conflicts).toHaveLength(1);
    // The SECOND candidate is the one that clashes, and it says so.
    expect(conflicts[0]?.candidate_index).toBe(1);
  });
});
