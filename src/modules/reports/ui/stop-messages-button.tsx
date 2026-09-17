"use client";

import { useRouter } from "next/navigation";
import { BellOff, BellRing } from "lucide-react";
import { ar } from "@/shared/i18n/ar";
import { Button } from "@/shared/ui/button";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { setFamilyMessaging } from "../application/use-cases/set-messaging";

/**
 * "They asked us to stop" (`drizzle/0018`).
 *
 * The parent can set this themselves in the portal; this is for the far commoner case
 * of their ringing the office and saying so. Both write the same row.
 *
 * It asks before it acts, because the consequence reaches further than the row the
 * office is looking at: the opt-out is the FAMILY's, so it covers every sibling in
 * every branch. Somebody pressing this on one child's row should be told that.
 */
export function StopMessagesButton({ studentId, stopped }: { studentId: string; stopped: boolean }) {
  const router = useRouter();

  return (
    <ConfirmDialog
      trigger={
        <Button
          variant="ghost"
          size="icon"
          aria-label={stopped ? ar.contact.resumeMessages : ar.contact.stopMessages}
        >
          {stopped ? <BellRing className="size-4" aria-hidden /> : <BellOff className="size-4" aria-hidden />}
        </Button>
      }
      title={stopped ? ar.contact.resumeTitle : ar.contact.stopTitle}
      description={stopped ? ar.contact.resumeDescription : ar.contact.stopDescription}
      confirmLabel={stopped ? ar.contact.resumeMessages : ar.contact.stopMessages}
      successMessage={ar.contact.stopSaved}
      onConfirm={async () => {
        const result = await setFamilyMessaging({ studentId, stop: !stopped });
        if (result.ok) router.refresh();
        return result;
      }}
    />
  );
}
