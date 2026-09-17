import { timeRangesOverlap, timeToMinutes, type IsoTime } from "@/shared/lib/time";

/**
 * Timetable conflicts (PROJECT_PLAN 7.12, 10.4).
 *
 * The database already refuses a double-booked teacher: `no_teacher_overlap` is a gist
 * exclusion constraint across ALL branches. That is the guarantee. What it cannot do
 * is explain itself — and explaining it is exactly where branch isolation gets hard,
 * because the class the teacher is busy with may be in a branch the person editing is
 * not allowed to know exists.
 *
 * So this file does two separate jobs, deliberately kept apart:
 *   `findConflicts`  — what is actually wrong (the full truth).
 *   `redactConflict` — how much of that truth this viewer may be told.
 *
 * Nothing here touches the database; the caller supplies the slots it can see, plus
 * the cross-branch teacher slots, which it must fetch through a narrow lookup.
 */

export type PlannedSlot = {
  classId: string;
  teacherId: string;
  dayOfWeek: number;
  periodNumber: number;
  startTime: IsoTime;
  endTime: IsoTime;
};

/** An existing slot, with the labels a message might want to name. */
export type ExistingSlot = PlannedSlot & {
  id: string;
  branchId: string;
  className: string;
  branchName: string;
};

export type SlotConflict =
  /** The class already has something in that period. */
  | { kind: "class_busy"; with: ExistingSlot }
  /** The teacher is in another classroom at that moment — possibly another branch. */
  | { kind: "teacher_busy"; with: ExistingSlot }
  /**
   * The teacher is free at that moment but cannot get there (§16 question 4). Between
   * BRANCHES only: two lessons in one building are back to back by design.
   */
  | { kind: "teacher_travel"; with: ExistingSlot; gapMinutes: number };

/**
 * Every reason `candidate` cannot be written, given the slots that already exist.
 * `ignoreSlotId` is the slot being edited, which must not conflict with itself.
 */
export function findConflicts(
  candidate: PlannedSlot,
  existing: readonly ExistingSlot[],
  options: { ignoreSlotId?: string; travelMinutes?: number; candidateBranchId?: string } = {},
): SlotConflict[] {
  const conflicts: SlotConflict[] = [];
  const travelMinutes = options.travelMinutes ?? 0;

  for (const slot of existing) {
    if (slot.id === options.ignoreSlotId) continue;
    if (slot.dayOfWeek !== candidate.dayOfWeek) continue;

    if (slot.classId === candidate.classId && slot.periodNumber === candidate.periodNumber) {
      conflicts.push({ kind: "class_busy", with: slot });
      continue;
    }

    if (slot.teacherId !== candidate.teacherId) continue;

    if (timeRangesOverlap(candidate.startTime, candidate.endTime, slot.startTime, slot.endTime)) {
      conflicts.push({ kind: "teacher_busy", with: slot });
      continue;
    }

    // A gap rule inside one building would refuse the ordinary day, which is what a
    // bell schedule is. Only a hop between branches needs travelling to.
    if (travelMinutes <= 0) continue;
    if (options.candidateBranchId === undefined || slot.branchId === options.candidateBranchId) continue;

    const gap = gapMinutesBetween(candidate, slot);
    if (gap < travelMinutes) {
      conflicts.push({ kind: "teacher_travel", with: slot, gapMinutes: gap });
    }
  }

  return conflicts;
}

/** Whole minutes between two non-overlapping ranges on the same day. */
export function gapMinutesBetween(
  a: { startTime: IsoTime; endTime: IsoTime },
  b: { startTime: IsoTime; endTime: IsoTime },
): number {
  const aStart = timeToMinutes(a.startTime);
  const aEnd = timeToMinutes(a.endTime);
  const bStart = timeToMinutes(b.startTime);
  const bEnd = timeToMinutes(b.endTime);

  if (bStart >= aEnd) return bStart - aEnd;
  if (aStart >= bEnd) return aStart - bEnd;
  return 0;
}

export type ViewerRole = "super_admin" | "branch_admin" | "teacher";

/**
 * What the viewer is allowed to be told about a conflict.
 *
 * `detail: "none"` is not a vaguer wording of the same message — it is the absence of
 * the other branch's name and the other class's name, which a branch admin may never
 * learn (CLAUDE.md, "Multi-branch isolation"). Getting this wrong turns an error
 * message into a cross-branch enumeration oracle: type a teacher into every period and
 * read back the other branch's timetable from the failures.
 */
export type RedactedConflict =
  | { kind: "class_busy"; className: string; periodNumber: number }
  | { kind: "teacher_busy"; detail: "same_branch"; className: string; periodNumber: number }
  | { kind: "teacher_busy"; detail: "other_branch"; branchName: string; className: string }
  | { kind: "teacher_busy"; detail: "none" }
  /**
   * Travel time (§16 q4). The minutes are told to everybody — a number names nobody —
   * and only a super admin is told WHICH branch the teacher has to get to.
   */
  | { kind: "teacher_travel"; detail: "other_branch"; branchName: string; gapMinutes: number }
  | { kind: "teacher_travel"; detail: "none"; gapMinutes: number };

export function redactConflict(
  conflict: SlotConflict,
  viewer: { role: ViewerRole; branchId: string | null },
): RedactedConflict {
  const slot = conflict.with;

  if (conflict.kind === "class_busy") {
    // The clash is inside the class being edited, so its name is already on screen.
    return { kind: "class_busy", className: slot.className, periodNumber: slot.periodNumber };
  }

  if (conflict.kind === "teacher_travel") {
    return viewer.role === "super_admin"
      ? {
          kind: "teacher_travel",
          detail: "other_branch",
          branchName: slot.branchName,
          gapMinutes: conflict.gapMinutes,
        }
      : { kind: "teacher_travel", detail: "none", gapMinutes: conflict.gapMinutes };
  }

  if (viewer.branchId !== null && slot.branchId === viewer.branchId) {
    return {
      kind: "teacher_busy",
      detail: "same_branch",
      className: slot.className,
      periodNumber: slot.periodNumber,
    };
  }

  // Only the super admin oversees every branch, so only they may be told which one.
  if (viewer.role === "super_admin") {
    return {
      kind: "teacher_busy",
      detail: "other_branch",
      branchName: slot.branchName,
      className: slot.className,
    };
  }

  return { kind: "teacher_busy", detail: "none" };
}

/** Convenience for the common case: the first reason, already redacted. */
export function firstRedactedConflict(
  conflicts: readonly SlotConflict[],
  viewer: { role: ViewerRole; branchId: string | null },
): RedactedConflict | null {
  const first = conflicts[0];
  return first ? redactConflict(first, viewer) : null;
}
