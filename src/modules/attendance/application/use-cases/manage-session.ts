"use server";

import { isPeriodSettled } from "@/modules/payroll";
import { createAction } from "@/shared/actions/create-action";
import type { ClassSession } from "@/shared/db/schema";
import { ar } from "@/shared/i18n/ar";
import { err, ok } from "@/shared/lib/result";
import { timeRangesOverlap, todayInCairo } from "@/shared/lib/time";
import { canMarkAttendance } from "../../domain/edit-window";
import { planSessionSnapshot, planSubstitution, validateCancellation } from "../../domain/session-plan";
import {
  findClassRef,
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
    if (session.status !== "cancelled") return err("CONFLICT", ar.attendance.notCancelled);
    // And restoring one would increase it. Both directions, same rule.
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

    const rates = await findTeacherRatesInBranch(ctx, tx, input.teacherId, session.branchId);
    if (!rates) return err("CONFLICT", ar.attendance.teacherNotInBranch);

    // The substitute is paid THEIR rate, at the track the session was run at — not
    // the absent teacher's rate, and not the substitute's usual track (rule 10.5).
    const substitution = planSubstitution({
      substituteTeacherId: input.teacherId,
      substituteRates: rates,
      trackApplied: session.trackApplied,
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

    const rates = await findTeacherRatesInBranch(ctx, tx, input.teacherId, classRef.branchId);
    if (!rates) return err("CONFLICT", ar.attendance.teacherNotInBranch);

    const subject = (await listSubjectOptions(ctx, tx)).find((row) => row.id === input.subjectId);
    if (!subject) return err("NOT_FOUND", ar.attendance.noSuchSubject);

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

    return ok(
      await insertSession(ctx, tx, { ...snapshot, branchId: classRef.branchId, classId: classRef.id }),
    );
  },
});
