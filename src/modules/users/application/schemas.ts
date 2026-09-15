import { z } from "zod";

export const createBranchAdminSchema = z.object({
  name: z.string().trim().min(3, "الاسم مطلوب").max(100, "الاسم طويل جداً"),
  username: z
    .string()
    .trim()
    .min(3, "اسم المستخدم من 3 إلى 32 حرفاً")
    .max(32, "اسم المستخدم من 3 إلى 32 حرفاً")
    // Must match the username plugin's validator, or the account could never sign in.
    .regex(/^[a-zA-Z0-9_.]+$/, "حروف إنجليزية وأرقام و _ . فقط"),
  branchId: z.uuid("اختر الفرع"),
});

export const userIdSchema = z.object({ id: z.string().min(1, "معرّف غير صالح") });

export const setUserActiveSchema = z.object({
  id: z.string().min(1, "معرّف غير صالح"),
  isActive: z.boolean(),
});
