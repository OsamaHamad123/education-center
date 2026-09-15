import { z } from "zod";
import { normalizeEgyptianPhone } from "@/shared/lib/phone";

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

/**
 * Rates are entered in POUNDS and stored in piasters (CLAUDE.md). The conversion
 * happens here so nothing below this line ever handles a float.
 */
const ratePounds = z.coerce
  .number({ message: "أدخل رقماً" })
  .min(0, "الأجر لا يكون سالباً")
  .max(20_000, "الأجر أكبر من المتوقع — تأكد من الرقم")
  .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 0.001, "بحد أقصى قرشان عشريان")
  .transform((value) => Math.round(value * 100));

export const createTeacherSchema = z.object({
  fullName: z.string().trim().min(5, "الاسم مطلوب").max(120, "الاسم طويل جداً"),
  phone: egyptianPhone,
  specialization: z
    .string()
    .trim()
    .max(60, "النص طويل جداً")
    .optional()
    .transform((value) => (value ? value : null)),
  ratePiastersScientific: ratePounds,
  ratePiastersLiterary: ratePounds,
  /** Link the new teacher to this branch immediately. */
  branchId: z.uuid("اختر الفرع").optional(),
});

export const updateTeacherSchema = z.object({
  id: z.uuid("معرّف غير صالح"),
  fullName: z.string().trim().min(5, "الاسم مطلوب").max(120, "الاسم طويل جداً"),
  specialization: z
    .string()
    .trim()
    .max(60, "النص طويل جداً")
    .optional()
    .transform((value) => (value ? value : null)),
  ratePiastersScientific: ratePounds,
  ratePiastersLiterary: ratePounds,
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "تاريخ غير صالح"),
});

export const teacherIdSchema = z.object({ id: z.uuid("معرّف غير صالح") });

export const setTeacherStatusSchema = z.object({
  id: z.uuid("معرّف غير صالح"),
  status: z.enum(["active", "inactive"]),
});

export const linkTeacherSchema = z.object({ phone: egyptianPhone });

export const setBranchLinkSchema = z.object({
  id: z.uuid("معرّف غير صالح"),
  branchId: z.uuid("اختر الفرع"),
  isActive: z.boolean(),
});
