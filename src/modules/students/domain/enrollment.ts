/**
 * Enrollment transitions (PROJECT_PLAN 10.3).
 *
 * `student_enrollments` IS the archive: one open row (`end_date is null`) says where a
 * student is now, and the closed rows say where they have been. Every move is the same
 * shape — close the open row with a reason, open a new one — and getting that pairing
 * wrong is how a student ends up counted twice on an attendance sheet, or vanishes
 * from one.
 *
 * These functions decide WHAT should be written. They touch no database, so every
 * transition below is covered by a unit test rather than a fixture.
 */

export type EnrollmentEndReason = "class_change" | "branch_transfer" | "archived";

export type CurrentEnrollment = {
  id: string;
  branchId: string;
  classId: string;
  startDate: string;
};

export type StudentState = {
  status: "active" | "archived";
  branchId: string;
  classId: string;
  current: CurrentEnrollment | null;
};

/** The writes a transition implies. The use case performs them in one transaction. */
export type EnrollmentPlan = {
  close: { enrollmentId: string; endDate: string; endReason: EnrollmentEndReason } | null;
  open: { branchId: string; classId: string; startDate: string } | null;
  student: Partial<{
    branchId: string;
    classId: string;
    status: "active" | "archived";
    leftDate: string | null;
    leaveReason: string | null;
  }>;
};

export type TransitionError =
  | "STUDENT_ARCHIVED"
  | "STUDENT_ALREADY_ACTIVE"
  | "NO_OPEN_ENROLLMENT"
  | "SAME_CLASS"
  | "SAME_BRANCH"
  | "CLASS_NOT_IN_BRANCH"
  | "REASON_REQUIRED"
  | "DATE_BEFORE_START";

export type TransitionResult = { ok: true; plan: EnrollmentPlan } | { ok: false; error: TransitionError };

const fail = (error: TransitionError): TransitionResult => ({ ok: false, error });

/** Enrolling a new student: no row to close, one to open. */
export function planInitialEnrollment(args: {
  branchId: string;
  classId: string;
  joinDate: string;
}): EnrollmentPlan {
  return {
    close: null,
    open: { branchId: args.branchId, classId: args.classId, startDate: args.joinDate },
    student: { branchId: args.branchId, classId: args.classId, status: "active" },
  };
}

/**
 * Moving to another class in the SAME branch. Past attendance is untouched: it hangs
 * off sessions, which hang off the old class, and history should stay true.
 */
export function planClassChange(
  student: StudentState,
  args: { classId: string; classBranchId: string; onDate: string },
): TransitionResult {
  if (student.status === "archived") return fail("STUDENT_ARCHIVED");
  if (!student.current) return fail("NO_OPEN_ENROLLMENT");
  if (args.classId === student.classId) return fail("SAME_CLASS");
  if (args.classBranchId !== student.branchId) return fail("CLASS_NOT_IN_BRANCH");
  if (args.onDate < student.current.startDate) return fail("DATE_BEFORE_START");

  return {
    ok: true,
    plan: {
      close: { enrollmentId: student.current.id, endDate: args.onDate, endReason: "class_change" },
      open: { branchId: student.branchId, classId: args.classId, startDate: args.onDate },
      student: { classId: args.classId },
    },
  };
}

/**
 * Moving to another BRANCH (super admin only, rule 10.3). The student code is
 * deliberately absent from the plan — it never changes.
 */
export function planBranchTransfer(
  student: StudentState,
  args: { branchId: string; classId: string; classBranchId: string; onDate: string },
): TransitionResult {
  if (student.status === "archived") return fail("STUDENT_ARCHIVED");
  if (!student.current) return fail("NO_OPEN_ENROLLMENT");
  if (args.branchId === student.branchId) return fail("SAME_BRANCH");
  if (args.classBranchId !== args.branchId) return fail("CLASS_NOT_IN_BRANCH");
  if (args.onDate < student.current.startDate) return fail("DATE_BEFORE_START");

  return {
    ok: true,
    plan: {
      close: {
        enrollmentId: student.current.id,
        endDate: args.onDate,
        endReason: "branch_transfer",
      },
      open: { branchId: args.branchId, classId: args.classId, startDate: args.onDate },
      student: { branchId: args.branchId, classId: args.classId },
    },
  };
}

/** Archiving. Both a date and a reason are required — an archive without them is a hole. */
export function planArchive(
  student: StudentState,
  args: { leftDate: string; leaveReason: string },
): TransitionResult {
  if (student.status === "archived") return fail("STUDENT_ARCHIVED");
  if (!student.current) return fail("NO_OPEN_ENROLLMENT");
  if (args.leaveReason.trim().length === 0) return fail("REASON_REQUIRED");
  if (args.leftDate < student.current.startDate) return fail("DATE_BEFORE_START");

  return {
    ok: true,
    plan: {
      close: { enrollmentId: student.current.id, endDate: args.leftDate, endReason: "archived" },
      open: null,
      student: {
        status: "archived",
        leftDate: args.leftDate,
        leaveReason: args.leaveReason.trim(),
      },
    },
  };
}

/**
 * Restoring. Reopens an enrollment in the class the student is being restored INTO,
 * which may differ from the one they left — that class may since have been closed.
 */
export function planRestore(
  student: StudentState,
  args: { classId: string; classBranchId: string; onDate: string },
): TransitionResult {
  if (student.status === "active") return fail("STUDENT_ALREADY_ACTIVE");
  if (args.classBranchId !== student.branchId) return fail("CLASS_NOT_IN_BRANCH");

  return {
    ok: true,
    plan: {
      close: null,
      open: { branchId: student.branchId, classId: args.classId, startDate: args.onDate },
      student: { classId: args.classId, status: "active", leftDate: null, leaveReason: null },
    },
  };
}
