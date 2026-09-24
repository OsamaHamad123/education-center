import { requirePermission } from "@/shared/actions/create-action";
import { env } from "@/shared/config/env";
import { withTenant } from "@/shared/db/with-tenant";
import { ar } from "@/shared/i18n/ar";
import { err, ok, type Result } from "@/shared/lib/result";
import { renderTemplate } from "@/shared/lib/message-template";
import { maskPhone, whatsAppLink } from "@/shared/lib/phone";
import { isoDayOfWeek, todayInCairo } from "@/shared/lib/time";
import { readDateRange, uuidParam } from "@/shared/lib/url-filters";
import {
  absenceAlerts,
  absenceRate,
  attendanceRate,
  totalOf,
  ZERO_COUNTS,
  type StatusCounts,
} from "../../domain/attendance-rates";
import {
  classMatrix,
  compareBranches,
  countByStudent,
  lastContactedAt,
  listReportClasses,
  stoppedPhones,
  openRegistersToday,
  todayPulse,
  type BranchComparisonRow,
  type DayPulse,
  type MatrixSessionColumn,
  type OpenRegister,
  type StudentAttendanceRow,
} from "../../infrastructure/reports.repository";
import { loadAlertSettings, loadMessagingContext } from "./alert-settings";

/**
 * The reports (PROJECT_PLAN 10.7). Counts are summed in SQL; every percentage comes
 * from the pure functions in `domain/attendance-rates.ts`, so the arithmetic is
 * tested once and cannot drift between four screens.
 *
 * Branch scoping is RLS's, not this file's. A branch admin's report covers their own
 * branch because the rows they can read are their own branch's — there is no filter
 * here they could be talked out of.
 */

export type DateRange = { from: string; to: string };

/** The default window: this month so far. Long enough to mean something, short enough to load. */
function defaultRange(): DateRange {
  const today = todayInCairo();
  return { from: `${today.slice(0, 7)}-01`, to: today };
}

/**
 * The range these screens will actually report on.
 *
 * The input is a query string, so it is parsed rather than trusted: an unusable date
 * becomes an absent one and the default fills in (docs/AUDIT-2026-09.md, finding 1).
 * It used to be passed straight to a `date` comparison, and `?from=abc` was a 500.
 */
function resolveRange(input: { from?: string | undefined; to?: string | undefined }): DateRange {
  const fallback = defaultRange();
  const parsed = readDateRange(input);
  return { from: parsed.from ?? fallback.from, to: parsed.to ?? fallback.to };
}

/** Same reasoning for the class filter: a malformed id is no filter, not a crash. */
function resolveClassId(input: { classId?: string | undefined }): string | undefined {
  return uuidParam.parse(input.classId);
}

// --- student attendance -------------------------------------------------------

export type StudentReportRow = StudentAttendanceRow & {
  recorded: number;
  attendancePercent: number;
  absencePercent: number;
};

export type StudentAttendanceReport = {
  range: DateRange;
  classId: string | null;
  classes: { id: string; name: string }[];
  rows: StudentReportRow[];
};

export async function getStudentAttendanceReport(input: {
  from?: string | undefined;
  to?: string | undefined;
  classId?: string | undefined;
}): Promise<Result<StudentAttendanceReport>> {
  const auth = await requirePermission("report.read");
  if (!auth.ok) return auth;
  const branchId = auth.data.branchId;
  if (!branchId) return err("BRANCH_REQUIRED", ar.errors.BRANCH_REQUIRED);

  const range = resolveRange(input);
  if (range.from > range.to) return err("VALIDATION_ERROR", ar.payroll.rangeBackwards);
  const classId = resolveClassId(input);

  return withTenant(auth.data, async (tx) => {
    const rows = await countByStudent(auth.data, tx, range, classId);

    return ok({
      range,
      classId: classId ?? null,
      classes: await listReportClasses(auth.data, tx, branchId),
      rows: rows.map(withRates),
    });
  });
}

// --- the class matrix ---------------------------------------------------------

export type ClassMatrixReport = {
  range: DateRange;
  classId: string | null;
  classes: { id: string; name: string }[];
  /** One per LESSON, in order. The view groups them by date for the header. */
  columns: MatrixSessionColumn[];
  /** The dates above those columns, each with how many periods sit under it. */
  days: { sessionDate: string; periods: number }[];
  students: { studentId: string; fullName: string; studentCode: string }[];
  /** `studentId|sessionId` → the status recorded in that lesson. */
  cells: Record<string, "present" | "absent" | "late" | "excused">;
};

export async function getClassMatrixReport(input: {
  from?: string | undefined;
  to?: string | undefined;
  classId?: string | undefined;
}): Promise<Result<ClassMatrixReport>> {
  const auth = await requirePermission("report.read");
  if (!auth.ok) return auth;
  const branchId = auth.data.branchId;
  if (!branchId) return err("BRANCH_REQUIRED", ar.errors.BRANCH_REQUIRED);

  const range = resolveRange(input);

  return withTenant(auth.data, async (tx) => {
    const classes = await listReportClasses(auth.data, tx, branchId);
    // A malformed id falls back to the first class the viewer can see, exactly as an
    // absent one does. RLS still decides whether a WELL-formed id is theirs.
    const classId = resolveClassId(input) ?? classes[0]?.id;
    if (!classId)
      return ok({ range, classId: null, classes, columns: [], days: [], students: [], cells: {} });

    const [matrix, students] = await Promise.all([
      classMatrix(auth.data, tx, classId, range),
      countByStudent(auth.data, tx, range, classId),
    ]);

    // One cell per LESSON. Nothing is folded: a boy who attends first period and
    // skips second is two different facts, and the register the centre keeps on paper
    // has always had a sub-column for each (photographs, 2026-09-24).
    const cells: ClassMatrixReport["cells"] = {};
    for (const cell of matrix.cells) {
      cells[`${cell.studentId}|${cell.sessionId}`] = cell.status;
    }

    // The dates above the columns, each spanning its own periods — the top row of the
    // header. Counted here rather than in the view, which has no business reducing.
    const days: ClassMatrixReport["days"] = [];
    for (const column of matrix.columns) {
      const last = days.at(-1);
      if (last?.sessionDate === column.sessionDate) {
        last.periods += 1;
        continue;
      }
      days.push({ sessionDate: column.sessionDate, periods: 1 });
    }

    return ok({
      range,
      classId,
      classes,
      columns: matrix.columns,
      days,
      students: students.map((row) => ({
        studentId: row.studentId,
        fullName: row.fullName,
        studentCode: row.studentCode,
      })),
      cells,
    });
  });
}

// --- absence alerts -----------------------------------------------------------

export type AbsenceAlertRow = {
  studentId: string;
  fullName: string;
  studentCode: string;
  className: string;
  absencePercent: number;
  absent: number;
  recorded: number;
  /** A click-to-chat link, PRE-FILLED from the centre's template (P4a). Still no
   * automation: a person presses send. */
  whatsappHref: string;
  maskedPhone: string;
  /** When this parent was last contacted through the product, from the audit log. */
  lastContactedAt: string | null;
  /** This family has asked not to be messaged (`drizzle/0018`). */
  stopped: boolean;
};

export type AbsenceAlertsReport = {
  range: DateRange;
  thresholdPercent: number;
  minSessions: number;
  rows: AbsenceAlertRow[];
};

/**
 * Below this many recorded sessions a percentage is noise, not a signal. Not in the
 * plan; stated here so it is a visible policy rather than a magic number.
 */
const MIN_SESSIONS_FOR_ALERT = 4;

export async function getAbsenceAlerts(input: {
  from?: string | undefined;
  to?: string | undefined;
  threshold?: number | undefined;
}): Promise<Result<AbsenceAlertsReport>> {
  const auth = await requirePermission("report.read");
  if (!auth.ok) return auth;
  if (!auth.data.branchId) return err("BRANCH_REQUIRED", ar.errors.BRANCH_REQUIRED);

  const range = resolveRange(input);

  return withTenant(auth.data, async (tx) => {
    const settings = await loadAlertSettings(auth.data, tx);
    const threshold = input.threshold ?? settings.absenceAlertThresholdPercent;

    const rows = await countByStudent(auth.data, tx, range);
    const alerts = absenceAlerts(
      rows.map((row) => ({ subject: row, counts: row.counts })),
      threshold,
      MIN_SESSIONS_FOR_ALERT,
    );

    const messaging = await loadMessagingContext(auth.data, tx);
    const contacted = await lastContactedAt(
      auth.data,
      tx,
      alerts.map((alert) => alert.subject.studentId),
    );
    const stopped = await stoppedPhones(
      auth.data,
      tx,
      alerts.map((alert) => alert.subject.studentId),
      env.PORTAL_PHONE_SALT,
    );

    return ok({
      range,
      thresholdPercent: threshold,
      minSessions: MIN_SESSIONS_FOR_ALERT,
      rows: alerts.map((alert) => ({
        studentId: alert.subject.studentId,
        fullName: alert.subject.fullName,
        studentCode: alert.subject.studentCode,
        className: alert.subject.className,
        absencePercent: alert.absencePercent,
        absent: alert.counts.absent,
        recorded: alert.total,
        // Pre-filled with the centre's own wording, rendered server-side so the full
        // number and the message are assembled in one place.
        whatsappHref: whatsAppLink(
          alert.subject.parentPhone,
          messaging
            ? renderTemplate(messaging.templateLowAttendance, {
                الطالب: alert.subject.fullName,
                النسبة: String(alert.absencePercent),
                الفرع: messaging.branchName,
                المركز: messaging.centerName,
              })
            : undefined,
        ),
        // The full number never reaches the page (CLAUDE.md); the link carries it.
        maskedPhone: maskPhone(alert.subject.parentPhone),
        lastContactedAt: contacted.get(alert.subject.studentId)?.toISOString() ?? null,
        stopped: stopped.has(alert.subject.studentId),
      })),
    });
  });
}

// --- the branch dashboard -----------------------------------------------------

export type BranchDashboard = {
  date: string;
  pulse: DayPulse;
  attendancePercent: number;
  /** Today's periods nobody has marked — the work, not the count of it. */
  openRegisters: OpenRegister[];
  topAbsent: { fullName: string; className: string; absent: number }[];
};

export async function getBranchDashboard(): Promise<Result<BranchDashboard>> {
  const auth = await requirePermission("report.read");
  if (!auth.ok) return auth;
  if (!auth.data.branchId) return err("BRANCH_REQUIRED", ar.errors.BRANCH_REQUIRED);

  const date = todayInCairo();

  return withTenant(auth.data, async (tx) => {
    const pulse = await todayPulse(auth.data, tx, date, isoDayOfWeek(date));
    const openRegisters = await openRegistersToday(auth.data, tx, date, isoDayOfWeek(date));
    const week = await countByStudent(auth.data, tx, { from: shiftDays(date, -6), to: date });

    return ok({
      date,
      pulse,
      attendancePercent: attendanceRate(pulse.counts),
      openRegisters,
      topAbsent: week
        .filter((row) => row.counts.absent > 0)
        .sort((a, b) => b.counts.absent - a.counts.absent)
        .slice(0, 5)
        .map((row) => ({
          fullName: row.fullName,
          className: row.className,
          absent: row.counts.absent,
        })),
    });
  });
}

// --- the super admin's comparison ---------------------------------------------

export type BranchComparison = {
  range: DateRange;
  rows: (BranchComparisonRow & { attendancePercent: number; recorded: number })[];
};

export async function getBranchComparison(input: {
  from?: string | undefined;
  to?: string | undefined;
}): Promise<Result<BranchComparison>> {
  const auth = await requirePermission("report.cross_branch");
  if (!auth.ok) return auth;

  const range = resolveRange(input);

  return withTenant(auth.data, async (tx) => {
    const rows = await compareBranches(auth.data, tx, range);

    return ok({
      range,
      rows: rows.map((row) => ({
        ...row,
        attendancePercent: attendanceRate(row.counts),
        recorded: totalOf(row.counts),
      })),
    });
  });
}

function withRates(row: StudentAttendanceRow): StudentReportRow {
  return {
    ...row,
    recorded: totalOf(row.counts),
    attendancePercent: attendanceRate(row.counts),
    absencePercent: absenceRate(row.counts),
  };
}

function shiftDays(date: string, days: number): string {
  const shifted = new Date(`${date}T00:00:00Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}

export { ZERO_COUNTS, type StatusCounts };
