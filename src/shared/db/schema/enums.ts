import { pgEnum } from "drizzle-orm/pg-core";

/** PROJECT_PLAN section 7 "Enums". Values are the code names, never the Arabic. */

export const userRoleEnum = pgEnum("user_role", ["super_admin", "branch_admin", "teacher"]);

/** المسار — scientific / literary. Deliberately not called "branch_type". */
export const trackEnum = pgEnum("track", ["scientific", "literary"]);

export const genderEnum = pgEnum("gender", ["male", "female", "mixed"]);

export const studentStatusEnum = pgEnum("student_status", ["active", "archived"]);

/** Why an enrollment was closed. */
export const enrollmentEndEnum = pgEnum("enrollment_end", ["class_change", "branch_transfer", "archived"]);

export const sessionStatusEnum = pgEnum("session_status", ["completed", "cancelled"]);

export const attendanceStatusEnum = pgEnum("attendance_status", ["present", "absent", "late", "excused"]);

export const recordStatusEnum = pgEnum("record_status", ["active", "inactive"]);

/** How the office took the money (P5). Cash first, because most of it is cash. */
export const paymentMethodEnum = pgEnum("payment_method", ["cash", "instapay", "wallet", "bank"]);

export const auditActionEnum = pgEnum("audit_action", [
  "create",
  "update",
  "delete",
  "archive",
  "restore",
  "transfer",
  "login",
  "lookup",
  // Opening a WhatsApp conversation about a child (P4a). Not an 'update': the log is a
  // thing you filter, and recording a contact as an edit would make it lie.
  "contact",
]);

export type UserRole = (typeof userRoleEnum.enumValues)[number];
export type Track = (typeof trackEnum.enumValues)[number];
export type Gender = (typeof genderEnum.enumValues)[number];
export type StudentStatus = (typeof studentStatusEnum.enumValues)[number];
export type EnrollmentEnd = (typeof enrollmentEndEnum.enumValues)[number];
export type SessionStatus = (typeof sessionStatusEnum.enumValues)[number];
export type AttendanceStatus = (typeof attendanceStatusEnum.enumValues)[number];
export type RecordStatus = (typeof recordStatusEnum.enumValues)[number];
export type AuditAction = (typeof auditActionEnum.enumValues)[number];
export type PaymentMethod = (typeof paymentMethodEnum.enumValues)[number];
