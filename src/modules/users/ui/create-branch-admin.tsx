"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { BranchOption } from "@/modules/branches";
import { ar } from "@/shared/i18n/ar";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";
import { createBranchAdmin } from "../application/use-cases/manage-branch-admin";

/**
 * Two steps in one dialog: the form, then the temporary password.
 *
 * The password is shown exactly once and is never stored in readable form, so the
 * second step deliberately cannot be reopened — it has to be copied now or reset.
 */
export function CreateBranchAdminDialog({
  trigger,
  branches,
}: {
  trigger: React.ReactNode;
  branches: BranchOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<AppError | null>(null);
  const [branchId, setBranchId] = useState("");
  const [created, setCreated] = useState<{ username: string; temporaryPassword: string } | null>(null);

  function reset() {
    setCreated(null);
    setError(null);
    setBranchId("");
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setError(null);

    startTransition(async () => {
      const result = await createBranchAdmin({
        name: readText(data, "name"),
        username: readText(data, "username"),
        branchId,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setCreated({
        username: result.data.username,
        temporaryPassword: result.data.temporaryPassword,
      });
      toast.success(ar.users.created);
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        {created ? (
          <>
            <DialogHeader>
              <DialogTitle>{ar.users.temporaryPasswordTitle}</DialogTitle>
              <DialogDescription>{ar.users.temporaryPasswordWarning}</DialogDescription>
            </DialogHeader>
            <CredentialReadout username={created.username} password={created.temporaryPassword} />
            <DialogFooter>
              <Button onClick={() => setOpen(false)}>{ar.users.done}</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{ar.users.add}</DialogTitle>
              <DialogDescription>{ar.users.usernameHint}</DialogDescription>
            </DialogHeader>

            <form id="admin-form" className="space-y-4" onSubmit={onSubmit}>
              <div className="space-y-2">
                <Label htmlFor="admin-name">{ar.users.name}</Label>
                <Input id="admin-name" name="name" required disabled={isPending} />
                <FieldError message={error?.fieldErrors?.name?.[0]} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="admin-username">{ar.users.username}</Label>
                <Input
                  id="admin-username"
                  name="username"
                  required
                  dir="ltr"
                  className="text-start"
                  disabled={isPending}
                />
                <FieldError message={error?.fieldErrors?.username?.[0]} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="admin-branch">{ar.users.branch}</Label>
                <Select value={branchId} onValueChange={setBranchId} disabled={isPending}>
                  <SelectTrigger id="admin-branch" className="w-full">
                    <SelectValue placeholder={ar.users.branch} />
                  </SelectTrigger>
                  <SelectContent>
                    {branches.map((branch) => (
                      <SelectItem key={branch.id} value={branch.id}>
                        {branch.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldError message={error?.fieldErrors?.branchId?.[0]} />
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
              <Button type="submit" form="admin-form" disabled={isPending || !branchId}>
                {isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                {ar.common.save}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function FieldError({ message }: { message?: string | undefined }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-destructive text-sm">
      {message}
    </p>
  );
}

function CredentialReadout({ username, password }: { username: string; password: string }) {
  const [copied, setCopied] = useState(false);

  function copy() {
    // Deliberately not async: an onClick handler that returns a promise leaves any
    // rejection unhandled. The clipboard is blocked in some browsers, and the value
    // is on screen and selectable anyway, so a failure only needs a toast.
    navigator.clipboard
      .writeText(username + " / " + password)
      .then(() => {
        setCopied(true);
        toast.success(ar.users.copied);
      })
      .catch(() => toast.error(ar.errors.INTERNAL));
  }

  return (
    <div className="bg-muted space-y-3 rounded-md p-4">
      <dl className="space-y-2 text-sm">
        <div className="flex items-center justify-between gap-3">
          <dt className="text-muted-foreground">{ar.users.username}</dt>
          <dd className="font-mono" dir="ltr">
            {username}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-muted-foreground">{ar.auth.password}</dt>
          <dd className="font-mono select-all" dir="ltr">
            {password}
          </dd>
        </div>
      </dl>
      <Button variant="outline" size="sm" className="w-full" onClick={copy}>
        {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
        {ar.users.copy}
      </Button>
    </div>
  );
}
