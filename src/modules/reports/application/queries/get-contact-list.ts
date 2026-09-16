import { requirePermission } from "@/shared/actions/create-action";
import { withTenant } from "@/shared/db/with-tenant";
import { ar } from "@/shared/i18n/ar";
import { err, ok, type Result } from "@/shared/lib/result";
import { renderTemplate } from "@/shared/lib/message-template";
import { maskPhone, whatsAppLink } from "@/shared/lib/phone";
import { isoDayOfWeek, isIsoDate, todayInCairo } from "@/shared/lib/time";
import { familyTemplateValues, groupByFamily, type ContactChild } from "../../domain/contact-list";
import { absencesOn, lastContactedAt, openRegistersToday } from "../../infrastructure/reports.repository";
import { loadMessagingContext } from "./alert-settings";

/**
 * Today's absences, one row per FAMILY, ready to send (P4b).
 *
 * This is the whole of "one message a day, after the last period, naming the periods
 * missed" — the rule the portal plan describes as needing a messaging provider. It does
 * not. It needs the grouping in `domain/contact-list.ts` and this screen.
 *
 * The count of registers nobody has marked yet is returned alongside, deliberately: a day
 * that is not finished is a day whose absences are not final, and sending before the last
 * period is the six-messages mistake wearing a different hat.
 */

export type ContactRow = {
  parentPhone: string;
  maskedPhone: string;
  children: ContactChild[];
  repeated: boolean;
  /** The rendered message, already in the link. Nothing sends it but a person. */
  message: string;
  whatsappHref: string;
  /** When this family was last contacted through this screen, from the audit log. */
  lastContactedAt: string | null;
};

export type ContactList = {
  date: string;
  rows: ContactRow[];
  /** Periods today that nobody has marked yet. Zero means the day is a complete answer. */
  openRegisters: number;
};

export async function getContactList(input: { date?: string | undefined }): Promise<Result<ContactList>> {
  const auth = await requirePermission("report.read");
  if (!auth.ok) return auth;
  // Ringing parents is a branch's morning, not a group-wide view.
  if (!auth.data.branchId) return err("BRANCH_REQUIRED", ar.errors.BRANCH_REQUIRED);

  const date = isIsoDate(input.date ?? "") ? (input.date as string) : todayInCairo();

  return withTenant(auth.data, async (tx) => {
    const messaging = await loadMessagingContext(auth.data, tx);
    if (!messaging) return err("NOT_FOUND", ar.settings.missing);

    const marks = await absencesOn(auth.data, tx, date, monthStartOf(date));
    const families = groupByFamily(marks);

    const contacted = await lastContactedAt(
      auth.data,
      tx,
      families.flatMap((family) => family.children.map((child) => child.studentId)),
    );

    const open = await openRegistersToday(auth.data, tx, date, isoDayOfWeek(date));

    return ok({
      date,
      openRegisters: open.length,
      rows: families.map((family) => {
        const message = renderTemplate(
          family.repeated ? messaging.templateRepeatedAbsence : messaging.templateDailyAbsence,
          {
            ...familyTemplateValues(family, ar.units.period),
            اليوم: ar.weekdays[isoDayOfWeek(date) as keyof typeof ar.weekdays] ?? "",
            الفرع: messaging.branchName,
            المركز: messaging.centerName,
          },
        );

        // The most recent contact across the family's children: ringing one sibling's
        // parent IS ringing the other's.
        const last = family.children
          .map((child) => contacted.get(child.studentId))
          .filter((at): at is Date => at !== undefined)
          .sort((a, b) => b.getTime() - a.getTime())[0];

        return {
          parentPhone: family.parentPhone,
          // The full number never reaches the page (CLAUDE.md); the link carries it.
          maskedPhone: maskPhone(family.parentPhone),
          children: family.children,
          repeated: family.repeated,
          message,
          whatsappHref: whatsAppLink(family.parentPhone, message),
          lastContactedAt: last ? last.toISOString() : null,
        } satisfies ContactRow;
      }),
    });
  });
}

/** The first of the month the given date falls in — the window `{مرات}` counts over. */
function monthStartOf(date: string): string {
  return `${date.slice(0, 7)}-01`;
}
