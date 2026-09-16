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
 * `startTransition` around the push does two things at once. It gives `isPending`, which
 * the controls use to disable themselves; and it keeps the CURRENT screen visible while
 * the next one is built, instead of replacing it with `loading.tsx`. That is the right
 * division: the route-group skeleton is for arriving at a page, this is for changing
 * what a page you are already looking at shows.
 */
export function useNavPending(): [boolean, (href: string) => void] {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function navigate(href: string) {
    startTransition(() => router.push(href));
  }

  return [isPending, navigate];
}
