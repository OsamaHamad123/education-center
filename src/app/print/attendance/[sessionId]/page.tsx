import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { z } from "zod";
import { AttendanceSheetPrint, getAttendanceSheet, getSessionLog } from "@/modules/attendance";
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

  // The log is already scoped by RLS, so a session in another branch is simply not
  // in it — no separate authorisation check to keep in step with the policy.
  const log = await getSessionLog({ from: "2000-01-01", to: "2100-01-01" });
  if (!log.ok) notFound();

  const session = log.data.rows.find((row) => row.id === sessionId);
  if (!session) notFound();

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
