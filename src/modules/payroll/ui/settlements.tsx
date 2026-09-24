"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Wallet, Wallet2 } from "lucide-react";
import { toast } from "sonner";
import { ar } from "@/shared/i18n/ar";
import { formatEGP } from "@/shared/lib/money";
import { formatDisplayDate } from "@/shared/lib/time";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardContent } from "@/shared/ui/card";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
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
import { useNavPending } from "@/shared/ui/use-nav-pending";
import type { SettlementRow, SettlementsView } from "../application/queries/get-settlements";
import { reversePayrollRun, settleAllPayroll, settlePayroll } from "../application/use-cases/settle-payroll";

/**
 * Paying the teachers for a month (`drizzle/0016`).
 *
 * Two figures on every row, always: what the system computes now and what was actually
 * handed over. They are usually the same, and the whole value of the screen is the case
 * where they are not — a register corrected after the money went out, which shows as
 * تغيّر بعد الصرف rather than being quietly reconciled away.
 */
export function SettlementsScreen({ view, canSettle }: { view: SettlementsView; canSettle: boolean }) {
  const [isNavigating, navigate] = useNavPending();

  return (
    <div className="space-y-4">
      <fieldset
        disabled={isNavigating}
        aria-busy={isNavigating}
        className="max-w-xs space-y-1.5 transition-opacity disabled:opacity-60"
      >
        <Label htmlFor="run-period">{ar.payroll.period}</Label>
        <Input
          id="run-period"
          type="month"
          value={view.period}
          dir="ltr"
          className="text-start"
          onChange={(event) => event.target.value && navigate(`?period=${event.target.value}`)}
        />
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-2">
        <Figure label={ar.payroll.computedAmount} piasters={view.totalComputed} />
        <Figure label={ar.payroll.paidAmount} piasters={view.totalPaid} />
      </div>

      {/*
        Paying everybody at once. Shown only while somebody is actually owed something,
        so the button is absent on a month that is finished rather than present and
        refusing — the office should not have to press it to learn there is no work.
      */}
      {canSettle && view.rows.some((row) => row.state === "unsettled" && row.computedPiasters > 0) ? (
        <SettleAllDialog period={view.period} count={view.rows.filter(isPayable).length} />
      ) : null}

      {view.rows.length === 0 ? (
        <EmptyState title={ar.payroll.noRuns} description={ar.payroll.noRunsHint} />
      ) : (
        <ul className="space-y-2">
          {view.rows.map((row) => (
            <li key={`${row.branchId}:${row.teacherId}`}>
              <RunCard row={row} period={view.period} canSettle={canSettle} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Figure({ label, piasters }: { label: string; piasters: number }) {
  return (
    <Card>
      <CardContent className="pt-4">
        <p className="text-muted-foreground text-xs">{label}</p>
        <p className="text-base font-bold" dir="ltr">
          {formatEGP(piasters)}
        </p>
      </CardContent>
    </Card>
  );
}

const STATE_LABEL = {
  unsettled: ar.payroll.unsettledBadge,
  settled: ar.payroll.settledBadge,
  partial: ar.payroll.partialBadge,
  stale: ar.payroll.staleBadge,
} as const;

const STATE_VARIANT = {
  unsettled: "outline",
  settled: "secondary",
  partial: "outline",
  stale: "destructive",
} as const;

function RunCard({ row, period, canSettle }: { row: SettlementRow; period: string; canSettle: boolean }) {
  return (
    <Card>
      <CardContent className="space-y-3 pt-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="font-medium">{row.teacherName}</p>
            <p className="text-muted-foreground text-sm">
              {row.branchName ? `${row.branchName} · ` : ""}
              {row.sessions} {ar.payroll.sessions}
            </p>
          </div>

          <div className="text-end">
            <p className="text-sm font-medium" dir="ltr">
              {formatEGP(row.computedPiasters)}
            </p>
            {row.paidPiasters !== 0 ? (
              <p className="text-muted-foreground text-xs" dir="ltr">
                {ar.payroll.paidAmount} {formatEGP(row.paidPiasters)}
              </p>
            ) : null}
          </div>

          <Badge variant={STATE_VARIANT[row.state]}>{STATE_LABEL[row.state]}</Badge>

          {canSettle && row.state === "unsettled" ? (
            <SettleDialog teacherId={row.teacherId} period={period} name={row.teacherName} />
          ) : null}
        </div>

        {row.state === "stale" ? (
          <p role="status" className="bg-destructive/5 rounded-md p-2 text-xs">
            {ar.payroll.staleHint}
          </p>
        ) : null}

        {row.runs.length > 0 ? (
          <ul className="divide-y text-xs">
            {row.runs.map((run) => (
              <li key={run.id} className="flex flex-wrap items-center gap-2 py-2">
                <span dir="ltr" className={run.amountPiasters < 0 ? "text-destructive" : ""}>
                  {formatEGP(run.amountPiasters)}
                </span>
                <span className="text-muted-foreground">
                  {formatDisplayDate(run.paidAt.toISOString().slice(0, 10))}
                </span>
                {run.reversesId ? <Badge variant="outline">{ar.payroll.reversal}</Badge> : null}
                {run.note ? <span className="text-muted-foreground">{run.note}</span> : null}
                {canSettle && !run.reversesId && row.paidPiasters > 0 ? (
                  <span className="ms-auto">
                    <ReverseRunButton runId={run.id} />
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </CardContent>
    </Card>
  );
}

/** Unsettled AND owed something — the same two tests `planBulkSettlement` applies. */
function isPayable(row: SettlementRow): boolean {
  return row.state === "unsettled" && row.computedPiasters > 0;
}

/**
 * "صرف للكل" (asked for 2026-09-24).
 *
 * It names the number of teachers and the total BEFORE the press, because this is the
 * one button in the product that moves nine people's money at once — and because the
 * freeze it applies to nine months is the part nobody expects.
 *
 * The figures shown are the ones already on this screen. The server recomputes its own
 * inside the transaction and writes those; these are for the person deciding.
 */
function SettleAllDialog({ period, count }: { period: string; count: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [isPending, startTransition] = useAction();

  function confirm() {
    startTransition(async () => {
      const result = await settleAllPayroll({ period, note });
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      // Skipped teachers are counted, not hidden: "7 paid, 2 skipped" is the sentence
      // that stops somebody going looking for the two.
      const skipped = result.data.alreadySettled + result.data.nothingToPay;
      toast.success(ar.payroll.settleAllDone(result.data.paid, skipped));
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="w-full sm:w-auto">
          <Wallet2 className="size-4" aria-hidden />
          {ar.payroll.settleAll} ({count})
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{ar.payroll.settleAllTitle}</DialogTitle>
          <DialogDescription>{ar.payroll.settleAllDescription}</DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="settle-all-note">{ar.fees.note}</Label>
          <Input
            id="settle-all-note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            disabled={isPending}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
            {ar.common.cancel}
          </Button>
          <Button onClick={confirm} disabled={isPending}>
            {isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            {ar.payroll.settleAll}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SettleDialog({ teacherId, period, name }: { teacherId: string; period: string; name: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [isPending, startTransition] = useAction();

  function confirm() {
    startTransition(async () => {
      const result = await settlePayroll({ teacherId, period, note });
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      toast.success(ar.payroll.settled);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" aria-label={`${ar.payroll.settle} ${name}`}>
          <Wallet className="size-4" aria-hidden />
          {ar.payroll.settle}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{ar.payroll.settleTitle}</DialogTitle>
          {/* Said before the button, not after: the freeze is the surprising part. */}
          <DialogDescription>{ar.payroll.settleDescription}</DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="run-note">{ar.fees.note}</Label>
          <Input
            id="run-note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            disabled={isPending}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
            {ar.common.cancel}
          </Button>
          <Button onClick={confirm} disabled={isPending}>
            {isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            {ar.payroll.settle}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReverseRunButton({ runId }: { runId: string }) {
  const router = useRouter();
  const [reason, setReason] = useState("");

  return (
    <ConfirmDialog
      trigger={
        <Button variant="ghost" size="sm" className="text-destructive">
          {ar.payroll.reverseRun}
        </Button>
      }
      title={ar.payroll.reverseRunTitle}
      description={ar.payroll.reverseRunDescription}
      confirmLabel={ar.payroll.reverseRun}
      destructive
      onConfirm={async () => {
        const result = await reversePayrollRun({ runId, reason: reason.trim() || "—" });
        if (result.ok) {
          toast.success(ar.payroll.settled);
          router.refresh();
        }
        return result;
      }}
      body={
        <div className="space-y-2">
          <Label htmlFor={`reverse-run-${runId}`}>{ar.payroll.reverseReason}</Label>
          <Input
            id={`reverse-run-${runId}`}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </div>
      }
    />
  );
}
