import { z } from "zod";
import { normalizeEgyptianPhone } from "@/shared/lib/phone";

/**
 * Phones are normalized IN the schema, so every layer below works with E.164 only
 * (rule 10.3). A form may send `01012345678`; nothing downstream ever sees that shape.
 */
const egyptianPhone = z
  .string()
  .trim()
  .transform((value, ctx) => {
    const normalized = normalizeEgyptianPhone(value);
    if (!normalized) {
      ctx.addIssue({ code: "custom", message: "رقم موبايل مصري غير صالح" });
      return z.NEVER;
    }
    return normalized;
  });

const optionalEgyptianPhone = z
  .string()
  .trim()
  .optional()
  .transform((value, ctx) => {
    if (!value) return null;
    const normalized = normalizeEgyptianPhone(value);
    if (!normalized) {
      ctx.addIssue({ code: "custom", message: "رقم موبايل مصري غير صالح" });
      return z.NEVER;
    }
    return normalized;
  });

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, "النص طويل جداً")
    .optional()
    .transform((value) => (value ? value : null));

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "تاريخ غير صالح");

export const createStudentSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(5, "الاسم رباعي مطلوب")
    .max(120, "الاسم طويل جداً")
    .refine((value) => value.split(/\s+/).length >= 3, "اكتب الاسم ثلاثياً على الأقل"),
  classId: z.uuid("اختر الشعبة"),
  parentPhone: egyptianPhone,
  parentWhatsapp: optionalEgyptianPhone,
  studentPhone: optionalEgyptianPhone,
  studentWhatsapp: optionalEgyptianPhone,
  nationalId: optionalText(20),
  joinDate: isoDate,
  /** Set once the person at the desk has seen the duplicate warning and chosen to go on. */
  confirmDuplicate: z.boolean().optional().default(false),
});

export const updateStudentSchema = createStudentSchema
  .omit({ classId: true, joinDate: true, confirmDuplicate: true })
  .extend({ id: z.uuid("معرّف غير صالح") });

export const changeClassSchema = z.object({
  id: z.uuid("معرّف غير صالح"),
  classId: z.uuid("اختر الشعبة"),
  onDate: isoDate,
});

export const transferBranchSchema = z.object({
  id: z.uuid("معرّف غير صالح"),
  branchId: z.uuid("اختر الفرع"),
  classId: z.uuid("اختر الشعبة"),
  onDate: isoDate,
});

export const archiveStudentSchema = z.object({
  id: z.uuid("معرّف غير صالح"),
  leftDate: isoDate,
  leaveReason: z.string().trim().min(3, "سبب المغادرة مطلوب").max(200, "النص طويل جداً"),
});

export const restoreStudentSchema = z.object({
  id: z.uuid("معرّف غير صالح"),
  classId: z.uuid("اختر الشعبة"),
  onDate: isoDate,
});

export const studentFiltersSchema = z.object({
  search: z.string().trim().min(1).max(60).optional().catch(undefined),
  classId: z.uuid().optional().catch(undefined),
  status: z.enum(["active", "archived"]).default("active").catch("active"),
  transferredOut: z
    .enum(["1", "0"])
    .optional()
    .catch(undefined)
    .transform((value) => value === "1"),
  page: z.coerce.number().int().min(1).default(1).catch(1),
});

export type CreateStudentInput = z.input<typeof createStudentSchema>;
