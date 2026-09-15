import { z } from "zod";

/**
 * The same schemas validate the form in the browser and the payload on the server
 * (CLAUDE.md, tech stack). Messages are Arabic because they are shown to the user.
 */

export const branchCodeSchema = z
  .string()
  .trim()
  .min(2, "الكود من حرفين إلى خمسة")
  .max(5, "الكود من حرفين إلى خمسة")
  .regex(/^[A-Za-z]+$/, "الكود بحروف إنجليزية فقط");

const optionalText = z
  .string()
  .trim()
  .max(200, "النص طويل جداً")
  .optional()
  .transform((value) => (value === "" ? undefined : value));

export const createBranchSchema = z.object({
  name: z.string().trim().min(2, "اسم الفرع مطلوب").max(100, "الاسم طويل جداً"),
  code: branchCodeSchema,
  address: optionalText,
  phone: optionalText,
});

export const updateBranchSchema = createBranchSchema.extend({
  id: z.uuid("معرّف غير صالح"),
});

export const branchIdSchema = z.object({ id: z.uuid("معرّف غير صالح") });

export const setBranchActiveSchema = z.object({
  id: z.uuid("معرّف غير صالح"),
  isActive: z.boolean(),
});

export type CreateBranchInput = z.input<typeof createBranchSchema>;
export type UpdateBranchInput = z.input<typeof updateBranchSchema>;
