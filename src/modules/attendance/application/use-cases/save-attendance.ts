"use server";

import { isPeriodSettled } from "@/modules/payroll";
import { createAction } from "@/shared/actions/create-action";
import type { TenantContext } from "@/shared/auth/tenant-context";
import type { Tx } from "@/shared/db/client";
import { ar } from "@/shared/i18n/ar";
import { err, ok } from "@/shared/lib/result";
import { isoDayOfWeek, todayInCairo } from "@/shared/lib/time";
import { canMarkAttendance } from "../../domain/edit-window";
import { planAttendance, rosterFor } from "../../domain/roster";
import { planSessionSnapshot } from "../../domain/session-plan";
import {
  findClassRef,
  findTeacherRatesInBranch,
  insertSession,
  listDayPeriods,
  listEnrollmentPeriods,
  listSessionsForDay,
  upsertMarks,
} from "../../infrastructure/attendance.repository";
import { loadMarkingPolicy } from "../queries/marking-policy";
import { saveAttendanceSchema } from "../schemas";

/**
 * Saving a register (PROJECT_PLAN 10.5). Three things happen here and the order
 * matters:
 *
 *   1. May this person write this day at all? Asked before anything is read, so a
 *      late edit is refused in Arabic rather than by a policy returning zero rows.
 *   2. Does the session exist? If not it is created NOW, snapshotting the subject,
 *      the times, the track and the teacher's rate — lazily, on the first save, never
 *      on merely opening the screen.
 *   3. The marks are upserted on `(session_id, student_id)`, so the same save sent
 *      twice by a phone on a bad connection is harmless.
 *
 * All of it in one transaction: a session with no register would be counted by
 * payroll as a lesson nobody attended.
 */

export type SaveAttendanceResult = {
  sessionId: string;
  saved: number;
  /** Students the client did not send, written as present (the one-tap case). */
  defaulted: number;
};

export const saveAttendance = createAction({
  permission: "attendance.mark",
  schema: saveAttendanceSchema,
  requireBranch: false, // a teacher has no branch of their own; RLS scopes them
  audit: { action: "update", entity: "attendance", entityId: (r: SaveAttendanceResult) => r.sessionId },
  revalidate: { paths: ["/attendance", "/teacher"] },
  handler: async ({ tx, ctx, input }) => {
    const classRef = await findClassRef(ctx, tx, input.classId);
    if (!classRef) return err("NOT_FOUND", ar.errors.NOT_FOUND);

    const policy = await loadMarkingPolicy(ctx, tx);
    const violation = canMarkAttendance({
      role: ctx.role,
      sessionDate: input.sessionDate,
      today: todayInCairo(),
      ...policy,
    });
    if (violation) return err("FORBIDDEN", ar.attendance.violations[violation]);

    const session = await findOrCreateSession(ctx, tx, classRef, input);
    if (!session.ok) return session;

    if (session.data.status === "cancelled") {
      return err("CONFLICT", ar.attendance.sessionCancelled);
    }

    // The freeze (drizzle/0016). Once this teacher's month has been paid, its registers
    // stop being editable — the money is out the door and a quiet correction afterwards
    // is the difference between a ledger and a spreadsheet. Reversing the settlement,
    // which somebody signs their name to, opens the month again.
    if (await isPeriodSettled(ctx, tx, session.data.branchId, session.data.teacherId, input.sessionDate)) {
      return err("CONFLICT", ar.payroll.periodSettled);
    }

    // The roster is the authority, not the payload: a student who was not enrolled in
    // this class on this day is dropped rather than written (see `planAttendance`).
    const enrollments = await listEnrollmentPeriods(ctx, tx, input.classId);
    const roster = rosterFor(enrollments, input.classId, input.sessionDate);
    if (roster.size === 0) return err("CONFLICT", ar.attendance.emptyRoster);

    const plan = planAttendance(roster, input.marks);
    const saved = await upsertMarks(
      ctx,
      tx,
      plan.upserts.map((mark) => ({
        sessionId: session.data.id,
        branchId: classRef.branchId,
        studentId: mark.studentId,
        status: mark.status,
        notes: mark.notes,
      })),
    );

    return ok({
      sessionId: session.data.id,
      saved,
      defaulted: plan.defaulted.length,
    } satisfies SaveAttendanceResult);
  },
});

/**
 * The lazy creation. Returns the existing session if the register has been saved
 * before — including one whose teacher has since been substituted, because the
 * session is the record of what happened, not the timetable.
 */
async function findOrCreateSession(
  ctx: TenantContext,
  tx: Tx,
  classRef: { id: string; branchId: string; track: "scientific" | "literary" },
  input: { classId: string; sessionDate: string; periodNumber: number },
) {
  const existing = (await listSessionsForDay(ctx, tx, input.classId, input.sessionDate)).find(
    (row) => row.periodNumber === input.periodNumber,
  );
  if (existing) return ok(existing);

  const slots = await listDayPeriods(ctx, tx, input.classId, isoDayOfWeek(input.sessionDate));
  const slot = slots.find((row) => row.periodNumber === input.periodNumber);
  // No slot and no session means there was never a lesson to mark. An extra session
  // is created deliberately, through its own use case, not by saving a register.
  if (!slot) return err("NOT_FOUND", ar.attendance.noSuchPeriod);

  const rates = await findTeacherRatesInBranch(ctx, tx, slot.teacherId, classRef.branchId);
  if (!rates) return err("CONFLICT", ar.attendance.teacherNotInBranch);

  const snapshot = planSessionSnapshot({
    period: {
      timetableSlotId: slot.timetableSlotId,
      subjectName: slot.subjectName,
      periodNumber: slot.periodNumber,
      startTime: slot.startTime.slice(0, 5),
      endTime: slot.endTime.slice(0, 5),
      teacherId: slot.teacherId,
    },
    sessionDate: input.sessionDate,
    classTrack: classRef.track,
    teacherRates: rates,
  });

  const created = await insertSession(ctx, tx, {
    ...snapshot,
    branchId: classRef.branchId,
    classId: classRef.id,
  });

  return ok({ ...created, status: created.status });
}
