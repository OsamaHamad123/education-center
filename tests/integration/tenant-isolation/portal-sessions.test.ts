import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  applyMigrations,
  appDb,
  asTenant,
  closeConnections,
  ctxFor,
  ownerDb,
  resetDatabase,
} from "../helpers/db";
import { makeCenterSettings, makeStudent, makeTwoBranches } from "../helpers/factories";
import * as schema from "@/shared/db/schema";

/**
 * The portal's hardening pass (docs/PORTAL-REVIEW-2026-09.md, phase P6).
 *
 * The portal is the first authenticated surface in this product that is not staff, and
 * it is the only one whose boundary is a WHERE clause inside a SECURITY DEFINER function
 * rather than an RLS policy. `lookup.test.ts` proves those functions keep one family out
 * of another's records. This file proves the things AROUND them:
 *
 *   1. the session table itself is out of reach of the staff surface;
 *   2. the centre has levers that actually END a parent's access;
 *   3. a sign-in leaves a trace an administrator can read.
 *
 * Everything runs on `appDb` — the NOBYPASSRLS role the application uses.
 */

const SALT = "integration-test-salt";

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

/** The hash the portal stores, computed the way `app_portal_verify` computes it. */
async function verify(code: string, lastFour: string): Promise<string | null> {
  const [row] = await appDb.execute<{ hash: string | null }>(
    sql`select app_portal_verify(${code}, ${lastFour}, ${SALT}) as hash`,
  );
  return row?.hash ?? null;
}

async function childrenOf(hash: string): Promise<{ studentId: string; branchName: string }[]> {
  const [row] = await appDb.execute<{ children: { studentId: string; branchName: string }[] }>(
    sql`select app_portal_children(${hash}, ${SALT}) as children`,
  );
  return row?.children ?? [];
}

describe("portal sessions are out of reach of the staff surface", () => {
  /**
   * Finding 2. `portal_sessions` holds a live session token hash. Before `drizzle/0010`
   * `school_app` had a blanket SELECT on it, so every staff-facing query in the product
   * — and anything that ever went wrong in one — could read the lot.
   *
   * The policy admits only statements with NO tenant role, which is the portal and
   * nothing else. These tests are the difference between "staff are not supposed to read
   * this" and "staff cannot".
   */
  beforeEach(async () => {
    await ownerDb.insert(schema.portalSessions).values({
      tokenHash: "token-hash-for-the-test",
      parentPhoneHash: "phone-hash-for-the-test",
      expiresAt: new Date(Date.now() + 86_400_000),
    });
  });

  it("is readable with no tenant context — the portal's own state", async () => {
    const rows = await appDb.select().from(schema.portalSessions);
    expect(rows).toHaveLength(1);
  });

  it("is invisible inside a super admin's transaction", async () => {
    const rows = await asTenant(ctxFor.superAdmin(), (tx) => tx.select().from(schema.portalSessions));
    // Not filtered to their branch — there is no branch. Simply not there.
    expect(rows).toEqual([]);
  });

  it("is invisible inside a branch admin's transaction", async () => {
    const rows = await asTenant(ctxFor.branchAdmin(fx.branchA.id), (tx) =>
      tx.select().from(schema.portalSessions),
    );
    expect(rows).toEqual([]);
  });

  it("cannot be written from a staff transaction either", async () => {
    await expect(
      asTenant(ctxFor.superAdmin(), (tx) =>
        tx.insert(schema.portalSessions).values({
          tokenHash: "forged",
          parentPhoneHash: "somebody",
          expiresAt: new Date(Date.now() + 86_400_000),
        }),
      ),
    ).rejects.toThrow();

    // And a staff DELETE hits nothing rather than quietly evicting every parent.
    await asTenant(ctxFor.superAdmin(), (tx) => tx.delete(schema.portalSessions));
    const survivors = await appDb.select().from(schema.portalSessions);
    expect(survivors).toHaveLength(1);
  });
});

describe("how a parent's access ends", () => {
  /**
   * Finding 3 and the session review. A thirty-day session on a credential printed on a
   * timetable needs an answer to "a parent rang; somebody else can see my son's record".
   * There are two levers and no screen for either, so they are pinned down here.
   */
  it("ends for one family when staff change the parent's phone", async () => {
    await makeStudent(fx.branchA.id, fx.classA.id, {
      fullName: "ابن الأول",
      studentCode: "AAA-26-20001",
      parentPhone: "+201000001111",
    });
    const hash = await verify("AAA-26-20001", "1111");
    expect(await childrenOf(hash ?? "")).toHaveLength(1);

    // The identity IS the phone, so changing it orphans every session behind the old one
    // — including the one on the phone that was lost. This is the revocation lever, and
    // it is the thing the office would do anyway.
    await ownerDb
      .update(schema.students)
      .set({ parentPhone: "+201000009999" })
      .where(sql`student_code = 'AAA-26-20001'`);

    expect(await childrenOf(hash ?? "")).toEqual([]);
  });

  it("ends for everybody when the centre switches the lookup off", async () => {
    await makeStudent(fx.branchA.id, fx.classA.id, {
      fullName: "ابن الأول",
      studentCode: "AAA-26-20002",
      parentPhone: "+201000002222",
    });
    const hash = await verify("AAA-26-20002", "2222");
    expect(await childrenOf(hash ?? "")).toHaveLength(1);

    await ownerDb.update(schema.centerSettings).set({ lookupEnabled: false });
    // The kill switch P7 relies on: one setting, no deploy, and it closes the DATA path
    // rather than only the door in front of it.
    expect(await childrenOf(hash ?? "")).toEqual([]);
  });

  it("ends for one child when they are archived, and not for their sibling", async () => {
    await makeStudent(fx.branchA.id, fx.classA.id, {
      fullName: "الابن الأكبر",
      studentCode: "AAA-26-20003",
      parentPhone: "+201000003333",
    });
    const sibling = await makeStudent(fx.branchA.id, fx.classA.id, {
      fullName: "الابن الأصغر",
      studentCode: "AAA-26-20004",
      parentPhone: "+201000003333",
    });
    const hash = await verify("AAA-26-20003", "3333");
    expect(await childrenOf(hash ?? "")).toHaveLength(2);

    await ownerDb
      .update(schema.students)
      .set({ status: "archived", leftDate: "2026-09-16", leaveReason: "انتقل لمدرسة أخرى" })
      .where(sql`student_code = 'AAA-26-20003'`);

    const remaining = await childrenOf(hash ?? "");
    expect(remaining.map((child) => child.studentId)).toEqual([sibling.id]);
  });

  it("does NOT end when the child moves to another branch — the portal follows them", async () => {
    const student = await makeStudent(fx.branchA.id, fx.classA.id, {
      fullName: "ابن المنتقل",
      studentCode: "AAA-26-20005",
      parentPhone: "+201000004444",
    });
    const hash = await verify("AAA-26-20005", "4444");

    await ownerDb
      .update(schema.students)
      .set({ branchId: fx.branchB.id, classId: fx.classB.id })
      .where(sql`id = ${student.id}`);

    // A branch is the staff's boundary, not the family's: the parent keeps reading their
    // own child, and the screen simply names the new branch.
    const children = await childrenOf(hash ?? "");
    expect(children).toHaveLength(1);
    expect(children[0]?.branchName).toBe(fx.branchB.name);
  });
});

describe("a portal sign-in leaves a trace", () => {
  /**
   * Finding 5. The anonymous lookup has been audited since SECURITY-REVIEW finding 4,
   * and it shows a MASKED name. The portal shows the child's full name and wrote
   * nothing at all — the more revealing door was the one with no record.
   */
  it("writes exactly one shaped row, and nothing free-text", async () => {
    await appDb.execute(sql`select app_record_portal_audit('AAA-26-20006', 'ip-hash')`);

    const rows = await ownerDb.select().from(schema.auditLogs);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.action).toBe("login");
    // A distinct entity, so the log can tell the two public doors apart.
    expect(rows[0]?.entity).toBe("student.portal");
    expect(rows[0]?.entityId).toBe("AAA-26-20006");
    // No branch and no user: a parent belongs to neither, and inventing one would make
    // the log lie about who acted.
    expect(rows[0]?.branchId).toBeNull();
    expect(rows[0]?.userId).toBeNull();
  });
});
