"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { ar } from "@/shared/i18n/ar";

/**
 * `useTransition`, plus the case every component was missing
 * (docs/UX-AUDIT-2026-09.md, finding 1).
 *
 * Twenty of the twenty-two mutating components handled a refused `Result` and not a
 * request that never arrived. React re-throws a rejected promise from inside a
 * transition to the nearest error boundary — which is the app-wide one — so a dropped
 * save replaced the whole screen and everything typed into it. On the attendance
 * register that is fifteen students marked on a phone, gone.
 *
 * This catches instead. The screen stays, the form keeps its values, and the failure is
 * reported where a failure of this kind belongs: a toast, not a field error. Nothing
 * about the body changes, which is why adopting it is one line per component:
 *
 *     const [isPending, startTransition] = useAction();
 *
 * The message deliberately does not say whether anything was saved. A request can reach
 * the server, commit, and lose its reply on the way back — so "لم يُحفظ" would be a
 * guess. "Try again" is true either way, and every write in this product is either
 * idempotent or refuses a duplicate.
 */
export function useAction(): [boolean, (body: () => Promise<void>) => void] {
  const [isPending, startTransition] = useTransition();

  function run(body: () => Promise<void>) {
    startTransition(async () => {
      try {
        await body();
      } catch {
        // No `describeError` here: this runs in the browser, and the server has already
        // logged whatever it knows. What reaches this point is the absence of an answer.
        toast.error(ar.errors.NETWORK);
      }
    });
  }

  return [isPending, run];
}
