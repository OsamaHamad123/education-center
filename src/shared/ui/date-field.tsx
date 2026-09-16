"use client";

import { useState } from "react";
import { arEG } from "date-fns/locale";
import type { Matcher } from "react-day-picker";
import { CalendarDays } from "lucide-react";
import { toDisplayDate, toIsoDate } from "@/shared/lib/date-text";
import { isIsoDate, parseIsoDate, todayInCairo } from "@/shared/lib/time";
import { ar } from "@/shared/i18n/ar";
import { Button } from "./button";
import { Calendar } from "./calendar";
import { Input } from "./input";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";

/**
 * A calendar day, written and read as `dd/MM/yyyy` (docs/PRODUCT-REVIEW-2026-09.md,
 * finding 1).
 *
 * `<input type="date">` renders in the BROWSER's locale, not the page's. On the machines
 * this was reviewed on it showed `09/16/2026` — American order — while every date the
 * product formats itself shows `16/09/2026`. Two orders on one screen, and `09/01` is
 * ambiguous for the first twelve days of every month.
 *
 * The format is not a preference here: a payroll range read the wrong way round pays the
 * wrong month. So the display is ours, and the value handed up is always ISO.
 *
 * Typing is the fast path — the office types, it does not point — so the text input comes
 * first and the calendar is a button beside it. `inputMode="numeric"` for the phone.
 *
 * The input is uncontrolled and keyed on `value`: a date is committed once it is complete
 * and parses, and a value that changes underneath (a navigation, a reset) remounts the
 * field rather than being synchronised in an effect.
 */
export function DateField({
  id,
  name,
  value,
  defaultValue,
  onChange,
  max,
  min,
  required,
  disabled,
  ariaLabel,
  className,
}: {
  id?: string;
  /** Submits the ISO value under this name, for a form read through `FormData`. */
  name?: string;
  /** ISO `yyyy-MM-dd`. Controlled: give `onChange` with it. */
  value?: string;
  /** ISO `yyyy-MM-dd`. Uncontrolled: the field keeps its own value. */
  defaultValue?: string;
  onChange?: (isoDate: string) => void;
  max?: string;
  min?: string;
  required?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  // Uncontrolled use keeps the ISO here; controlled use reads it from the prop. Either
  // way what leaves this component is ISO, and only the DISPLAY is dd/MM/yyyy — a form
  // that read the visible text would submit the wrong thing entirely.
  const [ownValue, setOwnValue] = useState(defaultValue ?? "");
  const iso = value ?? ownValue;

  function commit(next: string) {
    if (value === undefined) setOwnValue(next);
    onChange?.(next);
  }

  return (
    <div className={`flex items-center gap-1 ${className ?? ""}`}>
      {name ? <input type="hidden" name={name} value={iso} /> : null}
      <Input
        key={iso}
        id={id}
        defaultValue={toDisplayDate(iso)}
        required={required}
        dir="ltr"
        className="text-start"
        inputMode="numeric"
        placeholder="dd/mm/yyyy"
        autoComplete="off"
        aria-label={ariaLabel}
        disabled={disabled}
        onChange={(event) => {
          const typed = toIsoDate(event.target.value);
          if (typed && withinBounds(typed, min, max)) commit(typed);
        }}
      />

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="shrink-0"
            disabled={disabled}
            aria-label={ariaLabel ? `${ar.common.chooseDate}: ${ariaLabel}` : ar.common.chooseDate}
          >
            <CalendarDays className="size-4" aria-hidden />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            locale={arEG}
            dir="rtl"
            defaultMonth={isIsoDate(iso) ? parseIsoDate(iso) : undefined}
            selected={isIsoDate(iso) ? parseIsoDate(iso) : undefined}
            disabled={boundsFor(min, max)}
            onSelect={(date) => {
              if (!date) return;
              commit(toIsoFromDate(date));
              setOpen(false);
            }}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

function toIsoFromDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function withinBounds(iso: string, min?: string, max?: string): boolean {
  if (min && iso < min) return false;
  if (max && iso > max) return false;
  return true;
}

function boundsFor(min?: string, max?: string): Matcher[] | undefined {
  const rules: Matcher[] = [];
  if (min && isIsoDate(min)) rules.push({ before: parseIsoDate(min) });
  if (max && isIsoDate(max)) rules.push({ after: parseIsoDate(max) });
  return rules.length > 0 ? rules : undefined;
}

/** Today, for the callers that default a field to it. */
export const todayIso = todayInCairo;
