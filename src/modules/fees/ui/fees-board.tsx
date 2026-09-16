"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Download, Loader2, Receipt, Wallet } from "lucide-react";
import { toast } from "sonner";
import { ar } from "@/shared/i18n/ar";
import { ensureBom } from "@/shared/lib/csv";
import { readText } from "@/shared/lib/form-data";
import { formatEGP } from "@/shared/lib/money";
import type { AppError } from "@/shared/lib/result";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardContent } from "@/shared/ui/card";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/shared/ui/dialog";
import { EmptyState } from "@/shared/ui/empty-state";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";
import { useAction } from "@/shared/ui/use-action";
import { useNavPending } from "@/shared/ui/use-nav-pending";
import type { FeeRow, FeesBoard } from "../application/queries/get-fees";
import { exportPaymentsCsv } from "../application/use-cases/export-fees";
import { generateInvoices, recordPayment, setDiscount } from "../application/use-cases/manage-fees";

/**
 * Who has paid and who has not, for one month (P5c).
 *
 * This is the screen the office actually wanted — more than the portal, more than the
 * statement. So it is a worklist rather than a report: the unpaid rows carry the action,
 * the totals are at the foot, and the count of students nobody has billed is at the top
 * where it cannot be missed.
 */
export function FeesBoardView({ board }: { board: FeesBoard }) {
  const [isNavigating, navigate] = useNavPending();

  function setParam(key: string, value: string) {
    const next = new URLSearchParams();
    next.set("period", key === "period" ? value : board.period);
    const classId = key === "classId" ? value : (board.classId ?? "");
    if (classId && classId !== "all") next.set("classId", classId);
    navigate(`?${next.toString()}`);
  }

  return (
    <div className="space-y-4">
      <fieldset
        disabled={isNavigating}
        aria-busy={isNavigating}
        className="grid gap-3 transition-opacity disabled:opacity-60 sm:grid-cols-3"
      >
        <div className="space-y-1.5">
          <Label htmlFor="fees-period">{ar.fees.period}</Label>
          <Input
            id="fees-period"
            type="month"
            value={board.period}
            dir="ltr"
            className="text-start"
            onChange={(event) => event.target.value && setParam("period", event.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="fees-class">{ar.fees.class}</Label>
          <Select value={board.classId ?? "all"} onValueChange={(value) => setParam("classId", value)}>
            <SelectTrigger id="fees-class" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{ar.fees.allClasses}</SelectItem>
              {board.classes.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  {option.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-end gap-2">
          <GenerateButton period={board.period} classId={board.classId} />
          <ExportButton period={board.period} />
        </div>
      </fieldset>

      {board.unbilled > 0 ? (
        <p role="status" className="bg-muted rounded-md p-3 text-sm">
          {ar.fees.unbilledCount(board.unbilled)}
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-4">
        <Total label={ar.fees.billed} piasters={board.totals.billed} />
        <Total label={ar.fees.discounted} piasters={board.totals.discounted} />
        <Total label={ar.fees.collected} piasters={board.totals.collected} />
        <Total label={ar.fees.outstanding} piasters={board.totals.outstanding} emphasis />
      </div>

      {board.rows.length === 0 ? (
        <EmptyState title={ar.fees.noInvoices} description={ar.fees.noInvoicesHint} />
      ) : (
        <ul className="space-y-2">
          {board.rows.map((row) => (
            <li key={row.studentId}>
              <FeeRowCard row={row} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Total({ label, piasters, emphasis }: { label: string; piasters: number; emphasis?: boolean }) {
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

const STATE_VARIANT: Record<FeeRow["state"], "secondary" | "destructive" | "outline"> = {
  paid: "secondary",
  partial: "outline",
  unpaid: "destructive",
  overpaid: "outline",
  waived: "outline",
  unbilled: "destructive",
};

function FeeRowCard({ row }: { row: FeeRow }) {
  return (
    <Card>
      <CardContent className="flex flex-wrap items-center gap-3 pt-4">
        <div className="min-w-0 flex-1">
          <Link href={`/fees/${row.studentId}`} className="font-medium hover:underline">
            {row.fullName}
          </Link>
          <p className="text-muted-foreground text-sm">
            {row.className} ·{" "}
            <span className="font-mono text-xs" dir="ltr">
              {row.studentCode}
            </span>
          </p>
          {row.discountPiasters > 0 ? (
            <p className="text-muted-foreground text-xs">
              {ar.fees.discount} {formatEGP(row.discountPiasters)}
              {row.discountReason ? ` — ${row.discountReason}` : ""}
            </p>
          ) : null}
        </div>

        <div className="text-end">
          <p className="text-sm font-medium" dir="ltr">
            {formatEGP(row.balancePiasters)}
          </p>
          <p className="text-muted-foreground text-xs" dir="ltr">
            {formatEGP(row.paidPiasters)} / {formatEGP(row.duePiasters)}
          </p>
        </div>

        <Badge variant={STATE_VARIANT[row.state]}>{ar.fees.states[row.state]}</Badge>

        {row.invoiceId ? (
          <div className="flex gap-1">
            {row.balancePiasters > 0 ? (
              <PaymentDialog invoiceId={row.invoiceId} balance={row.balancePiasters} name={row.fullName} />
            ) : null}
            <DiscountDialog
              invoiceId={row.invoiceId}
              amount={row.amountPiasters}
              current={row.discountPiasters}
              reason={row.discountReason}
            />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function GenerateButton({ period, classId }: { period: string; classId: string | null }) {
  const router = useRouter();

  return (
    <ConfirmDialog
      trigger={
        <Button variant="outline" className="w-full">
          <Receipt className="size-4" aria-hidden />
          {ar.fees.generate}
        </Button>
      }
      title={ar.fees.generateConfirm}
      description={ar.fees.generateDescription}
      confirmLabel={ar.fees.generate}
      onConfirm={async () => {
        const result = await generateInvoices({ period, ...(classId ? { classId } : {}) });
        if (result.ok) {
          // The real message depends on what happened, and "nothing was created" is a
          // perfectly good outcome for a button somebody pressed twice.
          toast.success(
            result.data.created > 0 ? ar.fees.generated(result.data.created) : ar.fees.generatedNone,
          );
          if (result.data.unpriced > 0) toast.warning(ar.fees.unpriced(result.data.unpriced));
          router.refresh();
        }
        return result;
      }}
    />
  );
}

/**
 * Every receipt of the month, for whoever keeps the books (docs/ROADMAP.md, item 3).
 *
 * A blob rather than a route, like the payroll export: a list of who paid what is not
 * something to leave behind a URL that can be forwarded or logged.
 */
function ExportButton({ period }: { period: string }) {
  const [isPending, startTransition] = useAction();

  return (
    <Button
      variant="outline"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          const result = await exportPaymentsCsv({ period });
          if (!result.ok) {
            toast.error(result.error.message);
            return;
          }
          // `ensureBom`: a server action does not return the leading U+FEFF `toCsv`
          // wrote, and without it Excel opens the file as mojibake
          // (docs/AUDIT-2026-09.md, finding 13).
          const blob = new Blob([ensureBom(result.data)], { type: "text/csv;charset=utf-8" });
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = url;
          link.download = `payments-${period}.csv`;
          link.click();
          URL.revokeObjectURL(url);
        })
      }
    >
      {isPending ? (
        <Loader2 className="size-4 animate-spin" aria-hidden />
      ) : (
        <Download className="size-4" aria-hidden />
      )}
      {ar.common.export}
    </Button>
  );
}

function PaymentDialog({ invoiceId, balance, name }: { invoiceId: string; balance: number; name: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useAction();
  const [error, setError] = useState<AppError | null>(null);
  const [method, setMethod] = useState("cash");

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setError(null);

    startTransition(async () => {
      const result = await recordPayment({
        invoiceId,
        amountPounds: readText(data, "amountPounds"),
        method,
        note: readText(data, "note"),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(ar.fees.savedPayment);
      setOpen(false);
      router.refresh();
      // Straight to the receipt: a family that has just handed over cash expects paper.
      window.open(`/print/receipt/${result.data.id}`, "_blank", "noopener");
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" aria-label={`${ar.fees.collect} ${name}`}>
          <Wallet className="size-4" aria-hidden />
          {ar.fees.collect}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{ar.fees.collectTitle}</DialogTitle>
        </DialogHeader>

        <form id="payment-form" className="space-y-4" onSubmit={onSubmit}>
          <div className="space-y-2">
            <Label htmlFor="amountPounds">{ar.fees.amount}</Label>
            <Input
              id="amountPounds"
              name="amountPounds"
              type="number"
              step="0.01"
              min="0"
              // Pre-filled with the balance: at a desk the whole amount is what is
              // handed over nine times in ten, and typing it again is nine chances to
              // get it wrong.
              defaultValue={(balance / 100).toFixed(2)}
              required
              dir="ltr"
              className="text-start"
              inputMode="decimal"
              disabled={isPending}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="payment-method">{ar.fees.method}</Label>
            <Select value={method} onValueChange={setMethod} disabled={isPending}>
              <SelectTrigger id="payment-method" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(["cash", "instapay", "wallet", "bank"] as const).map((value) => (
                  <SelectItem key={value} value={value}>
                    {ar.fees.methods[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="note">{ar.fees.note}</Label>
            <Input id="note" name="note" disabled={isPending} />
          </div>

          {error ? (
            <p role="alert" className="text-destructive text-sm">
              {error.fieldErrors?.amountPounds?.[0] ?? error.message}
            </p>
          ) : null}
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
            {ar.common.cancel}
          </Button>
          <Button type="submit" form="payment-form" disabled={isPending}>
            {isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            {ar.common.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DiscountDialog({
  invoiceId,
  amount,
  current,
  reason,
}: {
  invoiceId: string;
  amount: number;
  current: number;
  reason: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useAction();
  const [error, setError] = useState<AppError | null>(null);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setError(null);

    startTransition(async () => {
      const result = await setDiscount({
        invoiceId,
        discountPounds: readText(data, "discountPounds"),
        reason: readText(data, "reason"),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(ar.fees.savedDiscount);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          {ar.fees.setDiscount}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{ar.fees.setDiscountTitle}</DialogTitle>
        </DialogHeader>

        <form id="discount-form" className="space-y-4" onSubmit={onSubmit}>
          <div className="space-y-2">
            <Label htmlFor="discountPounds">{ar.fees.discount}</Label>
            <Input
              id="discountPounds"
              name="discountPounds"
              type="number"
              step="0.01"
              min="0"
              max={(amount / 100).toFixed(2)}
              defaultValue={(current / 100).toFixed(2)}
              required
              dir="ltr"
              className="text-start"
              inputMode="decimal"
              disabled={isPending}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="reason">{ar.fees.discountReason}</Label>
            <Input id="reason" name="reason" defaultValue={reason ?? ""} disabled={isPending} />
            {/* A discount nobody can explain is the one an auditor asks about, so the
                database insists on this too. */}
          </div>

          {error ? (
            <p role="alert" className="text-destructive text-sm">
              {error.fieldErrors?.discountPounds?.[0] ?? error.fieldErrors?.reason?.[0] ?? error.message}
            </p>
          ) : null}
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
            {ar.common.cancel}
          </Button>
          <Button type="submit" form="discount-form" disabled={isPending}>
            {isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            {ar.common.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
