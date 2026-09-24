import { ar } from "@/shared/i18n/ar";
import { formatDisplayDate } from "@/shared/lib/date-display";
import { formatOutOf, scorePercent } from "@/shared/lib/score";
import { Badge } from "@/shared/ui/badge";
import { EmptyState } from "@/shared/ui/empty-state";
import type { StudentMarks } from "../application/queries/get-assessments";

/**
 * One student's marks, on their profile in the admin product (`drizzle/0021`).
 *
 * A server component: a list of numbers with nothing to press. It shows UNPUBLISHED
 * papers too, marked as such — the office is who decides when a result goes out, and
 * hiding the drafts from them is hiding their own work.
 */
export function StudentMarksList({ marks }: { marks: StudentMarks }) {
  if (marks.rows.length === 0) {
    return <EmptyState title={ar.assessments.empty} description={ar.assessments.emptyHint} />;
  }

  return (
    <ul className="divide-y text-sm">
      {marks.rows.map((row) => (
        <li key={row.assessmentId} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
          <div className="min-w-0 flex-1">
            <p className="font-medium">{row.name}</p>
            <p className="text-muted-foreground text-xs">
              {row.subjectName} · {ar.assessments.kinds[row.kind]} · {formatDisplayDate(row.assessedOn)}
            </p>
          </div>

          {row.didNotSit || row.scoreHundredths === null ? (
            <Badge variant="outline">{ar.assessments.didNotSit}</Badge>
          ) : (
            <>
              <span className="font-bold" dir="ltr">
                {formatOutOf(row.scoreHundredths, row.maxScoreHundredths)}
              </span>
              <Badge variant="secondary" dir="ltr">
                {scorePercent(row.scoreHundredths, row.maxScoreHundredths)}%
              </Badge>
            </>
          )}

          {/* The office sees its own drafts; a parent never does. */}
          {row.publishedAt === null ? <Badge variant="outline">{ar.assessments.draftBadge}</Badge> : null}
        </li>
      ))}
    </ul>
  );
}
