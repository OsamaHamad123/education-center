import type { Permission } from "@/shared/auth/permissions";
import { ar } from "@/shared/i18n/ar";

/**
 * Navigation is built on the server (so it can be filtered by permission) and
 * rendered by a client component. Everything here therefore has to survive
 * serialization across that boundary — which is why `icon` is a KEY, not a
 * component. Passing the lucide component itself throws
 * "Functions cannot be passed directly to Client Components".
 */
export type NavIconKey =
  | "dashboard"
  | "branches"
  | "users"
  | "classes"
  | "students"
  | "teachers"
  | "subjects"
  | "timetable"
  | "attendance"
  | "grades"
  | "payroll"
  | "fees"
  | "reports"
  | "audit"
  | "settings"
  | "key";

export type NavItem = {
  href: string;
  label: string;
  icon: NavIconKey;
  /** Omitted for items everyone in the area may see. */
  permission?: Permission;
};

/**
 * Sidebar for super admins and branch admins, in the order of PROJECT_PLAN section 11.
 * Items are filtered by permission, so a branch admin simply has no "الفروع" entry —
 * nothing disabled, nothing hinting at what they cannot reach.
 */
export const DASHBOARD_NAV: NavItem[] = [
  { href: "/", label: ar.nav.dashboard, icon: "dashboard" },
  { href: "/branches", label: ar.nav.branches, icon: "branches", permission: "branch.manage" },
  { href: "/users", label: ar.nav.users, icon: "users", permission: "user.manage" },
  { href: "/classes", label: ar.nav.classes, icon: "classes", permission: "class.read" },
  { href: "/students", label: ar.nav.students, icon: "students", permission: "student.read" },
  { href: "/teachers", label: ar.nav.teachers, icon: "teachers", permission: "teacher.read" },
  { href: "/subjects", label: ar.nav.subjects, icon: "subjects", permission: "subject.manage" },
  { href: "/timetable", label: ar.nav.timetable, icon: "timetable", permission: "timetable.read" },
  {
    href: "/attendance",
    label: ar.nav.attendance,
    icon: "attendance",
    permission: "attendance.read",
  },
  {
    href: "/assessments",
    label: ar.assessments.nav,
    icon: "grades",
    permission: "assessment.read",
  },
  { href: "/fees", label: ar.nav.fees, icon: "fees", permission: "fee.read" },
  { href: "/payroll", label: ar.nav.payroll, icon: "payroll", permission: "payroll.read" },
  { href: "/reports", label: ar.nav.reports, icon: "reports", permission: "report.read" },
  { href: "/audit", label: ar.nav.audit, icon: "audit", permission: "audit.read" },
  { href: "/settings", label: ar.nav.settings, icon: "settings", permission: "settings.manage" },
];

/** The teacher portal (PROJECT_PLAN 10.9) is a separate, much smaller area. */
export const TEACHER_NAV: NavItem[] = [
  { href: "/teacher", label: ar.nav.teacherHome, icon: "attendance" },
  { href: "/teacher/timetable", label: ar.nav.teacherTimetable, icon: "timetable" },
  // Their own students' unexcused absences. No permission entry: every role in this
  // area holds `attendance.read`, and RLS decides which lessons are theirs.
  { href: "/teacher/absences", label: ar.absences.title, icon: "attendance" },
  // Their own papers. No permission entry: every role in this area holds
  // `assessment.read`, and RLS decides which assessments are theirs.
  { href: "/teacher/assessments", label: ar.assessments.nav, icon: "grades" },
  { href: "/teacher/earnings", label: ar.nav.teacherEarnings, icon: "payroll" },
  // A teacher's access code IS their password, so this is the same screen every
  // other role uses — one flow to keep correct rather than two.
  { href: "/change-password", label: ar.nav.changeAccessCode, icon: "key" },
];
