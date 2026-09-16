"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Link2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { ar } from "@/shared/i18n/ar";
import { readText } from "@/shared/lib/form-data";
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
import { linkTeacherByPhone } from "../application/use-cases/manage-teacher";
import { useAction } from "@/shared/ui/use-action";

/**
 * How a branch admin adds a teacher: by their full phone number. They cannot browse
 * teachers they are not linked to, so there is nothing to search — which is the point.
 */
export function LinkTeacherDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useAction();
  const [error, setError] = useState<string | null>(null);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const phone = readText(new FormData(event.currentTarget), "phone");
    setError(null);

    startTransition(async () => {
      const result = await linkTeacherByPhone({ phone });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      toast.success(`${ar.teachers.linked} ${result.data.fullName}`);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Link2 className="size-4" aria-hidden />
          {ar.teachers.link}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{ar.teachers.linkTitle}</DialogTitle>
          <DialogDescription>{ar.teachers.linkDescription}</DialogDescription>
        </DialogHeader>

        <form id="link-teacher-form" className="space-y-4" onSubmit={onSubmit}>
          <div className="space-y-2">
            <Label htmlFor="link-phone">{ar.teachers.phone}</Label>
            <Input
              id="link-phone"
              name="phone"
              required
              dir="ltr"
              className="text-start"
              inputMode="tel"
              placeholder="01xxxxxxxxx"
              disabled={isPending}
            />
            {error ? (
              <p role="alert" className="text-destructive text-sm">
                {error}
              </p>
            ) : null}
          </div>
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
            {ar.common.cancel}
          </Button>
          <Button type="submit" form="link-teacher-form" disabled={isPending}>
            {isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            {ar.teachers.link}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
