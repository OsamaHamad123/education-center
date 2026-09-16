"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * Navigating with something on screen to say it is happening
 * (docs/UX-AUDIT-2026-09.md, finding 3).
 *
 * Seven components navigate on every change of a date, a class, a status or a page, and
 * none of them showed anything while the server rebuilt the screen. The old data stayed
 * put, looking current. The attendance board's date stepper is the most used control in
 * the product, and tapping "يوم سابق" appeared to do nothing — so it got tapped again.
 *
 * `startTransition` around the navigation gives `isPending`, which the controls use to
 * disable themselves, and keeps the CURRENT screen visible while the next one is built.
 *
 * `replace`, not `push` (docs/UX-AUDIT-2026-09.md, finding 7). A filter is a refinement
 * of the screen you are on, not a place you went to. Pushing meant that stepping back
 * through a week on the attendance board left seven entries in the history, so the back
 * button stopped meaning "leave this screen" and started meaning "undo one date".
 *
 * `scroll: false` for the same reason: changing a filter from the bottom of a register
 * threw the page to the top. Pagination is untouched by all this — those are real
 * `<Link>`s, and going back through pages is what a link is supposed to do.
 */
export function useNavPending(): [boolean, (href: string) => void] {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function navigate(href: string) {
    startTransition(() => router.replace(href, { scroll: false }));
  }

  return [isPending, navigate];
}
