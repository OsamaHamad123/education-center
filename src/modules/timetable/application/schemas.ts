import { z } from "zod";

/**
 * Shared between the form and the server action (CLAUDE.md, "Tech stack"). The ranges
 * mirror the CHECK constraints in 7.10/7.11 so the user is told in Arabic what the
 * database would otherwise refuse in English.
 */

export const trackSchema = z.enum(["scientific", "literary"], { message: "اختر المسار" });

const timeSchema = z
  .string()
  .trim()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "صيغة الوقت غير صحيحة (HH:MM)");

export const breakSchema = z.object({
  afterPeriod: z.coerce.number().int().min(1, "رقم الحصة غير صالح").max(12, "رقم الحصة غير صالح"),
  durationMin: z.coerce
    .number()
    .int()
    .min(1, "مدة الفسحة لا تقل عن دقيقة")
    .max(240, "مدة الفسحة لا تزيد عن 240 دقيقة"),
  label: z.string().trim().max(40, "الاسم طويل جداً").nullable().default(null),
});

export const saveScheduleSettingsSchema = z.object({
  track: trackSchema,
  dayStartTime: timeSchema,
  periodDurationMin: z.coerce
    .number()
    .int()
    .min(20, "مدة الحصة لا تقل عن 20 دقيقة")
    .max(180, "مدة الحصة لا تزيد عن 180 دقيقة"),
  periodsCount: z.coerce
    .number()
    .int()
    .min(1, "عدد الحصص لا يقل عن حصة واحدة")
    .max(12, "عدد الحصص لا يزيد عن 12"),
  workingDays: z
    .array(z.coerce.number().int().min(1).max(7))
    .min(1, "اختر يوم عمل واحداً على الأقل")
    .max(7, "أيام غير صالحة"),
  breaks: z.array(breakSchema).max(11, "عدد الفسحات كبير جداً").default([]),
});

export const setSlotSchema = z.object({
  classId: z.uuid("معرّف غير صالح"),
  /** Present when editing an existing cell; absent when filling an empty one. */
  slotId: z.uuid("معرّف غير صالح").optional(),
  subjectId: z.uuid("اختر المادة"),
  teacherId: z.uuid("اختر المعلم"),
  dayOfWeek: z.coerce.number().int().min(1, "يوم غير صالح").max(7, "يوم غير صالح"),
  periodNumber: z.coerce.number().int().min(1, "حصة غير صالحة").max(12, "حصة غير صالحة"),
});

export const clearSlotSchema = z.object({
  slotId: z.uuid("معرّف غير صالح"),
});

export const copyTimetableSchema = z
  .object({
    sourceClassId: z.uuid("اختر الشعبة المصدر"),
    targetClassId: z.uuid("معرّف غير صالح"),
  })
  .refine((value) => value.sourceClassId !== value.targetClassId, {
    message: "اختر شعبة مختلفة",
    path: ["sourceClassId"],
  });
