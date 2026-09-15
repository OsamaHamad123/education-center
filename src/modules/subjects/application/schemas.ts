import { z } from "zod";

export const createSubjectSchema = z.object({
  name: z.string().trim().min(2, "اسم المادة مطلوب").max(60, "الاسم طويل جداً"),
});

export const updateSubjectSchema = createSubjectSchema.extend({
  id: z.uuid("معرّف غير صالح"),
});

export const setSubjectActiveSchema = z.object({
  id: z.uuid("معرّف غير صالح"),
  isActive: z.boolean(),
});
