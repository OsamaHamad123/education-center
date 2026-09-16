"use client";

import { ar } from "@/shared/i18n/ar";
import { DateField } from "@/shared/ui/date-field";
import { Label } from "@/shared/ui/label";
import { useNavPending } from "@/shared/ui/use-nav-pending";

/**
 * Which day the office is ringing about (P4b).
 *
 * It defaults to today, because this is the last thing done before going home. It is
 * changeable because half the time it is the first thing done the next morning — a
 * worklist that can only show today is a worklist you lose by going home.
 */
export function ContactDate({ date }: { date: string }) {
  const [isNavigating, navigate] = useNavPending();

  return (
    <fieldset disabled={isNavigating} aria-busy={isNavigating} className="mb-3 max-w-xs space-y-1.5">
      <Label htmlFor="contact-date">{ar.attendance.date}</Label>
      <DateField id="contact-date" value={date} onChange={(iso) => navigate(`?date=${iso}`)} />
    </fieldset>
  );
}
