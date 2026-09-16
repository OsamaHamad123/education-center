"use client";

import { useRouter } from "next/navigation";
import { MessageCircle } from "lucide-react";
import { ar } from "@/shared/i18n/ar";
import { Button } from "@/shared/ui/button";
import { recordParentContact } from "../application/use-cases/record-contact";

/**
 * Opens WhatsApp with the message already written, and records that it happened (P4a).
 *
 * The anchor is a REAL anchor and navigates normally. It would be tidier to await the
 * server action and then `window.open`, and it would also be broken: a popup opened after
 * an await is no longer a user gesture, and every browser blocks it. So the action is
 * fired alongside the navigation and not waited on — the failure mode is a missing log
 * line, which is much cheaper than a button that does nothing on a phone.
 *
 * `router.refresh()` afterwards so "آخر تواصل" appears without a manual reload.
 */
export function ContactButton({
  href,
  studentIds,
  label,
}: {
  href: string;
  studentIds: string[];
  label?: string;
}) {
  const router = useRouter();

  return (
    <Button asChild variant="outline" size="sm">
      {/* noreferrer as well as noopener: wa.me has no business knowing which admin
          screen the click came from. */}
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => {
          void recordParentContact({ studentIds }).then(() => router.refresh());
        }}
      >
        <MessageCircle className="size-4" aria-hidden />
        {label ?? ar.reports.whatsapp}
      </a>
    </Button>
  );
}
