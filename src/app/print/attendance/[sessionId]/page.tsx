import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { z } from "zod";
import { AttendanceSheetPrint, getAttendanceSheet, getSessionForPrint } from "@/modules/attendance";
import { listVisibleBranches } from "@/modules/branches";
import { getCenterIdentity } from "@/modules/settings";
import { ar } from "@/shared/i18n/ar";

export const metadata: Metadata = { title: ar.print.attendanceSheet };

/**
 * The daily class attendance sheet. Addressed by session id, which exists precisely
 * because there is something to print: a period nobody marked has no session and
 * therefore no sheet.
 */
export default async function PrintAttendancePage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  if (!z.uuid().safeParse(sessionId).success) notFound();

  // By id, not by scanning the log. That scan asked for a century of sessions and got
  // the 300 most recent, so the sheet stopped printing once the branch was a few days
  // past them — and said 404, which is also what a session in another branch says
  // (docs/AUDIT-2026-09.md, finding 14).
  //
  // Scoping is unchanged: the query runs under RLS, so a session in another branch is
  // still simply not there.
  const found = await getSessionForPrint(sessionId);
  if (!found.ok) notFound();
  const session = found.data;

  const [sheet, identity, branches] = await Promise.all([
    getAttendanceSheet({
      classId: session.classId,
      sessionDate: session.sessionDate,
      periodNumber: session.periodNumber,
    }),
    getCenterIdentity(),
    listVisibleBranches(),
  ]);
  if (!sheet.ok || !identity.ok) notFound();

  const branchName =
    (branches.ok ? branches.data.find((branch) => branch.id === session.branchId) : null)?.name ?? null;

  return (
    <AttendanceSheetPrint
      sheet={sheet.data}
      centerName={identity.data.centerName}
      logoPath={identity.data.logoPath}
      branchName={branchName}
    />
  );
}
