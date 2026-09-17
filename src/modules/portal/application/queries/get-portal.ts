import { ar } from "@/shared/i18n/ar";
import { err, ok, type Result } from "@/shared/lib/result";
import { todayInCairo } from "@/shared/lib/time";
import { readDateRange } from "@/shared/lib/url-filters";
import { defaultRange, rangeIsSane } from "../../domain/session";
import {
  attendanceFor,
  balanceFor,
  childrenOf,
  messagingStopped,
  type PortalAttendance,
  type PortalBalance,
  type PortalChild,
} from "../../infrastructure/portal.repository";
import { currentParent } from "../use-cases/portal-session";

/**
 * What the portal shows (docs/PARENT-PORTAL-PLAN.md, P2 and P3).
 *
 * Both queries start from the SESSION, never from the URL. The screens carry a student
 * id because a parent may have more than one child, and that id is passed down to SQL
 * together with the parent's phone hash so the database decides whether the two belong
 * to each other. Nothing here trusts the id on its own.
 */

export type PortalView = {
  children: PortalChild[];
  selected: PortalChild;
  range: { from: string; to: string };
  attendance: PortalAttendance;
  /** Null when the centre has not billed this family at all — not zero (P5d). */
  balance: PortalBalance | null;
  /** This family has asked the centre not to message them (`drizzle/0018`). */
  messagingStopped: boolean;
};

export async function getPortalChildren(): Promise<Result<PortalChild[]>> {
  const parent = await currentParent();
  if (!parent) return err("UNAUTHORIZED", ar.portal.signedOut);
  return ok(await childrenOf(parent));
}

export async function getPortalView(input: {
  studentId?: string | undefined;
  from?: string | undefined;
  to?: string | undefined;
}): Promise<Result<PortalView>> {
  const parent = await currentParent();
  if (!parent) return err("UNAUTHORIZED", ar.portal.signedOut);

  const children = await childrenOf(parent);
  if (children.length === 0) return err("NOT_FOUND", ar.portal.noChildren);

  // An unknown id falls back to the first child rather than refusing: the id comes from
  // a URL, and a stale link should open the portal, not an error page. The id is still
  // checked against the parent in SQL below — this only decides which child to ASK for.
  const selected = children.find((child) => child.studentId === input.studentId) ?? children[0];
  if (!selected) return err("NOT_FOUND", ar.portal.noChildren);

  const today = todayInCairo();
  const fallback = defaultRange(today);
  const asked = readDateRange(input);
  const from = asked.from ?? fallback.from;
  const to = asked.to ?? fallback.to;
  // A public endpoint with an uncapped range is an invitation; two years answers every
  // real question a parent has.
  const range = rangeIsSane(from, to) ? { from, to } : fallback;

  const [attendance, balance, stopped] = await Promise.all([
    attendanceFor(selected.studentId, parent, range.from, range.to),
    balanceFor(selected.studentId, parent),
    messagingStopped(parent),
  ]);
  // Null means the database refused the pairing. It is the same reply a tampered id
  // gets, and the same one a child who has just left gets.
  if (!attendance) return err("NOT_FOUND", ar.portal.noChildren);

  // An empty ledger is not a zero balance: a centre that has not started billing must
  // not show a family a confident مستحق: 0.00 they might rely on.
  const hasLedger = balance !== null && balance.months.length > 0;
  return ok({
    children,
    selected,
    range,
    attendance,
    balance: hasLedger ? balance : null,
    messagingStopped: stopped,
  });
}
