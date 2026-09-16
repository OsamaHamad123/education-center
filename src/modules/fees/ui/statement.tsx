"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Printer } from "lucide-react";
import { toast } from "sonner";
import { ar } from "@/shared/i18n/ar";
import { formatEGP } from "@/shared/lib/money";
import { formatDisplayDate } from "@/shared/lib/time";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/shared/ui/dialog";
import { EmptyState } from "@/shared/ui/empty-state";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { useAction } from "@/shared/ui/use-action";
import type { Statement } from "../application/queries/get-fees";
import { reversePayment } from "../application/use-cases/manage-fees";

/**
 * One student's money, month by month (P5c).
 *
 * Every receipt is listed under the month it paid for, including the reversals — which
 * is the whole point of a ledger. A cancelled receipt stays on the page with its own
 * number, marked, because the family was handed a piece of paper with that number on it
 * and the centre has to be able to explain it a year later.
 */
export function StatementView({ statement, canCollect }: { statement: Statement; canCollect: boolean }) {
  if (statement.rows.length === 0) {
    return <EmptyState title={ar.fees.noInvoices} description={ar.fees.noInvoicesHint} />;
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Figure label={ar.fees.billed} piasters={statement.totals.billed} />
        <Figure label={ar.fees.collected} piasters={statement.totals.collected} />
        <Figure label={ar.fees.outstanding} piasters={statement.totals.outstanding} emphasis />
      </div>

      <ul className="space-y-3">
        {statement.rows.map((row) => (
          <li key={row.invoiceId}>
            <Card>
              <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
                <CardTitle className="text-base">
                  <span dir="ltr" className="font-mono">
                    {row.period}
                  </span>{" "}
                  · {row.className}
                </CardTitle>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium" dir="ltr">
                    {formatEGP(row.balancePiasters)}
                  </span>
                  <Badge variant={row.state === "unpaid" ? "destructive" : "secondary"}>
                    {ar.fees.states[row.state]}
                  </Badge>
                </div>
              </CardHeader>

              <CardContent className="space-y-2 text-sm">
                <p className="text-muted-foreground" dir="ltr">
                  {formatEGP(row.paidPiasters)} / {formatEGP(row.amountPiasters - row.discountPiasters)}
                </p>
                {row.discountPiasters > 0 ? (
                  <p className="text-muted-foreground text-xs">
                    {ar.fees.discount} {formatEGP(row.discountPiasters)}
                    {row.discountReason ? ` — ${row.discountReason}` : ""}
                  </p>
                ) : null}

                {row.payments.length > 0 ? (
                  <ul className="divide-y text-xs">
                    {row.payments.map((payment) => (
                      <li key={payment.id} className="flex flex-wrap items-center gap-2 py-2">
                        <span className="font-mono" dir="ltr">
                          #{payment.receiptYear}/{payment.receiptNo}
                        </span>
                        <span dir="ltr" className={payment.amountPiasters < 0 ? "text-destructive" : ""}>
                          {formatEGP(payment.amountPiasters)}
                        </span>
                        <span className="text-muted-foreground">{ar.fees.methods[payment.method]}</span>
                        <span className="text-muted-foreground">
                          {formatDisplayDate(payment.receivedAt.toISOString().slice(0, 10))}
                        </span>
                        {payment.reversesId ? <Badge variant="outline">{ar.fees.reversal}</Badge> : null}
                        {payment.reversed ? <Badge variant="outline">{ar.fees.reversed}</Badge> : null}
                        {payment.note ? <span className="text-muted-foreground">{payment.note}</span> : null}

                        <span className="ms-auto flex gap-1">
                          <Button asChild variant="ghost" size="sm">
                            <Link href={`/print/receipt/${payment.id}`} target="_blank">
                              <Printer className="size-4" aria-hidden />
                              {ar.fees.receipt}
                            </Link>
                          </Button>
                          {canCollect && !payment.reversed && !payment.reversesId ? (
                            <ReverseButton paymentId={payment.id} />
                          ) : null}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Figure({ label, piasters, emphasis }: { label: string; piasters: number; emphasis?: boolean }) {
  return (
    <Card>
      <CardContent className="pt-4">
        <p className="text-muted-foreground text-xs">{label}</p>
        <p className={`font-bold ${emphasis ? "text-destructive text-lg" : "text-base"}`} dir="ltr">
          {formatEGP(piasters)}
        </p>
      </CardContent>
    </Card>
  );
}

function ReverseButton({ paymentId }: { paymentId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [isPending, startTransition] = useAction();

  function confirm() {
    startTransition(async () => {
      const result = await reversePayment({ paymentId, reason });
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      toast.success(ar.fees.savedReversal);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-destructive">
          {ar.fees.reverse}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{ar.fees.reverseTitle}</DialogTitle>
          <DialogDescription>{ar.fees.reverseDescription}</DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="reverse-reason">{ar.fees.reverseReason}</Label>
          <Input
            id="reverse-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            disabled={isPending}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
            {ar.common.cancel}
          </Button>
          <Button
            variant="destructive"
            onClick={confirm}
            // The reason is not optional: a receipt that was cancelled for no recorded
            // reason is the one somebody has to explain a year later.
            disabled={isPending || reason.trim().length < 3}
          >
            {isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            {ar.fees.reverse}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
