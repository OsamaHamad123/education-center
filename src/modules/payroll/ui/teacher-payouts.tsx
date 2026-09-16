import { ar } from "@/shared/i18n/ar";
import { formatEGP } from "@/shared/lib/money";
import { formatDisplayDate } from "@/shared/lib/time";
import { Badge } from "@/shared/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";

/**
 * "شهر ٨: مدفوع", on the teacher's own screen (docs/PRODUCT-REVIEW-2026-09.md, finding 2).
 *
 * The half of the payroll record a teacher cares about. Before this they could see what
 * they had earned and had to ASK whether it had been paid — which is a conversation the
 * product was creating and could just as easily answer.
 *
 * A month whose settlement was reversed nets to zero and is not listed: showing a paid
 * line and an unpaid line for the same month would tell a teacher they had been paid.
 */
export function TeacherPayouts({
  payouts,
}: {
  payouts: { period: string; paidPiasters: number; paidAt: Date }[];
}) {
  const paid = payouts.filter((payout) => payout.paidPiasters > 0);
  if (paid.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{ar.payroll.myPayouts}</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="divide-y text-sm">
          {paid.map((payout) => (
            <li key={payout.period} className="flex flex-wrap items-center gap-2 py-2">
              <span className="font-mono" dir="ltr">
                {payout.period}
              </span>
              <span className="font-medium" dir="ltr">
                {formatEGP(payout.paidPiasters)}
              </span>
              <span className="text-muted-foreground text-xs">
                {formatDisplayDate(payout.paidAt.toISOString().slice(0, 10))}
              </span>
              <Badge variant="secondary" className="ms-auto">
                {ar.payroll.settledBadge}
              </Badge>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
