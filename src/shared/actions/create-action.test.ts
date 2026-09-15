import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { TenantContext } from "@/shared/auth/tenant-context";

/**
 * createAction is the gate every mutation passes through, so what matters is the
 * ORDER of its checks and that each one short-circuits: an unauthenticated caller
 * must never reach the permission check, a forbidden caller must never reach
 * validation, and no caller reaches the handler without a tenant context.
 *
 * The database and Next's cache are stubbed here on purpose — what they do is covered
 * by the integration suite. These tests are about the pipeline itself.
 */

let currentContext: TenantContext | null = null;

vi.mock("@/shared/auth/session", () => ({
  resolveTenantContext: () => Promise.resolve(currentContext),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  updateTag: vi.fn(),
}));

const auditEntries: unknown[] = [];
vi.mock("@/shared/actions/audit", () => ({
  writeAuditLog: (_tx: unknown, _ctx: unknown, entry: unknown) => {
    auditEntries.push(entry);
    return Promise.resolve();
  },
  requestMetadata: () => Promise.resolve({ ip: null, userAgent: null }),
}));

// A stub transaction: the handler receives it but these tests never query.
vi.mock("@/shared/db/with-tenant", () => ({
  withTenant: (_ctx: TenantContext, fn: (tx: unknown) => Promise<unknown>) => fn({}),
}));

const { createAction, requirePermission } = await import("./create-action");

const superAdmin = (branchId: string | null = "branch-a"): TenantContext => ({
  userId: "u1",
  role: "super_admin",
  branchId,
  teacherId: null,
});
const branchAdmin: TenantContext = {
  userId: "u2",
  role: "branch_admin",
  branchId: "branch-a",
  teacherId: null,
};
const teacher: TenantContext = { userId: "u3", role: "teacher", branchId: null, teacherId: "t1" };

const schema = z.object({ name: z.string().min(2) });

function makeAction(overrides: Partial<Parameters<typeof createAction>[0]> = {}) {
  return createAction({
    permission: "class.write",
    schema,
    handler: ({ input }) =>
      Promise.resolve({ ok: true as const, data: { id: "c1", name: (input as { name: string }).name } }),
    ...overrides,
  });
}

beforeEach(() => {
  currentContext = null;
  auditEntries.length = 0;
});

describe("the pipeline short-circuits in order", () => {
  it("returns UNAUTHORIZED when nobody is signed in", async () => {
    const handler = vi.fn();
    const action = makeAction({ handler });

    const result = await action({ name: "شعبة" });

    expect(result).toMatchObject({ ok: false, error: { code: "UNAUTHORIZED" } });
    expect(handler).not.toHaveBeenCalled();
  });

  it("returns FORBIDDEN before validating — a forbidden caller learns nothing about the schema", async () => {
    currentContext = teacher;
    const handler = vi.fn();
    const action = makeAction({ handler });

    // Input is invalid too, but the permission check must win.
    const result = await action({ name: "" });

    expect(result).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect(handler).not.toHaveBeenCalled();
  });

  it("returns BRANCH_REQUIRED for a super admin in 'كافة الفروع' mode", async () => {
    currentContext = superAdmin(null);
    const handler = vi.fn();
    const action = makeAction({ handler });

    const result = await action({ name: "شعبة" });

    expect(result).toMatchObject({ ok: false, error: { code: "BRANCH_REQUIRED" } });
    expect(handler).not.toHaveBeenCalled();
  });

  it("does not demand a branch from a teacher — their scope comes from teacher_branches", async () => {
    currentContext = teacher;
    const action = makeAction({ permission: "attendance.mark" });

    const result = await action({ name: "حصة" });

    expect(result.ok).toBe(true);
  });

  it("returns VALIDATION_ERROR with per-field Arabic messages", async () => {
    currentContext = branchAdmin;
    const handler = vi.fn();
    const action = makeAction({ handler });

    const result = await action({ name: "ش" });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("VALIDATION_ERROR");
      expect(result.error.fieldErrors?.name).toBeDefined();
    }
    expect(handler).not.toHaveBeenCalled();
  });

  it("runs the handler and returns its data once every check passes", async () => {
    currentContext = branchAdmin;
    const action = makeAction();

    const result = await action({ name: "علمي 1" });

    expect(result).toEqual({ ok: true, data: { id: "c1", name: "علمي 1" } });
  });
});

describe("auditing", () => {
  it("writes an audit entry for a successful mutation", async () => {
    currentContext = branchAdmin;
    const action = makeAction({
      audit: { action: "create", entity: "class", entityId: (out) => (out as { id: string }).id },
    });

    await action({ name: "علمي 1" });

    expect(auditEntries).toEqual([{ action: "create", entity: "class", entityId: "c1" }]);
  });

  it("writes nothing when the use case fails", async () => {
    currentContext = branchAdmin;
    const action = makeAction({
      audit: { action: "create", entity: "class" },
      handler: () =>
        Promise.resolve({ ok: false as const, error: { code: "CONFLICT" as const, message: "تعارض" } }),
    });

    const result = await action({ name: "علمي 1" });

    expect(result).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
    expect(auditEntries).toEqual([]);
  });
});

describe("unexpected errors", () => {
  it("becomes INTERNAL rather than leaking a stack trace to the user", async () => {
    currentContext = branchAdmin;
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const action = makeAction({
      handler: () => {
        throw new Error("boom: connection reset by peer at 10.0.0.4");
      },
    });

    const result = await action({ name: "علمي 1" });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INTERNAL");
      expect(result.error.message).not.toContain("boom");
    }
  });
});

describe("requirePermission (the read path)", () => {
  it("rejects an anonymous reader", async () => {
    expect(await requirePermission("student.read")).toMatchObject({
      ok: false,
      error: { code: "UNAUTHORIZED" },
    });
  });

  it("rejects a role without the permission", async () => {
    currentContext = teacher;
    expect(await requirePermission("student.read")).toMatchObject({
      ok: false,
      error: { code: "FORBIDDEN" },
    });
  });

  it("returns the tenant context to a permitted reader", async () => {
    currentContext = branchAdmin;
    const result = await requirePermission("student.read");

    expect(result).toEqual({ ok: true, data: branchAdmin });
  });

  it("allows a super admin to READ in 'كافة الفروع' mode — only writes need a branch", async () => {
    currentContext = superAdmin(null);
    const result = await requirePermission("student.read");

    expect(result.ok).toBe(true);
  });
});
