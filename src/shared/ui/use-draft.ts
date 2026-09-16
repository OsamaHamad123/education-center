"use client";

import { useSyncExternalStore } from "react";

/**
 * A draft kept in the browser, for work that must survive a bad connection
 * (docs/ROADMAP.md, item 1).
 *
 * The register is the product's most-used screen and it is used on the worst network it
 * will ever meet — a branch's wifi, on a phone, in a corridor. A failed save already
 * keeps the screen intact; a RELOAD did not, and thirty taps went with it.
 *
 * Why `useSyncExternalStore` and not an effect: reading `localStorage` into state inside
 * `useEffect` is a cascading render the hooks lint rule refuses, and a lazy `useState`
 * initialiser would read it during hydration and disagree with the server's HTML. This
 * hook has a SERVER snapshot of `null`, so the server renders no draft and the client
 * re-renders once with one — which is exactly the contract this hook exists for.
 *
 * `subscribe` is deliberately a no-op: the answer to "was there a draft when this screen
 * opened?" must not change while the screen is open, or saving a keystroke would make
 * the restore banner reappear over the work it is offering to restore.
 */

const cache = new Map<string, string | null>();

function noopSubscribe(): () => void {
  return () => {};
}

function snapshot(key: string): string | null {
  if (!cache.has(key)) cache.set(key, readRaw(key));
  return cache.get(key) ?? null;
}

/** The draft that was on this device when the screen opened, or null. */
export function useStoredDraft<T>(key: string): T | null {
  const raw = useSyncExternalStore(
    noopSubscribe,
    () => snapshot(key),
    // The server has no localStorage and must render as if there were no draft.
    () => null,
  );
  if (raw === null) return null;

  try {
    return JSON.parse(raw) as T;
  } catch {
    // A draft we cannot read is worse than none: drop it rather than crash the screen.
    clearDraft(key);
    return null;
  }
}

/**
 * Writes the draft. Deliberately does NOT update the snapshot cache — see above.
 *
 * Every access is wrapped: `localStorage` throws in a private window, with site data
 * blocked, and when the quota is full. A register that cannot be drafted must still be
 * a register.
 */
export function writeDraft(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Nothing to do and nothing worth telling the user: the save still works.
  }
}

export function clearDraft(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
  cache.delete(key);
}

function readRaw(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
