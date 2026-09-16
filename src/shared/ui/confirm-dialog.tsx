"use client";

import { useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { ar } from "@/shared/i18n/ar";
import type { Result } from "@/shared/lib/result";
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
import { useAction } from "./use-action";

/**
 * Confirmation for a state change that is awkward to undo — deactivating a branch,
 * resetting a password. The action runs on the server and its Arabic error message is
 * surfaced as-is, so the user sees the real reason a rule refused them.
 */
export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel,
  destructive,
  onConfirm,
  successMessage,
}: {
  trigger: ReactNode;
  title: string;
  description: string;
  confirmLabel?: string;
  destructive?: boolean;
  onConfirm: () => Promise<Result<unknown>>;
  successMessage: string;
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useAction();

  function confirm() {
    startTransition(async () => {
      const result = await onConfirm();
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      toast.success(successMessage);
      setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
            {ar.common.cancel}
          </Button>
          <Button variant={destructive ? "destructive" : "default"} onClick={confirm} disabled={isPending}>
            {isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            {confirmLabel ?? ar.common.confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
