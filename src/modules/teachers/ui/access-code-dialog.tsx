"use client";

import { ar } from "@/shared/i18n/ar";
import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";

/**
 * Shows an access code exactly once. There is deliberately no way to reopen it: the
 * code is stored only as a hash, so if it is lost the answer is a reset, not a
 * lookup.
 */
export function AccessCodeDialog({
  value,
  onClose,
}: {
  value: { phone: string; accessCode: string } | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={value !== null} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{ar.teachers.accessCodeTitle}</DialogTitle>
          <DialogDescription>{ar.teachers.accessCodeWarning}</DialogDescription>
        </DialogHeader>

        <div className="bg-muted space-y-1 rounded-md p-4 text-center">
          <p className="font-mono text-2xl tracking-widest select-all" dir="ltr">
            {value?.accessCode}
          </p>
          <p className="text-muted-foreground font-mono text-xs" dir="ltr">
            {value?.phone}
          </p>
        </div>

        <DialogFooter>
          <Button onClick={onClose}>{ar.users.done}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
