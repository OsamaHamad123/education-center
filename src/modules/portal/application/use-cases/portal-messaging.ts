"use server";

import { cookies } from "next/headers";
import { ar } from "@/shared/i18n/ar";
import { err, ok, type Result } from "@/shared/lib/result";
import { PORTAL_SESSION } from "../../domain/session";
import { parentFor, setMessagingStopped } from "../../infrastructure/portal.repository";

/**
 * The parent's own "stop messaging me" switch
 * (docs/MESSAGING-AND-FEES-PLAN.md, P4c step 2).
 *
 * This is the portal's actual role in P4: the opt-out belongs where the parent already
 * is, not in a reply to a number nobody is watching.
 *
 * The identity comes from the SESSION and nothing else. Nothing about which family this
 * is travels in the request, so there is no id here to forge.
 */
export async function setPortalMessaging(stop: unknown): Promise<Result<{ stopped: boolean }>> {
  if (typeof stop !== "boolean") return err("VALIDATION_ERROR", ar.errors.VALIDATION_ERROR);

  const store = await cookies();
  const token = store.get(PORTAL_SESSION.cookie)?.value;
  const parent = token ? await parentFor(token) : null;
  if (!parent) return err("UNAUTHORIZED", ar.portal.signedOut);

  const done = await setMessagingStopped(parent, stop);
  // False means the database refused the pairing — a child who has left, or a branch
  // that is no longer in the rollout. The same reply a tampered hash would get.
  if (!done) return err("NOT_FOUND", ar.portal.noChildren);
  return ok({ stopped: stop });
}
