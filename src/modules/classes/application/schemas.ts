import { z } from "zod";

export const trackSchema = z.enum(["scientific", "literary"], { message: "اختر المسار" });
export const genderSchema = z.enum(["male", "female", "mixed"], { message: "اختر النوع" });

export const createClassSchema = z.object({
  name: z.string().trim().min(2, "اسم الشعبة مطلوب").max(60, "الاسم طويل جداً"),
  track: trackSchema,
  gender: genderSchema,
  gradeLevel: z.string().trim().min(2, "الصف الدراسي مطلوب").max(60, "النص طويل جداً"),
});

export const updateClassSchema = createClassSchema.extend({ id: z.uuid("معرّف غير صالح") });

export const setClassActiveSchema = z.object({
  id: z.uuid("معرّف غير صالح"),
  isActive: z.boolean(),
});
