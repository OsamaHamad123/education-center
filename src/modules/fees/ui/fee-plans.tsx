"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { ar } from "@/shared/i18n/ar";
import { readText } from "@/shared/lib/form-data";
import { formatEGP } from "@/shared/lib/money";
import type { AppError } from "@/shared/lib/result";
import { Button } from "@/shared/ui/button";
import { Card, CardContent } from "@/shared/ui/card";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";
import { useAction } from "@/shared/ui/use-action";
import type { FeePlansView } from "../application/queries/get-fees";
import { setFeePlan } from "../application/use-cases/manage-fees";

/**
 * What each class costs, from when (P5b).
 *
 * The list is history, not a settings form, and it reads that way on purpose: a price
 * rise adds a row and the old one stays. Editing in place would silently restate every
 * month already billed at the old price, and the months are what the receipts say.
 */
export function FeePlansView({ view, canEdit }: { view: FeePlansView; canEdit: boolean }) {
  return (
    <div className="space-y-4">
      {canEdit ? <PlanDialog classes={view.classes} /> : null}

      {view.plans.length === 0 ? (
        <EmptyState title={ar.fees.noPlans} description={ar.fees.noPlansHint} />
      ) : (
        <ul className="space-y-2">
          {view.plans.map((plan) => (
            <li key={plan.id}>
              <Card>
                <CardContent className="flex flex-wrap items-center gap-3 pt-4">
                  <span className="min-w-0 flex-1 font-medium">{plan.className}</span>
                  <span className="text-muted-foreground text-sm" dir="ltr">
                    {ar.fees.effectiveFrom} {plan.effectiveFrom.slice(0, 7)}
                  </span>
                  <span className="font-medium" dir="ltr">
                    {formatEGP(plan.amountPiasters)}
                  </span>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PlanDialog({ classes }: { classes: { id: string; name: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useAction();
  const [error, setError] = useState<AppError | null>(null);
  const [classId, setClassId] = useState(classes[0]?.id ?? "");

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setError(null);

    startTransition(async () => {
      const result = await setFeePlan({
        classId,
        amountPounds: readText(data, "amountPounds"),
        effectiveFrom: readText(data, "effectiveFrom"),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(ar.fees.savedPlan);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" aria-hidden />
          {ar.fees.price}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{ar.fees.plans}</DialogTitle>
          <DialogDescription>{ar.fees.plansDescription}</DialogDescription>
        </DialogHeader>

        <form id="plan-form" className="space-y-4" onSubmit={onSubmit}>
          <div className="space-y-2">
            <Label htmlFor="plan-class">{ar.fees.class}</Label>
            <Select value={classId} onValueChange={setClassId} disabled={isPending}>
              <SelectTrigger id="plan-class" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {classes.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="amountPounds">{ar.fees.price}</Label>
            <Input
              id="amountPounds"
              name="amountPounds"
              type="number"
              step="0.01"
              min="0"
              required
              dir="ltr"
              className="text-start"
              inputMode="decimal"
              disabled={isPending}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="effectiveFrom">{ar.fees.effectiveFrom}</Label>
            <Input
              id="effectiveFrom"
              name="effectiveFrom"
              type="month"
              required
              dir="ltr"
              className="text-start"
              disabled={isPending}
            />
          </div>

          {error ? (
            <p role="alert" className="text-destructive text-sm">
              {error.message}
            </p>
          ) : null}
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
            {ar.common.cancel}
          </Button>
          <Button type="submit" form="plan-form" disabled={isPending || !classId}>
            {isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            {ar.common.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
