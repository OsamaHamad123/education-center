"use client";

import { useEffect } from "react";

/**
 * The browser's own "you have unsaved changes" prompt, while `when` is true
 * (docs/UX-AUDIT-2026-09.md, finding 5).
 *
 * It covers what an in-app check cannot: closing the tab, reloading, typing a different
 * address. The in-app half — the back button on the register — is handled at the link,
 * because a `confirm()` there can say something in Arabic and this one cannot: browsers
 * replaced the custom message with a fixed one years ago, which is why nothing is passed
 * in.
 *
 * This is one of the very few effects in the codebase, and it is the case they exist
 * for: subscribing to something outside React and unsubscribing again. It is not
 * synchronising state, so it does not trip the cascading-render rule.
 */
export function UnsavedGuard({ when }: { when: boolean }) {
  useEffect(() => {
    if (!when) return;

    function warn(event: BeforeUnloadEvent) {
      event.preventDefault();
    }

    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [when]);

  return null;
}
