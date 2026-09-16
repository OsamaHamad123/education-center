"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArrowLeftRight, Loader2, RotateCcw, Shuffle } from "lucide-react";
import { toast } from "sonner";
import type { BranchOption } from "@/modules/branches";
import type { ClassOption } from "@/modules/classes";
import { ar } from "@/shared/i18n/ar";
import { readText } from "@/shared/lib/form-data";
import { todayInCairo } from "@/shared/lib/time";
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
import {
  archiveStudent,
  changeStudentClass,
  restoreStudent,
  transferStudentBranch,
} from "../application/use-cases/manage-student";
import { useAction } from "@/shared/ui/use-action";

type Common = {
  studentId: string;
  classes: ClassOption[];
};

/** Moving to another class in the same branch (rule 10.3). */
export function ChangeClassDialog({
  studentId,
  classes,
  currentClassId,
}: Common & { currentClassId: string }) {
  const options = classes.filter((klass) => klass.id !== currentClassId);

  return (
    <TransitionDialog
      icon={<Shuffle className="size-4" aria-hidden />}
      label={ar.students.changeClass}
      title={ar.students.changeClass}
      description={ar.students.changeClassDescription}
      successMessage={ar.students.classChanged}
      classes={options}
      onSubmit={(values) =>
        changeStudentClass({ id: studentId, classId: values.classId, onDate: values.onDate })
      }
    />
  );
}

/** Moving to another branch — super admin only, and the code goes with them. */
export function TransferBranchDialog({
  studentId,
  branches,
  classesByBranch,
  currentBranchId,
}: {
  studentId: string;
  branches: BranchOption[];
  classesByBranch: Record<string, ClassOption[]>;
  currentBranchId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useAction();
  const [error, setError] = useState<string | null>(null);
  const [branchId, setBranchId] = useState("");
  const [classId, setClassId] = useState("");

  const targetBranches = branches.filter((branch) => branch.id !== currentBranchId);
  const targetClasses = branchId ? (classesByBranch[branchId] ?? []) : [];

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const onDate = readText(new FormData(event.currentTarget), "onDate");
    setError(null);

    startTransition(async () => {
      const result = await transferStudentBranch({ id: studentId, branchId, classId, onDate });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      toast.success(ar.students.branchTransferred);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <ArrowLeftRight className="size-4" aria-hidden />
          {ar.students.transferBranch}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{ar.students.transferBranch}</DialogTitle>
          <DialogDescription>{ar.students.transferBranchDescription}</DialogDescription>
        </DialogHeader>

        <form id="transfer-form" className="space-y-4" onSubmit={onSubmit}>
          <div className="space-y-2">
            <Label htmlFor="transfer-branch">{ar.students.branch}</Label>
            <Select
              value={branchId}
              onValueChange={(value) => {
                setBranchId(value);
                // The old class belongs to the old branch, so it cannot carry over.
                setClassId("");
              }}
              disabled={isPending}
            >
              <SelectTrigger id="transfer-branch" className="w-full">
                <SelectValue placeholder={ar.students.branch} />
              </SelectTrigger>
              <SelectContent>
                {targetBranches.map((branch) => (
                  <SelectItem key={branch.id} value={branch.id}>
                    {branch.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="transfer-class">{ar.students.class}</Label>
            <Select value={classId} onValueChange={setClassId} disabled={isPending || !branchId}>
              <SelectTrigger id="transfer-class" className="w-full">
                <SelectValue placeholder={ar.students.class} />
              </SelectTrigger>
              <SelectContent>
                {targetClasses.map((klass) => (
                  <SelectItem key={klass.id} value={klass.id}>
                    {klass.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="transfer-date">{ar.students.onDate}</Label>
            <Input
              id="transfer-date"
              name="onDate"
              type="date"
              defaultValue={todayInCairo()}
              required
              disabled={isPending}
            />
          </div>

          {error ? (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          ) : null}
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
            {ar.common.cancel}
          </Button>
          <Button type="submit" form="transfer-form" disabled={isPending || !branchId || !classId}>
            {isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            {ar.common.confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ArchiveStudentDialog({ studentId }: { studentId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useAction();
  const [error, setError] = useState<string | null>(null);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setError(null);

    startTransition(async () => {
      const result = await archiveStudent({
        id: studentId,
        leftDate: readText(data, "leftDate"),
        leaveReason: readText(data, "leaveReason"),
      });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      toast.success(ar.students.archived);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Archive className="size-4" aria-hidden />
          {ar.students.archive}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{ar.students.archive}</DialogTitle>
          <DialogDescription>{ar.students.archiveDescription2}</DialogDescription>
        </DialogHeader>

        <form id="archive-form" className="space-y-4" onSubmit={onSubmit}>
          <div className="space-y-2">
            <Label htmlFor="leftDate">{ar.students.leftDate}</Label>
            <Input
              id="leftDate"
              name="leftDate"
              type="date"
              defaultValue={todayInCairo()}
              required
              disabled={isPending}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="leaveReason">{ar.students.leaveReason}</Label>
            <Input id="leaveReason" name="leaveReason" required disabled={isPending} />
          </div>
          {error ? (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          ) : null}
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
            {ar.common.cancel}
          </Button>
          <Button type="submit" form="archive-form" variant="destructive" disabled={isPending}>
            {isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            {ar.students.archive}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RestoreStudentDialog({ studentId, classes }: Common) {
  return (
    <TransitionDialog
      icon={<RotateCcw className="size-4" aria-hidden />}
      label={ar.students.restore}
      title={ar.students.restore}
      description={ar.students.restoreDescription}
      successMessage={ar.students.restored}
      classes={classes}
      onSubmit={(values) => restoreStudent({ id: studentId, classId: values.classId, onDate: values.onDate })}
    />
  );
}

/** Shared shape for "pick a class and a date, then confirm". */
function TransitionDialog({
  icon,
  label,
  title,
  description,
  successMessage,
  classes,
  onSubmit,
}: {
  icon: React.ReactNode;
  label: string;
  title: string;
  description: string;
  successMessage: string;
  classes: ClassOption[];
  onSubmit: (values: {
    classId: string;
    onDate: string;
  }) => Promise<{ ok: boolean; error?: { message: string } }>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useAction();
  const [error, setError] = useState<string | null>(null);
  const [classId, setClassId] = useState("");

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const onDate = readText(new FormData(event.currentTarget), "onDate");
    setError(null);

    startTransition(async () => {
      const result = await onSubmit({ classId, onDate });
      if (!result.ok) {
        setError(result.error?.message ?? ar.errors.INTERNAL);
        return;
      }
      toast.success(successMessage);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          {icon}
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <form id="transition-form" className="space-y-4" onSubmit={submit}>
          <div className="space-y-2">
            <Label htmlFor="transition-class">{ar.students.class}</Label>
            <Select value={classId} onValueChange={setClassId} disabled={isPending}>
              <SelectTrigger id="transition-class" className="w-full">
                <SelectValue placeholder={ar.students.class} />
              </SelectTrigger>
              <SelectContent>
                {classes.map((klass) => (
                  <SelectItem key={klass.id} value={klass.id}>
                    {klass.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="transition-date">{ar.students.onDate}</Label>
            <Input
              id="transition-date"
              name="onDate"
              type="date"
              defaultValue={todayInCairo()}
              required
              disabled={isPending}
            />
          </div>

          {error ? (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          ) : null}
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
            {ar.common.cancel}
          </Button>
          <Button type="submit" form="transition-form" disabled={isPending || !classId}>
            {isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            {ar.common.confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
