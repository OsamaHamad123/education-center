"use client";

import { useSearchParams } from "next/navigation";
import { ar } from "@/shared/i18n/ar";
import { useNavPending } from "@/shared/ui/use-nav-pending";
import { Label } from "@/shared/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";
import { DateField } from "@/shared/ui/date-field";

const ANY = "__any__";
const CUSTOM = "__custom__";

/**
 * Date range, and optionally a class, kept in the URL so a report someone is looking
 * at can be sent to someone else who is allowed to see it.
 */
export function ReportFilters({
  range,
  classes,
  classId,
  allClassesLabel,
  terms,
}: {
  range: { from: string; to: string };
  classes?: { id: string; name: string }[];
  classId?: string | null;
  /** Omitted when a class must be chosen, as in the matrix. */
  allClassesLabel?: string;
  /** The centre's calendar (§16 q7). Omitted, or empty, and nothing is shown. */
  terms?: { id: string; name: string; startDate: string; endDate: string }[];
}) {
  const [isNavigating, navigate] = useNavPending();
  const params = useSearchParams();

  function setParam(key: string, value: string | undefined) {
    const next = new URLSearchParams(params.toString());
    if (!value || value === ANY) next.delete(key);
    else next.set(key, value);
    navigate(`?${next.toString()}`);
  }

  /**
   * A term is a PRESET, not a filter: picking one writes `from` and `to` and then has
   * nothing more to do with the report. That is the whole design of §16 q7 — nothing
   * that already computes anything had to learn a new concept, and a shared URL still
   * carries plain dates.
   */
  const selectedTerm =
    terms?.find((term) => term.startDate === range.from && term.endDate === range.to)?.id ?? CUSTOM;

  function chooseTerm(value: string) {
    const term = terms?.find((option) => option.id === value);
    if (!term) return;
    const next = new URLSearchParams(params.toString());
    next.set("from", term.startDate);
    next.set("to", term.endDate);
    navigate(`?${next.toString()}`);
  }

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
      className="grid gap-3 transition-opacity disabled:opacity-60 sm:grid-cols-2 lg:grid-cols-4"
    >
      {terms && terms.length > 0 ? (
        <div className="space-y-1.5">
          <Label htmlFor="report-term">{ar.terms.title}</Label>
          <Select value={selectedTerm} onValueChange={chooseTerm}>
            <SelectTrigger id="report-term" className="w-full">
              <SelectValue placeholder={ar.terms.choose} />
            </SelectTrigger>
            <SelectContent>
              {/* Shown but not selectable as an action: the dates below ARE the custom
                  range, so there is nothing for choosing it to do. */}
              <SelectItem value={CUSTOM} disabled>
                {ar.terms.custom}
              </SelectItem>
              {terms.map((term) => (
                <SelectItem key={term.id} value={term.id}>
                  {term.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      <div className="space-y-1.5">
        <Label htmlFor="report-from">{ar.payroll.from}</Label>
        <DateField id="report-from" value={range.from} onChange={(isoDate) => setParam("from", isoDate)} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="report-to">{ar.payroll.to}</Label>
        <DateField id="report-to" value={range.to} onChange={(isoDate) => setParam("to", isoDate)} />
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
    </fieldset>
  );
}
