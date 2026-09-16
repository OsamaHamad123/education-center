import { requirePermission } from "@/shared/actions/create-action";
import { withTenant } from "@/shared/db/with-tenant";
import type { SessionStatus } from "@/shared/db/schema";
import { ok, type Result } from "@/shared/lib/result";
import { todayInCairo } from "@/shared/lib/time";
import { readDateRange, uuidParam } from "@/shared/lib/url-filters";
import {
  countMarksBySession,
  listClassOptions,
  listSessions,
  listSubjectOptions,
  listTeacherOptions,
  type SessionRow,
} from "../../infrastructure/attendance.repository";

/**
 * The sessions log (PROJECT_PLAN section 11, `/attendance/sessions`): what actually
 * ran, with the marks counted, so an admin can cancel one, hand it to a substitute,
 * or see that a period was never marked at all.
 */

export type SessionLogRow = SessionRow & {
  markedCount: number;
  absentCount: number;
};

export type SessionLog = {
  rows: SessionLogRow[];
  filters: {
    from: string;
    to: string;
    classId: string | null;
    teacherId: string | null;
    status: SessionStatus | null;
  };
  classes: { id: string; name: string }[];
  teachers: { id: string; fullName: string }[];
  subjects: { id: string; name: string }[];
  /** Whether the viewer may cancel, substitute and add extra sessions. */
  canManage: boolean;
};

const MAX_ROWS = 300;

export async function getSessionLog(input: {
  from?: string | undefined;
  to?: string | undefined;
  classId?: string | undefined;
  teacherId?: string | undefined;
  status?: SessionStatus | undefined;
}): Promise<Result<SessionLog>> {
  const auth = await requirePermission("attendance.read");
  if (!auth.ok) return auth;

  // The `status` filter above the caller has always dropped a typo rather than
  // refusing it, for the reason written at the call site: it is a URL, and a typo in
  // one should not be an error page. The dates and the ids now agree with it
  // (docs/AUDIT-2026-09.md, findings 1 and 2) — they used to reach Postgres and turn
  // `?from=abc` into a 500.
  const requested = readDateRange(input);
  const today = todayInCairo();
  // A fortnight is the window an admin actually works in; anything wider is a report.
  const from = requested.from ?? shiftDays(today, -14);
  const to = requested.to ?? today;
  const classId = uuidParam.parse(input.classId);
  const teacherId = uuidParam.parse(input.teacherId);

  return withTenant(auth.data, async (tx) => {
    const rows = await listSessions(
      auth.data,
      tx,
      {
        from,
        to,
        classId,
        teacherId,
        status: input.status,
      },
      MAX_ROWS,
    );

    const counts = await countMarksBySession(
      auth.data,
      tx,
      rows.map((row) => row.id),
    );

    const branchId = auth.data.branchId;

    return ok({
      rows: rows.map((row) => {
        const marks = counts.get(row.id) ?? [];
        return {
          ...row,
          markedCount: marks.reduce((total, mark) => total + mark.total, 0),
          absentCount: marks.find((mark) => mark.status === "absent")?.total ?? 0,
        };
      }),
      filters: {
        from,
        to,
        classId: classId ?? null,
        teacherId: teacherId ?? null,
        status: input.status ?? null,
      },
      // The pickers are branch-scoped; in "كافة الفروع" mode there is no branch to
      // list options for, and the log itself is read-only anyway.
      classes: branchId ? await listClassOptions(auth.data, tx, branchId) : [],
      teachers: branchId ? await listTeacherOptions(auth.data, tx, branchId) : [],
      subjects: await listSubjectOptions(auth.data, tx),
      canManage: auth.data.role !== "teacher" && branchId !== null,
    });
  });
}

/** Calendar-day arithmetic on `yyyy-MM-dd`, staying inside Cairo's calendar. */
function shiftDays(date: string, days: number): string {
  const shifted = new Date(`${date}T00:00:00Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}
