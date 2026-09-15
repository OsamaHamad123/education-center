import { z } from "zod";

/**
 * Shared between the marking screen and the server action. The date is a plain
 * `yyyy-MM-dd` string throughout: it is a Cairo calendar day, not a moment, and
 * turning it into a Date on the way through is how timezone bugs start.
 */

export const isoDateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "تاريخ غير صالح");

export const attendanceStatusSchema = z.enum(["present", "absent", "late", "excused"], {
  message: "حالة حضور غير صالحة",
});

export const markSchema = z.object({
  studentId: z.uuid("معرّف غير صالح"),
  status: attendanceStatusSchema,
  notes: z.string().trim().max(300, "الملاحظة طويلة جداً").nullable().default(null),
});

export const saveAttendanceSchema = z.object({
  classId: z.uuid("معرّف غير صالح"),
  sessionDate: isoDateSchema,
  periodNumber: z.coerce.number().int().min(1, "حصة غير صالحة").max(12, "حصة غير صالحة"),
  /** Only the students whose status is NOT present need sending (rule 10.5). */
  marks: z.array(markSchema).max(200, "عدد كبير جداً من الطلاب").default([]),
});

export const cancelSessionSchema = z.object({
  sessionId: z.uuid("معرّف غير صالح"),
  reason: z.string().trim().min(3, "اكتب سبب الإلغاء").max(300, "السبب طويل جداً"),
});

export const restoreSessionSchema = z.object({
  sessionId: z.uuid("معرّف غير صالح"),
});

export const substituteTeacherSchema = z.object({
  sessionId: z.uuid("معرّف غير صالح"),
  teacherId: z.uuid("اختر المعلم البديل"),
});

export const extraSessionSchema = z.object({
  classId: z.uuid("معرّف غير صالح"),
  sessionDate: isoDateSchema,
  periodNumber: z.coerce.number().int().min(1, "حصة غير صالحة").max(12, "حصة غير صالحة"),
  teacherId: z.uuid("اختر المعلم"),
  subjectId: z.uuid("اختر المادة"),
  startTime: z
    .string()
    .trim()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "صيغة الوقت غير صحيحة (HH:MM)"),
  endTime: z
    .string()
    .trim()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "صيغة الوقت غير صحيحة (HH:MM)"),
});
