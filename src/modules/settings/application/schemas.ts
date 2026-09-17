import { z } from "zod";

/**
 * Lives here rather than beside the use case because a `"use server"` file may only
 * export async functions — exporting a schema object from one breaks the build.
 */
const messageTemplate = z.string().trim().min(10, "الرسالة قصيرة جداً").max(600, "الرسالة طويلة جداً");

export const updateSettingsSchema = z.object({
  centerName: z.string().trim().min(2, "اسم المركز مطلوب").max(100, "الاسم طويل جداً"),
  lookupEnabled: z.boolean(),
  portalEnabled: z.boolean(),
  teacherCanMarkAttendance: z.boolean(),
  attendanceEditWindowDays: z.coerce.number().int().min(0, "من 0 إلى 365").max(365, "من 0 إلى 365"),
  absenceAlertThresholdPercent: z.coerce.number().int().min(1, "من 1 إلى 100").max(100, "من 1 إلى 100"),
  teacherTravelMinutes: z.coerce.number().int().min(0, "من 0 إلى 240").max(240, "من 0 إلى 240"),
  // Bounded, not validated for content: the wording is the centre's business, but a
  // template is going into a URL and an empty one would send a blank message.
  templateDailyAbsence: messageTemplate,
  templateRepeatedAbsence: messageTemplate,
  templateLowAttendance: messageTemplate,
});
