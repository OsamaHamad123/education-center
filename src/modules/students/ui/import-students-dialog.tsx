"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { ar } from "@/shared/i18n/ar";
import { Badge } from "@/shared/ui/badge";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/table";
import {
  importStudents,
  previewStudentImport,
  type ImportPreview,
} from "../application/use-cases/import-students";

/**
 * Two steps, deliberately: choose a file and SEE what will happen, then commit.
 * A register import that silently skips ten rows is worse than one that refuses.
 */
export function ImportStudentsDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function reset() {
    setPreview(null);
    setError(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function onFileChosen(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const data = new FormData();
    data.set("file", file);
    setError(null);

    startTransition(async () => {
      const result = await previewStudentImport(data);
      if (!result.ok) {
        setError(result.error.message);
        setPreview(null);
        return;
      }
      setPreview(result.data);
    });
  }

  function confirm() {
    const file = fileRef.current?.files?.[0];
    if (!file) return;

    const data = new FormData();
    data.set("file", file);

    startTransition(async () => {
      const result = await importStudents(data);
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      toast.success(`${ar.students.importDone} (${result.data.imported})`);
      setOpen(false);
      reset();
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
      <DialogTrigger asChild>
        <Button variant="outline">
          <Upload className="size-4" aria-hidden />
          {ar.students.importCsv}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{ar.students.importTitle}</DialogTitle>
          <DialogDescription>{ar.students.importDescription}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            onChange={onFileChosen}
            disabled={isPending}
            aria-label={ar.students.importCsv}
            className="file:bg-muted file:text-foreground block w-full text-sm file:me-3 file:rounded-md file:border-0 file:px-3 file:py-2"
          />

          {error ? (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          ) : null}

          {preview ? (
            <>
              <div className="flex gap-2">
                <Badge variant="secondary">
                  {ar.students.importValid}: {preview.validCount}
                </Badge>
                <Badge variant="outline">
                  {ar.students.importInvalid}: {preview.invalidCount}
                </Badge>
              </div>

              <div className="max-h-64 overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{ar.students.importRow}</TableHead>
                      <TableHead>{ar.students.fullName}</TableHead>
                      <TableHead>{ar.students.class}</TableHead>
                      <TableHead>{ar.students.importError}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.rows.map((row) => (
                      <TableRow key={row.lineNumber}>
                        <TableCell dir="ltr">{row.lineNumber}</TableCell>
                        <TableCell>{row.fullName}</TableCell>
                        <TableCell>{row.className}</TableCell>
                        <TableCell className={row.error ? "text-destructive text-sm" : "text-sm"}>
                          {row.error ?? "✓"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
            {ar.common.cancel}
          </Button>
          <Button onClick={confirm} disabled={isPending || !preview || preview.validCount === 0}>
            {isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            {ar.students.importConfirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
