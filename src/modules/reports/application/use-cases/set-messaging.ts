"use server";

import { z } from "zod";
import { createAction } from "@/shared/actions/create-action";
import { env } from "@/shared/config/env";
import { ar } from "@/shared/i18n/ar";
import { err, ok } from "@/shared/lib/result";
import { setStoppedForStudent } from "../../infrastructure/reports.repository";

/**
 * "This family has asked us to stop" — recorded from the office side
 * (`drizzle/0018`; docs/MESSAGING-AND-FEES-PLAN.md, P4c step 2).
 *
 * The parent can do it themselves in the portal; this is for the far commoner case of
 * their ringing and saying so. Both write the same row, and both screens that message
 * anybody read it.
 *
 * Taken by STUDENT id rather than by phone, deliberately: the office is looking at a
 * child on a screen, the phone is not on that screen (it is masked), and a request that
 * carried a phone number would be a request that could carry somebody else's.
 */
const schema = z.object({
  studentId: z.uuid("معرّف غير صالح"),
  stop: z.boolean(),
});

export const setFamilyMessaging = createAction({
  permission: "report.read",
  schema,
  audit: {
    action: "update",
    entity: "parent.messaging",
    entityId: (out: { studentId: string }) => out.studentId,
  },
  revalidate: { paths: ["/attendance/contact", "/reports/alerts"] },
  handler: async ({ tx, ctx, input }) => {
    // The student is read through RLS by the update itself: a child in another branch
    // matches nothing, so a forged id silences nobody.
    const done = await setStoppedForStudent(ctx, tx, input.studentId, env.PORTAL_PHONE_SALT, input.stop);
    if (!done) return err("NOT_FOUND", ar.errors.NOT_FOUND);
    return ok({ studentId: input.studentId });
  },
});
