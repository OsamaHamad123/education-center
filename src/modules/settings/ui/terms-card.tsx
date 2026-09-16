"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ar } from "@/shared/i18n/ar";
import { readText } from "@/shared/lib/form-data";
import type { AppError } from "@/shared/lib/result";
import { formatDisplayDate } from "@/shared/lib/time";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { DateField } from "@/shared/ui/date-field";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/shared/ui/dialog";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { useAction } from "@/shared/ui/use-action";
import type { TermsView } from "../application/queries/get-terms";
import { createTerm, deleteTerm, editTerm } from "../application/use-cases/manage-terms";

/**
 * The centre's academic calendar, on the settings screen (§16 question 7).
 *
 * A list rather than a form: a term is a name and two dates, and the interesting thing
 * about the screen is which one is TODAY's — that is the one the reports will offer and
 * the one the public lookup's "الفصل" figure now means.
 */
export function TermsCard({ view, canEdit }: { view: TermsView; canEdit: boolean }) {
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
        <div>
          <CardTitle>{ar.terms.title}</CardTitle>
          <CardDescription>{ar.terms.description}</CardDescription>
        </div>
        {canEdit ? (
          <TermDialog
            trigger={
              <Button variant="outline" size="sm">
                <Plus className="size-4" aria-hidden />
                {ar.terms.add}
              </Button>
            }
          />
        ) : null}
      </CardHeader>

      <CardContent>
        {view.terms.length === 0 ? (
          <p className="text-muted-foreground text-sm">{ar.terms.emptyHint}</p>
        ) : (
          <ul className="divide-y text-sm">
            {view.terms.map((term) => (
              <li key={term.id} className="flex flex-wrap items-center gap-2 py-2">
                <span className="min-w-0 flex-1 font-medium">{term.name}</span>
                <span className="text-muted-foreground text-xs">
                  {formatDisplayDate(term.startDate)} — {formatDisplayDate(term.endDate)}
                </span>
                {term.id === view.currentId ? <Badge variant="secondary">{ar.terms.current}</Badge> : null}

                {canEdit ? (
                  <span className="flex gap-1">
                    <TermDialog
                      term={term}
                      trigger={
                        <Button variant="ghost" size="icon" aria-label={`${ar.common.edit} ${term.name}`}>
                          <Pencil className="size-4" aria-hidden />
                        </Button>
                      }
                    />
                    <DeleteTerm id={term.id} name={term.name} />
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function TermDialog({
  trigger,
  term,
}: {
  trigger: React.ReactNode;
  term?: { id: string; name: string; startDate: string; endDate: string };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useAction();
  const [error, setError] = useState<AppError | null>(null);
  const [startDate, setStartDate] = useState(term?.startDate ?? "");
  const [endDate, setEndDate] = useState(term?.endDate ?? "");

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setError(null);

    startTransition(async () => {
      const payload = { name: readText(data, "name"), startDate, endDate };
      const result = term ? await editTerm({ ...payload, id: term.id }) : await createTerm(payload);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(term ? ar.terms.updated : ar.terms.created);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{term ? ar.terms.edit : ar.terms.add}</DialogTitle>
        </DialogHeader>

        <form id="term-form" className="space-y-4" onSubmit={onSubmit}>
          <div className="space-y-2">
            <Label htmlFor="name">{ar.terms.name}</Label>
            <Input id="name" name="name" defaultValue={term?.name} required disabled={isPending} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="term-start">{ar.terms.start}</Label>
              <DateField id="term-start" value={startDate} onChange={setStartDate} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="term-end">{ar.terms.end}</Label>
              <DateField id="term-end" value={endDate} onChange={setEndDate} />
            </div>
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
          <Button type="submit" form="term-form" disabled={isPending || !startDate || !endDate}>
            {isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            {ar.common.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteTerm({ id, name }: { id: string; name: string }) {
  const router = useRouter();

  return (
    <ConfirmDialog
      trigger={
        <Button variant="ghost" size="icon" aria-label={`${ar.common.delete} ${name}`}>
          <Trash2 className="size-4" aria-hidden />
        </Button>
      }
      title={ar.terms.deleteTitle}
      // Said plainly, because "delete" in this product usually means "archive": nothing
      // is stored against a term id, so this really is only a label coming off.
      description={ar.terms.deleteDescription}
      confirmLabel={ar.common.delete}
      destructive
      successMessage={ar.terms.deleted}
      onConfirm={async () => {
        const result = await deleteTerm({ id });
        if (result.ok) router.refresh();
        return result;
      }}
    />
  );
}
