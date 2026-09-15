import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { applyMigrations, asTenant, closeConnections, ctxFor, ownerDb, resetDatabase } from "../helpers/db";
import { makeCenterSettings, makeTwoBranches } from "../helpers/factories";
import * as schema from "@/shared/db/schema";
import { expectRlsViolation } from "../helpers/errors";

/**
 * Teacher visibility (PROJECT_PLAN section 3, 7.7–7.9).
 *
 * A teacher is a global profile, so "which teachers exist" is not the same question
 * as "which teachers may I see". A branch admin may see only the ones linked to their
 * branch — and must never see anyone's rates.
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

describe("a branch admin", () => {
  it("sees only teachers linked to their branch", async () => {
    const rows = await asTenant(ctxFor.branchAdmin(fx.branchA.id), (tx) => tx.select().from(schema.teachers));

    expect(rows.map((r) => r.fullName)).toEqual(["معلم أ"]);
  });

  it("sees a teacher who teaches in BOTH branches, but not the other branch's link", async () => {
    const { makeTeacher } = await import("../helpers/factories");
    const shared = await makeTeacher([fx.branchA.id, fx.branchB.id], { fullName: "معلم مشترك" });

    const teachers = await asTenant(ctxFor.branchAdmin(fx.branchA.id), (tx) =>
      tx.select().from(schema.teachers),
    );
    expect(teachers.map((r) => r.fullName).sort()).toEqual(["معلم أ", "معلم مشترك"]);

    // Their link rows are scoped per branch, so branch A learns nothing about B.
    const links = await asTenant(ctxFor.branchAdmin(fx.branchA.id), (tx) =>
      tx
        .select()
        .from(schema.teacherBranches)
        .where(sql`teacher_id = ${shared.id}`),
    );
    expect(links).toHaveLength(1);
    expect(links[0]?.branchId).toBe(fx.branchA.id);
  });

  it("stops seeing a teacher once the link is deactivated", async () => {
    await ownerDb
      .update(schema.teacherBranches)
      .set({ isActive: false })
      .where(sql`teacher_id = ${fx.teacherA.id} and branch_id = ${fx.branchA.id}`);

    const rows = await asTenant(ctxFor.branchAdmin(fx.branchA.id), (tx) => tx.select().from(schema.teachers));
    expect(rows).toHaveLength(0);
  });

  it("cannot read ANY rate history — money is super-admin only", async () => {
    await ownerDb.insert(schema.teacherRateHistory).values({
      teacherId: fx.teacherA.id,
      ratePiastersScientific: 15_000,
      ratePiastersLiterary: 12_000,
      effectiveFrom: "2026-01-01",
    });

    const rows = await asTenant(ctxFor.branchAdmin(fx.branchA.id), (tx) =>
      tx.select().from(schema.teacherRateHistory),
    );
    // Not even for a teacher they are linked to.
    expect(rows).toHaveLength(0);
  });

  it("cannot change a teacher's rates", async () => {
    await asTenant(ctxFor.branchAdmin(fx.branchA.id), (tx) =>
      tx
        .update(schema.teachers)
        .set({ ratePiastersScientific: 99_000 })
        .where(sql`id = ${fx.teacherA.id}`),
    );

    const [after] = await ownerDb
      .select()
      .from(schema.teachers)
      .where(sql`id = ${fx.teacherA.id}`);
    expect(after?.ratePiastersScientific).toBe(15_000);
  });

  it("cannot create a teacher", async () => {
    await expectRlsViolation(
      asTenant(ctxFor.branchAdmin(fx.branchA.id), (tx) =>
        tx.insert(schema.teachers).values({
          fullName: "معلم مهرّب",
          phone: "+201099999999",
          ratePiastersScientific: 1,
          ratePiastersLiterary: 1,
        }),
      ),
    );
  });

  it("cannot link a teacher to a branch that is not theirs", async () => {
    await expectRlsViolation(
      asTenant(ctxFor.branchAdmin(fx.branchA.id), (tx) =>
        tx.insert(schema.teacherBranches).values({ teacherId: fx.teacherA.id, branchId: fx.branchB.id }),
      ),
    );
  });
});

describe("linking an existing teacher by phone", () => {
  it("resolves a full phone number for an admin, and refuses everyone else", async () => {
    const phone = fx.teacherB.phone;

    const asBranchAdmin = await asTenant(ctxFor.branchAdmin(fx.branchA.id), (tx) =>
      tx.execute(sql`select app_lookup_teacher_for_linking(${phone}) as id`),
    );
    // Branch A is not linked to teacher B, but may still resolve the id in order to
    // link them — that is the whole point of the function (drizzle/0004).
    expect((asBranchAdmin[0] as { id: string | null }).id).toBe(fx.teacherB.id);

    const asTeacher = await asTenant(ctxFor.teacher(fx.teacherA.id), (tx) =>
      tx.execute(sql`select app_lookup_teacher_for_linking(${phone}) as id`),
    );
    expect((asTeacher[0] as { id: string | null }).id).toBeNull();
  });

  it("does not make the teacher readable until the link exists", async () => {
    const before = await asTenant(ctxFor.branchAdmin(fx.branchA.id), (tx) =>
      tx
        .select()
        .from(schema.teachers)
        .where(sql`id = ${fx.teacherB.id}`),
    );
    expect(before).toHaveLength(0);

    await asTenant(ctxFor.branchAdmin(fx.branchA.id), (tx) =>
      tx.insert(schema.teacherBranches).values({
        teacherId: fx.teacherB.id,
        branchId: fx.branchA.id,
      }),
    );

    const after = await asTenant(ctxFor.branchAdmin(fx.branchA.id), (tx) =>
      tx
        .select()
        .from(schema.teachers)
        .where(sql`id = ${fx.teacherB.id}`),
    );
    expect(after).toHaveLength(1);
  });

  it("returns nothing for an inactive teacher", async () => {
    await ownerDb
      .update(schema.teachers)
      .set({ status: "inactive" })
      .where(sql`id = ${fx.teacherB.id}`);

    const result = await asTenant(ctxFor.branchAdmin(fx.branchA.id), (tx) =>
      tx.execute(sql`select app_lookup_teacher_for_linking(${fx.teacherB.phone}) as id`),
    );
    expect((result[0] as { id: string | null }).id).toBeNull();
  });
});

describe("a teacher", () => {
  it("sees only their own profile", async () => {
    const rows = await asTenant(ctxFor.teacher(fx.teacherA.id), (tx) => tx.select().from(schema.teachers));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(fx.teacherA.id);
  });

  it("cannot change their own rate", async () => {
    await asTenant(ctxFor.teacher(fx.teacherA.id), (tx) =>
      tx
        .update(schema.teachers)
        .set({ ratePiastersScientific: 99_000 })
        .where(sql`id = ${fx.teacherA.id}`),
    );

    const [after] = await ownerDb
      .select()
      .from(schema.teachers)
      .where(sql`id = ${fx.teacherA.id}`);
    expect(after?.ratePiastersScientific).toBe(15_000);
  });
});

describe("rate changes never rewrite history", () => {
  it("leaves a completed session's snapshotted rate alone (rule 10.6)", async () => {
    const { makeSession } = await import("../helpers/factories");
    const session = await makeSession({
      branchId: fx.branchA.id,
      classId: fx.classA.id,
      teacherId: fx.teacherA.id,
      ratePiasters: 15_000,
    });

    await asTenant(ctxFor.superAdmin(fx.branchA.id), (tx) =>
      tx
        .update(schema.teachers)
        .set({ ratePiastersScientific: 25_000 })
        .where(sql`id = ${fx.teacherA.id}`),
    );

    const [after] = await ownerDb
      .select()
      .from(schema.classSessions)
      .where(sql`id = ${session.id}`);
    expect(after?.rateAppliedPiasters).toBe(15_000);
  });
});
