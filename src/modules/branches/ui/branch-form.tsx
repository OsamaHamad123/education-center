"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { ar } from "@/shared/i18n/ar";
import { validate } from "@/shared/lib/validate";
import { readText } from "@/shared/lib/form-data";
import type { AppError } from "@/shared/lib/result";
import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/shared/ui/dialog";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { createBranch, editBranch } from "../application/use-cases/manage-branch";
import type { BranchWithCounts } from "../application/queries/list-branches-admin";
import { useAction } from "@/shared/ui/use-action";
import { createBranchSchema, updateBranchSchema } from "../application/schemas";

/**
 * Create and edit share one dialog: the fields are identical, and the only difference
 * is whether the code may still be changed.
 */
export function BranchFormDialog({
  trigger,
  branch,
}: {
  trigger: React.ReactNode;
  branch?: BranchWithCounts;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useAction();
  const [error, setError] = useState<AppError | null>(null);

  const [portalEnabled, setPortalEnabled] = useState(branch?.portalEnabled ?? false);

  const isEdit = Boolean(branch);
  // Rule 10.1: once a student code has been issued from this branch, the code is frozen.
  const codeLocked = isEdit && (branch?.studentCount ?? 0) > 0;

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const payload = {
      name: readText(data, "name"),
      code: codeLocked ? (branch?.code ?? "") : readText(data, "code"),
      address: readText(data, "address"),
      phone: readText(data, "phone"),
      portalEnabled,
    };

    setError(null);

    // Checked here before the round trip, with the SAME schema the server runs
    // (docs/UX-AUDIT-2026-09.md, finding 6). The server still validates; this only
    // spares the person at the desk a wait to be told about a typo.
    const parsed = validate(
      branch ? updateBranchSchema : createBranchSchema,
      branch ? { ...payload, id: branch.id } : payload,
    );
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }

    startTransition(async () => {
      const result = branch ? await editBranch({ ...payload, id: branch.id }) : await createBranch(payload);

      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(isEdit ? ar.branches.updated : ar.branches.created);
      setOpen(false);
      router.refresh();
    });
  }

  const fieldError = (field: string) => error?.fieldErrors?.[field]?.[0];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? ar.branches.edit : ar.branches.add}</DialogTitle>
          <DialogDescription>{ar.branches.codeHint}</DialogDescription>
        </DialogHeader>

        <form id="branch-form" className="space-y-4" onSubmit={onSubmit}>
          <Field
            name="name"
            label={ar.branches.name}
            defaultValue={branch?.name}
            required
            error={fieldError("name")}
            disabled={isPending}
          />
          <Field
            name="code"
            label={ar.branches.code}
            defaultValue={branch?.code}
            required
            dir="ltr"
            error={fieldError("code")}
            disabled={isPending || codeLocked}
            hint={codeLocked ? ar.branches.codeLocked : undefined}
          />
          <Field
            name="address"
            label={ar.branches.address}
            defaultValue={branch?.address ?? ""}
            error={fieldError("address")}
            disabled={isPending}
          />
          <Field
            name="phone"
            inputMode="numeric"
            label={ar.branches.phone}
            defaultValue={branch?.phone ?? ""}
            dir="ltr"
            error={fieldError("phone")}
            disabled={isPending}
          />

          <div className="flex items-start gap-3">
            <input
              id="portalEnabled"
              type="checkbox"
              checked={portalEnabled}
              onChange={(event) => setPortalEnabled(event.target.checked)}
              disabled={isPending}
              className="mt-1 size-4 shrink-0"
            />
            <div className="space-y-0.5">
              <Label htmlFor="portalEnabled">{ar.branches.portalEnabled}</Label>
              <p className="text-muted-foreground text-xs">{ar.branches.portalEnabledHint}</p>
            </div>
          </div>

          {error && !error.fieldErrors ? (
            <p role="alert" className="text-destructive text-sm">
              {error.message}
            </p>
          ) : null}
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
            {ar.common.cancel}
          </Button>
          <Button type="submit" form="branch-form" disabled={isPending}>
            {isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            {ar.common.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field(props: {
  name: string;
  label: string;
  inputMode?: "numeric" | "decimal" | "tel";
  defaultValue?: string | undefined;
  required?: boolean;
  dir?: "ltr";
  disabled?: boolean;
  error?: string | undefined;
  hint?: string | undefined;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={props.name}>{props.label}</Label>
      <Input
        id={props.name}
        name={props.name}
        defaultValue={props.defaultValue}
        required={props.required}
        disabled={props.disabled}
        dir={props.dir}
        inputMode={props.inputMode}
        className={props.dir === "ltr" ? "text-start" : undefined}
        aria-invalid={props.error ? true : undefined}
        aria-describedby={props.error ? `${props.name}-error` : undefined}
      />
      {props.error ? (
        <p id={`${props.name}-error`} className="text-destructive text-sm">
          {props.error}
        </p>
      ) : props.hint ? (
        <p className="text-muted-foreground text-xs">{props.hint}</p>
      ) : null}
    </div>
  );
}
