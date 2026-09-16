import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getPortalView } from "@/modules/portal";
import { getPublicCenterInfo } from "@/modules/settings";
import { ar } from "@/shared/i18n/ar";
import { formatDisplayDate } from "@/shared/lib/time";
import { PrintSheet } from "@/shared/ui/print-sheet";

export const metadata: Metadata = {
  title: ar.portal.print,
  robots: { index: false, follow: false, nocache: true },
};

export const dynamic = "force-dynamic";

/**
 * A parent's printable record (docs/PARENT-PORTAL-PLAN.md, P3).
 *
 * The A4 sheet is the same one the office prints, because a parent asked for "a paper
 * showing his attendance" is asking for a document the centre would recognise.
 *
 * It re-runs the whole query rather than trusting anything in the URL: the student id
 * here is checked against the session's parent in SQL, exactly as on the screen.
 */
export default async function PortalPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ studentId?: string; from?: string; to?: string }>;
}) {
  const params = await searchParams;
  // `getPublicCenterInfo`, not `getCenterIdentity`: the latter needs `settings.read`,
  // which is a STAFF permission — a parent has no role at all, so it refused and the
  // sheet 404'd for the very people it is for.
  const [view, centre] = await Promise.all([getPortalView(params), getPublicCenterInfo()]);
  if (!view.ok) notFound();

  const { attendance, range } = view.data;
  const counts = attendance.counts;
  const recorded = counts.present + counts.absent + counts.late + counts.excused;

  return (
    <PrintSheet
      orientation="portrait"
      centerName={centre.centerName}
      logoPath={centre.logoPath}
      branchName={attendance.branchName}
      title={`${ar.portal.attendanceTitle} — ${attendance.fullName}`}
      subtitle={`${attendance.className} · ${formatDisplayDate(range.from)} — ${formatDisplayDate(range.to)}`}
    >
      <table className="w-full border-collapse text-sm">
        <tbody>
          <tr>
            <th className="border p-2 text-start">{ar.attendanceStatus.present}</th>
            <td className="border p-2">{counts.present}</td>
            <th className="border p-2 text-start">{ar.attendanceStatus.absent}</th>
            <td className="border p-2">{counts.absent}</td>
          </tr>
          <tr>
            <th className="border p-2 text-start">{ar.attendanceStatus.late}</th>
            <td className="border p-2">{counts.late}</td>
            <th className="border p-2 text-start">{ar.attendanceStatus.excused}</th>
            <td className="border p-2">{counts.excused}</td>
          </tr>
          <tr>
            <th className="border p-2 text-start">{ar.reports.attendanceRate}</th>
            <td className="border p-2" colSpan={3} dir="ltr">
              {recorded === 0 ? "—" : `${Math.round((counts.present / recorded) * 100)}%`}
            </td>
          </tr>
        </tbody>
      </table>

      <h2 className="mt-4 mb-2 font-bold">{ar.portal.absencesTitle}</h2>
      {attendance.absences.length === 0 ? (
        <p className="text-sm">{ar.portal.noAbsences}</p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="border p-2 text-start">{ar.attendance.date}</th>
              <th className="border p-2 text-start">{ar.timetable.subject}</th>
              <th className="border p-2 text-start">{ar.users.status}</th>
              <th className="border p-2 text-start">{ar.attendance.notes}</th>
            </tr>
          </thead>
          <tbody>
            {attendance.absences.map((absence, index) => (
              <tr key={`${absence.date}-${index}`} className="break-inside-avoid">
                <td className="border p-2">{formatDisplayDate(absence.date)}</td>
                <td className="border p-2">{absence.subjectName}</td>
                <td className="border p-2">{ar.attendanceStatus[absence.status]}</td>
                <td className="border p-2">{absence.notes ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </PrintSheet>
  );
}
