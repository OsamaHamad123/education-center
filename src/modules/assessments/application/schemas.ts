import { z } from "zod";
import { parseScore } from "@/shared/lib/score";

/**
 * Shared between the marking screen and the server action, so a mark that the form
 * accepted is a mark the action accepts (`shared/lib/validate.ts`).
 *
 * Marks arrive as the TEXT somebody typed and are turned into hundredths here, once.
 * Sending a number would mean the browser had already done the conversion, and two
 * places that convert are two places that can round differently.
 */

const isoDateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "تاريخ غير صالح");

export const assessmentKindSchema = z.enum(["quiz", "monthly", "final", "other"], {
  message: "نوع تقييم غير صالح",
});

/** "17.5", "١٧٫٥" or "20" → hundredths. Refuses anything that is not a mark. */
const scoreTextSchema = z
  .string()
  .trim()
  .transform((value, ctx) => {
    const parsed = parseScore(value);
    if (parsed === null) {
      ctx.addIssue({ code: "custom", message: "درجة غير صالحة" });
      return z.NEVER;
    }
    return parsed;
  });

export const createAssessmentSchema = z.object({
  classId: z.uuid("اختر الشعبة"),
  subjectId: z.uuid("اختر المادة"),
  teacherId: z.uuid("اختر المعلم"),
  name: z.string().trim().min(1, "اكتب اسم التقييم").max(120, "الاسم طويل جداً"),
  kind: assessmentKindSchema,
  assessedOn: isoDateSchema,
  maxScore: scoreTextSchema,
});

export const editAssessmentSchema = z.object({
  assessmentId: z.uuid("معرّف غير صالح"),
  name: z.string().trim().min(1, "اكتب اسم التقييم").max(120, "الاسم طويل جداً"),
  kind: assessmentKindSchema,
  assessedOn: isoDateSchema,
});

export const publishAssessmentSchema = z.object({
  assessmentId: z.uuid("معرّف غير صالح"),
  publish: z.boolean(),
});

export const archiveAssessmentSchema = z.object({
  assessmentId: z.uuid("معرّف غير صالح"),
});

/**
 * One row of the sheet.
 *
 * An empty string is what an untouched field submits, and it means "not marked yet" —
 * not zero. `planScores` leaves those students alone, which is the whole difference
 * between an exam and a register.
 */
export const scoreSchema = z
  .object({
    studentId: z.uuid("معرّف غير صالح"),
    score: z.string().trim().default(""),
    didNotSit: z.boolean().default(false),
    notes: z.string().trim().max(200, "الملاحظة طويلة جداً").nullable().default(null),
  })
  .transform((row, ctx) => {
    if (row.didNotSit) return { ...row, scoreHundredths: null };
    const parsed = parseScore(row.score);
    if (parsed === null) {
      ctx.addIssue({ code: "custom", message: "درجة غير صالحة", path: ["score"] });
      return z.NEVER;
    }
    return { ...row, scoreHundredths: parsed };
  });

export const saveScoresSchema = z.object({
  assessmentId: z.uuid("معرّف غير صالح"),
  scores: z.array(scoreSchema).max(300, "عدد كبير جداً من الطلاب").default([]),
});
