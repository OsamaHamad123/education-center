"use client";

import { useSearchParams } from "next/navigation";
import { ar } from "@/shared/i18n/ar";
import { useNavPending } from "@/shared/ui/use-nav-pending";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";
import type { SessionLog } from "../application/queries/list-sessions";

const ANY = "__any__";

/** Filters for the sessions log, kept in the URL so a filtered view is shareable. */
export function SessionsFilters({ log }: { log: SessionLog }) {
  const [isNavigating, navigate] = useNavPending();
  const params = useSearchParams();

  function setParam(key: string, value: string | undefined) {
    const next = new URLSearchParams(params.toString());
    if (!value || value === ANY) next.delete(key);
    else next.set(key, value);
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
      className="grid gap-3 transition-opacity disabled:opacity-60 sm:grid-cols-2 lg:grid-cols-5"
    >
      <div className="space-y-1.5">
        <Label htmlFor="sessions-from">{ar.attendance.from}</Label>
        <Input
          id="sessions-from"
          type="date"
          dir="ltr"
          value={log.filters.from}
          onChange={(event) => event.target.value && setParam("from", event.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="sessions-to">{ar.attendance.to}</Label>
        <Input
          id="sessions-to"
          type="date"
          dir="ltr"
          value={log.filters.to}
          onChange={(event) => event.target.value && setParam("to", event.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="sessions-class">{ar.attendance.classLabel}</Label>
        <Select value={log.filters.classId ?? ANY} onValueChange={(value) => setParam("classId", value)}>
          <SelectTrigger id="sessions-class" className="w-full">
            <SelectValue placeholder={ar.attendance.allClasses} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>{ar.attendance.allClasses}</SelectItem>
            {log.classes.map((option) => (
              <SelectItem key={option.id} value={option.id}>
                {option.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="sessions-teacher">{ar.attendance.teacher}</Label>
        <Select value={log.filters.teacherId ?? ANY} onValueChange={(value) => setParam("teacherId", value)}>
          <SelectTrigger id="sessions-teacher" className="w-full">
            <SelectValue placeholder={ar.attendance.allTeachers} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>{ar.attendance.allTeachers}</SelectItem>
            {log.teachers.map((option) => (
              <SelectItem key={option.id} value={option.id}>
                {option.fullName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="sessions-status">{ar.attendance.status}</Label>
        <Select value={log.filters.status ?? ANY} onValueChange={(value) => setParam("status", value)}>
          <SelectTrigger id="sessions-status" className="w-full">
            <SelectValue placeholder={ar.attendance.allStatuses} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>{ar.attendance.allStatuses}</SelectItem>
            <SelectItem value="completed">{ar.common.active}</SelectItem>
            <SelectItem value="cancelled">{ar.attendance.cancelledBadge}</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </fieldset>
  );
}
