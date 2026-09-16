"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { ar } from "@/shared/i18n/ar";
import { readText } from "@/shared/lib/form-data";
import type { AppError } from "@/shared/lib/result";
import { Button } from "@/shared/ui/button";
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
import { createSubject, renameSubject } from "../application/use-cases/manage-subject";
import type { SubjectWithUsage } from "../application/queries/list-subjects";
import { useAction } from "@/shared/ui/use-action";

export function SubjectFormDialog({
  trigger,
  subject,
}: {
  trigger: React.ReactNode;
  subject?: SubjectWithUsage;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useAction();
  const [error, setError] = useState<AppError | null>(null);

  const isEdit = Boolean(subject);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = readText(new FormData(event.currentTarget), "name");
    setError(null);

    startTransition(async () => {
      const result = subject ? await renameSubject({ id: subject.id, name }) : await createSubject({ name });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(isEdit ? ar.subjects.updated : ar.subjects.created);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? ar.subjects.edit : ar.subjects.add}</DialogTitle>
        </DialogHeader>

        <form id="subject-form" className="space-y-4" onSubmit={onSubmit}>
          <div className="space-y-2">
            <Label htmlFor="subject-name">{ar.subjects.name}</Label>
            <Input
              id="subject-name"
              name="name"
              defaultValue={subject?.name}
              required
              disabled={isPending}
              aria-invalid={error ? true : undefined}
            />
            {error ? (
              <p role="alert" className="text-destructive text-sm">
                {error.fieldErrors?.name?.[0] ?? error.message}
              </p>
            ) : null}
          </div>
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
            {ar.common.cancel}
          </Button>
          <Button type="submit" form="subject-form" disabled={isPending}>
            {isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            {ar.common.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
