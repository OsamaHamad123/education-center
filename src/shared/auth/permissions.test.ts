import { describe, expect, it } from "vitest";
import { hasPermission, PERMISSIONS, permissionsFor, type Permission } from "./permissions";
import type { Role } from "./tenant-context";

/**
 * These assertions are the permission matrix of PROJECT_PLAN section 3, written twice.
 * That is the point: if someone widens a permission in `permissions.ts`, they have to
 * come here and say so out loud.
 */

describe("the permission matrix matches PROJECT_PLAN section 3", () => {
  const cases: Array<[Permission, Role[]]> = [
    ["branch.manage", ["super_admin"]],
    ["branch.switch", ["super_admin"]],
    ["user.manage", ["super_admin"]],
    ["settings.manage", ["super_admin"]],
    ["subject.manage", ["super_admin"]],
    ["class.write", ["super_admin", "branch_admin"]],
    ["student.write", ["super_admin", "branch_admin"]],
    ["student.transfer_branch", ["super_admin"]],
    ["teacher.manage", ["super_admin"]],
    ["teacher.link_branch", ["super_admin", "branch_admin"]],
    ["timetable.write", ["super_admin", "branch_admin"]],
    ["attendance.mark", ["super_admin", "branch_admin", "teacher"]],
    ["attendance.edit_past", ["super_admin", "branch_admin"]],
    ["payroll.read", ["super_admin", "branch_admin", "teacher"]],
    ["report.cross_branch", ["super_admin"]],
    ["audit.read", ["super_admin", "branch_admin"]],
  ];

  it.each(cases)("%s is held exactly by %j", (permission, expected) => {
    const actual = (["super_admin", "branch_admin", "teacher"] as Role[]).filter((role) =>
      hasPermission(role, permission),
    );
    expect(actual.sort()).toEqual([...expected].sort());
  });
});

describe("role boundaries", () => {
  it("never lets a teacher manage anything", () => {
    const managerial = (Object.keys(PERMISSIONS) as Permission[]).filter((p) =>
      /\.(manage|write|archive|transfer_branch|edit_past)$/.test(p),
    );
    const teacherHolds = managerial.filter((p) => hasPermission("teacher", p));
    expect(teacherHolds).toEqual([]);
  });

  it("never lets a branch admin touch center-wide configuration", () => {
    for (const permission of [
      "branch.manage",
      "branch.switch",
      "user.manage",
      "settings.manage",
      "subject.manage",
      "teacher.manage",
      "student.transfer_branch",
      "report.cross_branch",
    ] as Permission[]) {
      expect(hasPermission("branch_admin", permission), permission).toBe(false);
    }
  });

  it("gives the super admin every permission — they are the fallback for everything", () => {
    const all = Object.keys(PERMISSIONS) as Permission[];
    expect(permissionsFor("super_admin")).toEqual(all);
  });

  it("gives a teacher only read access plus marking attendance", () => {
    expect(permissionsFor("teacher").sort()).toEqual(
      ["attendance.mark", "attendance.read", "payroll.read", "timetable.read"].sort(),
    );
  });
});
