"use server";

import { isPeriodSettled } from "@/modules/payroll";
import { createAction } from "@/shared/actions/create-action";
import type { ClassSession } from "@/shared/db/schema";
import { ar } from "@/shared/i18n/ar";
import { err, ok } from "@/shared/lib/result";
import { timeRangesOverlap, todayInCairo } from "@/shared/lib/time";
import { canMarkAttendance } from "../../domain/edit-window";
import {
  checkMakeUp,
  checkRestore,
  makeUpNeedsCancelling,
  planSessionSnapshot,
  planSubstitution,
  validateCancellation,
} from "../../domain/session-plan";
import {
  findClassRef,
  findMakeUpOf,
  findSessionById,
  findTeacherRatesInBranch,
  insertSession,
  listSessionsForDay,
  listSubjectOptions,
  updateSession,
} from "../../infrastructure/attendance.repository";
import { loadMarkingPolicy } from "../queries/marking-policy";
import {
  cancelSessionSchema,
  extraSessionSchema,
  restoreSessionSchema,
  substituteTeacherSchema,
} from "../schemas";

/**
 * The three things an admin does to a session after the fact (rule 10.5):
 * cancel it, hand it to a substitute, or add one that was never on the timetable.
 *
 * All three are `session.manage`, which teachers do not hold — a teacher marks their
 * own register and nothing more.
 */

export const cancelSession = createAction({
  permission: "session.manage",
  schema: cancelSessionSchema,
  audit: { action: "update", entity: "class_session.cancel", entityId: (s: ClassSession) => s.id },
  revalidate: { paths: ["/attendance", "/attendance/sessions"] },
  handler: async ({ tx, ctx, input }) => {
    const session = await findSessionById(ctx, tx, input.sessionId);
    if (!session) return err("NOT_FOUND", ar.errors.NOT_FOUND);

    // Cancelling a lesson in a settled month would reduce what was owed AFTER it was
    // paid. Same freeze as the register itself.
    if (await isPeriodSettled(ctx, tx, session.branchId, session.teacherId, session.sessionDate)) {
      return err("CONFLICT", ar.payroll.periodSettled);
    }

    const violation = validateCancellation({ status: session.status, reason: input.reason });
    if (violation === "ALREADY_CANCELLED") return err("CONFLICT", ar.attendance.alreadyCancelled);
    if (violation === "REASON_REQUIRED") {
      return err("VALIDATION_ERROR", ar.attendance.reasonRequired, {
        reason: [ar.attendance.reasonRequired],
      });
    }

    // Attendance already recorded is KEPT (rule 10.5) — only payroll stops counting
    // the session. Deleting the register would erase who actually turned up.
    const updated = await updateSession(ctx, tx, input.sessionId, {
      status: "cancelled",
      cancelReason: input.reason.trim(),
    });
    if (!updated) return err("NOT_FOUND", ar.errors.NOT_FOUND);
    return ok(updated);
  },
});

export const restoreSession = createAction({
  permission: "session.manage",
  schema: restoreSessionSchema,
  audit: { action: "update", entity: "class_session.restore", entityId: (s: ClassSession) => s.id },
  revalidate: { paths: ["/attendance", "/attendance/sessions"] },
  handler: async ({ tx, ctx, input }) => {
    const session = await findSessionById(ctx, tx, input.sessionId);
    if (!session) return err("NOT_FOUND", ar.errors.NOT_FOUND);

    // Both rules in one place: it must be cancelled, and nothing may still be standing
    // in for it. The second is what stops the double payment coming back through the
    // restore button after `drizzle/0020` closed the front door.
    const violation = checkRestore({
      status: session.status,
      makeUp: await findMakeUpOf(ctx, tx, session.id),
    });
    if (violation === "NOT_CANCELLED") return err("CONFLICT", ar.attendance.notCancelled);
    if (violation === "ALREADY_MADE_UP") return err("CONFLICT", ar.attendance.makeUp.RESTORE_MADE_UP);

    // And restoring one would increase what is owed. Both directions, same rule.
    if (await isPeriodSettled(ctx, tx, session.branchId, session.teacherId, session.sessionDate)) {
      return err("CONFLICT", ar.payroll.periodSettled);
    }

    // The CHECK constraint pairs the status with the reason, so the reason must go.
    const updated = await updateSession(ctx, tx, input.sessionId, {
      status: "completed",
      cancelReason: null,
    });
    if (!updated) return err("NOT_FOUND", ar.errors.NOT_FOUND);
    return ok(updated);
  },
});

export const setSubstituteTeacher = createAction({
  permission: "session.manage",
  schema: substituteTeacherSchema,
  audit: { action: "update", entity: "class_session.substitute", entityId: (s: ClassSession) => s.id },
  revalidate: { paths: ["/attendance", "/attendance/sessions"] },
  handler: async ({ tx, ctx, input }) => {
    const session = await findSessionById(ctx, tx, input.sessionId);
    if (!session) return err("NOT_FOUND", ar.errors.NOT_FOUND);
    if (session.teacherId === input.teacherId) return err("CONFLICT", ar.attendance.sameTeacher);

    // BOTH months, not one. A hand-over does not change what a lesson is worth — it
    // changes WHOSE it is, so it takes the money off one teacher's month and puts it
    // on another's. Either being settled means a figure that has already been paid
    // would move, and the guard cancelling and restoring have always had was simply
    // missing here (`drizzle/0020`).
    if (await isPeriodSettled(ctx, tx, session.branchId, session.teacherId, session.sessionDate)) {
      return err("CONFLICT", ar.payroll.periodSettled);
    }
    if (await isPeriodSettled(ctx, tx, session.branchId, input.teacherId, session.sessionDate)) {
      return err("CONFLICT", ar.payroll.substitutePeriodSettled);
    }

    const rates = await findTeacherRatesInBranch(ctx, tx, input.teacherId, session.branchId);
    if (!rates) return err("CONFLICT", ar.attendance.teacherNotInBranch);

    // The substitute is paid THEIR rate, at the track the session was run at — not
    // the absent teacher's rate, and not the substitute's usual track (rule 10.5).
    // It also records whose lesson it was, which overwriting `teacher_id` destroyed.
    const substitution = planSubstitution({
      substituteTeacherId: input.teacherId,
      substituteRates: rates,
      trackApplied: session.trackApplied,
      currentTeacherId: session.teacherId,
      substitutedFromTeacherId: session.substitutedFromTeacherId,
    });

    const updated = await updateSession(ctx, tx, input.sessionId, substitution);
    if (!updated) return err("NOT_FOUND", ar.errors.NOT_FOUND);
    return ok(updated);
  },
});

export const createExtraSession = createAction({
  permission: "session.manage",
  schema: extraSessionSchema,
  audit: { action: "create", entity: "class_session.extra", entityId: (s: ClassSession) => s.id },
  revalidate: { paths: ["/attendance", "/attendance/sessions"] },
  handler: async ({ tx, ctx, input }) => {
    if (input.endTime <= input.startTime) {
      return err("VALIDATION_ERROR", ar.attendance.timesOrdered, {
        endTime: [ar.attendance.timesOrdered],
      });
    }

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

    const sameDay = await listSessionsForDay(ctx, tx, input.classId, input.sessionDate);
    if (sameDay.some((session) => session.periodNumber === input.periodNumber)) {
      return err("CONFLICT", ar.attendance.periodTaken, { periodNumber: [ar.attendance.periodTaken] });
    }
    // The unique key is (class, date, period), so nothing stops two sessions that
    // overlap in TIME under different period numbers. A class cannot be in two
    // lessons at once either, so check the clock as well as the number.
    const clash = sameDay.find(
      (session) =>
        session.status === "completed" &&
        timeRangesOverlap(
          input.startTime,
          input.endTime,
          session.startTime.slice(0, 5),
          session.endTime.slice(0, 5),
        ),
    );
    if (clash) return err("CONFLICT", ar.attendance.timeTaken);

    // An extra session ADDS a lesson's pay, so it cannot be added to a month that has
    // already been handed over. Cancelling has refused this since `drizzle/0016`;
    // creating did not, and it moves the total in the same direction.
    if (await isPeriodSettled(ctx, tx, classRef.branchId, input.teacherId, input.sessionDate)) {
      return err("CONFLICT", ar.payroll.periodSettled);
    }

    const rates = await findTeacherRatesInBranch(ctx, tx, input.teacherId, classRef.branchId);
    if (!rates) return err("CONFLICT", ar.attendance.teacherNotInBranch);

    const subject = (await listSubjectOptions(ctx, tx)).find((row) => row.id === input.subjectId);
    if (!subject) return err("NOT_FOUND", ar.attendance.noSuchSubject);

    // --- the lesson this one makes up for, if it makes up for one -----------------
    //
    // Everything below runs inside the action's transaction, so a make-up either
    // links AND cancels, or neither. Half of it — an extra session recorded and the
    // original left standing — is precisely the double payment (`drizzle/0020`).
    const original = input.makesUpSessionId ? await findSessionById(ctx, tx, input.makesUpSessionId) : null;

    if (input.makesUpSessionId) {
      // A session in another branch is invisible under RLS, so this is 404, not 403.
      if (!original) return err("NOT_FOUND", ar.errors.NOT_FOUND);

      const problem = checkMakeUp({
        original: {
          id: original.id,
          classId: original.classId,
          sessionDate: original.sessionDate,
          madeUpBy: (await findMakeUpOf(ctx, tx, original.id))?.id ?? null,
        },
        makeUp: { classId: input.classId, sessionDate: input.sessionDate },
      });
      if (problem) return err("CONFLICT", ar.attendance.makeUp[problem]);

      // The missed lesson's own month must be open too: cancelling it here is a
      // cancellation, and it takes money off a teacher who may already have been paid.
      if (await isPeriodSettled(ctx, tx, original.branchId, original.teacherId, original.sessionDate)) {
        return err("CONFLICT", ar.payroll.originalPeriodSettled);
      }
    }

    const snapshot = planSessionSnapshot({
      period: {
        // No slot: that is exactly what makes it an extra session, and the CHECK
        // constraint `extra ⇒ no slot` is what keeps the two in step.
        timetableSlotId: null,
        subjectName: subject.name,
        periodNumber: input.periodNumber,
        startTime: input.startTime,
        endTime: input.endTime,
        teacherId: input.teacherId,
      },
      sessionDate: input.sessionDate,
      classTrack: classRef.track,
      teacherRates: rates,
    });

    // Cancel the missed lesson in the same transaction, if the office had not already.
    // The reason names the replacement, so "why was there no lesson on Sunday" reads
    // as an answer rather than as a gap.
    if (original && makeUpNeedsCancelling(original.status)) {
      const cancelled = await updateSession(ctx, tx, original.id, {
        status: "cancelled",
        cancelReason: ar.attendance.makeUpCancelReason(input.sessionDate, input.periodNumber),
      });
      if (!cancelled) return err("NOT_FOUND", ar.errors.NOT_FOUND);
    }

    return ok(
      await insertSession(ctx, tx, {
        ...snapshot,
        branchId: classRef.branchId,
        classId: classRef.id,
        makesUpSessionId: original?.id ?? null,
      }),
    );
  },
});
