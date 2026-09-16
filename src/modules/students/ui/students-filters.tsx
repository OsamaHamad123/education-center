"use client";

import { useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { Download, Search, X } from "lucide-react";
import { toast } from "sonner";
import type { ClassOption } from "@/modules/classes";
import { ar } from "@/shared/i18n/ar";
import { useNavPending } from "@/shared/ui/use-nav-pending";
import { ensureBom } from "@/shared/lib/csv";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";
import { exportStudentsCsv } from "../application/use-cases/import-students";

const ANY = "__any__";

export function StudentsFilters({
  classes,
  status,
  canSeeTransferredOut,
}: {
  classes: ClassOption[];
  status: "active" | "archived";
  canSeeTransferredOut: boolean;
}) {
  const [isNavigating, navigate] = useNavPending();
  const params = useSearchParams();
  const [search, setSearch] = useState(params.get("search") ?? "");
  const [isExporting, startExport] = useTransition();

  function apply(next: URLSearchParams) {
    next.delete("page");
    navigate(`?${next.toString()}`);
  }

  function setParam(key: string, value: string | undefined) {
    const next = new URLSearchParams(params.toString());
    if (!value || value === ANY) next.delete(key);
    else next.set(key, value);
    apply(next);
  }

  function submitSearch(event: React.FormEvent) {
    event.preventDefault();
    setParam("search", search.trim() || undefined);
  }

  function download() {
    startExport(async () => {
      const result = await exportStudentsCsv(status);
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      // A blob rather than a route: the CSV is already in hand and contains personal
      // data, so it never needs a URL that could be shared or logged.
      // `ensureBom`, not `result.data`: a server action does not return the leading
      // U+FEFF `toCsv` wrote, so without this every export opened in Excel as
      // mojibake (docs/AUDIT-2026-09.md, finding 13).
      const blob = new Blob([ensureBom(result.data)], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `students-${status}-${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    });
  }

  const hasFilters = [...params.keys()].some((key) => key !== "page" && key !== "status");

  /*
   * Disabled as a group while the next screen is being fetched
   * (docs/UX-AUDIT-2026-09.md, finding 3). A fieldset rather than a styling trick:
   * `disabled` here reaches every control inside it, for the keyboard as well as the
   * mouse.
   */
  return (
    <fieldset
      disabled={isNavigating}
      aria-busy={isNavigating}
      className="mb-4 flex flex-wrap items-end gap-3 transition-opacity disabled:opacity-60"
    >
      <form onSubmit={submitSearch} className="relative min-w-0 flex-1 sm:max-w-sm">
        <Label htmlFor="student-search" className="sr-only">
          {ar.students.search}
        </Label>
        <Search
          className="text-muted-foreground pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2"
          aria-hidden
        />
        <Input
          id="student-search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={ar.students.search}
          className="ps-9"
        />
      </form>

      <div className="space-y-2">
        <Label htmlFor="student-class" className="sr-only">
          {ar.students.filterClass}
        </Label>
        <Select value={params.get("classId") ?? ANY} onValueChange={(value) => setParam("classId", value)}>
          <SelectTrigger id="student-class" className="w-48">
            <SelectValue placeholder={ar.students.filterClass} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>{ar.students.filterClass}</SelectItem>
            {classes.map((klass) => (
              <SelectItem key={klass.id} value={klass.id}>
                {klass.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {canSeeTransferredOut ? (
        <Button
          variant={params.get("transferredOut") === "1" ? "default" : "outline"}
          onClick={() => setParam("transferredOut", params.get("transferredOut") === "1" ? undefined : "1")}
        >
          {ar.students.transferredOut}
        </Button>
      ) : null}

      {hasFilters ? (
        <Button
          variant="ghost"
          onClick={() => {
            setSearch("");
            const next = new URLSearchParams();
            if (status === "archived") next.set("status", "archived");
            apply(next);
          }}
        >
          <X className="size-4" aria-hidden />
          {ar.audit.clearFilters}
        </Button>
      ) : null}

      <Button variant="outline" onClick={download} disabled={isExporting} className="ms-auto">
        <Download className="size-4" aria-hidden />
        {ar.students.exportCsv}
      </Button>
    </fieldset>
  );
}
