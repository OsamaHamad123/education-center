"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { ar } from "@/shared/i18n/ar";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";
import type { SessionLog } from "../application/queries/list-sessions";

const ANY = "__any__";

/** Filters for the sessions log, kept in the URL so a filtered view is shareable. */
export function SessionsFilters({ log }: { log: SessionLog }) {
  const router = useRouter();
  const params = useSearchParams();

  function setParam(key: string, value: string | undefined) {
    const next = new URLSearchParams(params.toString());
    if (!value || value === ANY) next.delete(key);
    else next.set(key, value);
    router.push(`?${next.toString()}`);
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
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
    </div>
  );
}
