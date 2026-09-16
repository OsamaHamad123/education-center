"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { ar } from "@/shared/i18n/ar";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";

const ANY = "__any__";

/**
 * Date range, and optionally a class, kept in the URL so a report someone is looking
 * at can be sent to someone else who is allowed to see it.
 */
export function ReportFilters({
  range,
  classes,
  classId,
  allClassesLabel,
}: {
  range: { from: string; to: string };
  classes?: { id: string; name: string }[];
  classId?: string | null;
  /** Omitted when a class must be chosen, as in the matrix. */
  allClassesLabel?: string;
}) {
  const router = useRouter();
  const params = useSearchParams();

  function setParam(key: string, value: string | undefined) {
    const next = new URLSearchParams(params.toString());
    if (!value || value === ANY) next.delete(key);
    else next.set(key, value);
    router.push(`?${next.toString()}`);
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <div className="space-y-1.5">
        <Label htmlFor="report-from">{ar.payroll.from}</Label>
        <Input
          id="report-from"
          type="date"
          dir="ltr"
          value={range.from}
          onChange={(event) => event.target.value && setParam("from", event.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="report-to">{ar.payroll.to}</Label>
        <Input
          id="report-to"
          type="date"
          dir="ltr"
          value={range.to}
          onChange={(event) => event.target.value && setParam("to", event.target.value)}
        />
      </div>

      {classes ? (
        <div className="space-y-1.5">
          <Label htmlFor="report-class">{ar.reports.classLabel}</Label>
          <Select value={classId ?? ANY} onValueChange={(value) => setParam("classId", value)}>
            <SelectTrigger id="report-class" className="w-full">
              <SelectValue placeholder={ar.reports.chooseClass} />
            </SelectTrigger>
            <SelectContent>
              {allClassesLabel ? <SelectItem value={ANY}>{allClassesLabel}</SelectItem> : null}
              {classes.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  {option.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}
    </div>
  );
}
