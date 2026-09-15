import type { Role } from "./tenant-context";

/**
 * PROJECT_PLAN section 3, as a single typed map. One place to read when asking
 * "who is allowed to do this?", and the only place to change when the answer changes.
 *
 * A permission here answers only "may this ROLE do this KIND of thing". WHICH rows
 * they may touch is a separate question, answered by TenantContext and RLS.
 */
export const PERMISSIONS = {
  // Branches and center-wide configuration
  "branch.read": ["super_admin", "branch_admin"],
  "branch.manage": ["super_admin"],
  "branch.switch": ["super_admin"],
  "settings.manage": ["super_admin"],
  "subject.read": ["super_admin", "branch_admin"],
  "subject.manage": ["super_admin"],

  // Admin accounts
  "user.read": ["super_admin"],
  "user.manage": ["super_admin"],

  // Classes
  "class.read": ["super_admin", "branch_admin"],
  "class.write": ["super_admin", "branch_admin"],

  // Students
  "student.read": ["super_admin", "branch_admin"],
  "student.write": ["super_admin", "branch_admin"],
  "student.archive": ["super_admin", "branch_admin"],
  /** Moving a student to another branch is a super-admin act (rule 10.3). */
  "student.transfer_branch": ["super_admin"],

  // Teachers
  "teacher.read": ["super_admin", "branch_admin"],
  /** Creating a teacher and setting their rates is global, so super admin only. */
  "teacher.manage": ["super_admin"],
  /** A branch admin may link an existing teacher to their own branch. */
  "teacher.link_branch": ["super_admin", "branch_admin"],

  // Timetable
  "timetable.read": ["super_admin", "branch_admin", "teacher"],
  "timetable.write": ["super_admin", "branch_admin"],
  "timetable.settings": ["super_admin", "branch_admin"],

  // Attendance
  "attendance.read": ["super_admin", "branch_admin", "teacher"],
  "attendance.mark": ["super_admin", "branch_admin", "teacher"],
  /** Editing past attendance is audited and window-limited for branch admins. */
  "attendance.edit_past": ["super_admin", "branch_admin"],
  "session.manage": ["super_admin", "branch_admin"],

  // Money and reporting
  "payroll.read": ["super_admin", "branch_admin", "teacher"],
  "report.read": ["super_admin", "branch_admin"],
  /** Comparing branches against each other only makes sense centrally. */
  "report.cross_branch": ["super_admin"],

  "audit.read": ["super_admin", "branch_admin"],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function hasPermission(role: Role, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly Role[]).includes(role);
}

/** Every permission a role holds — used to filter navigation items. */
export function permissionsFor(role: Role): Permission[] {
  return (Object.keys(PERMISSIONS) as Permission[]).filter((p) => hasPermission(role, p));
}
