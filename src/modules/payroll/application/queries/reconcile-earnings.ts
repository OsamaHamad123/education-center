import type { TenantContext } from "@/shared/auth/tenant-context";
import type { Tx } from "@/shared/db/client";
import { calculateEarnings, type Earnings } from "../../domain/calculate-earnings";
import {
  aggregateEarnings,
  listSessionsForDomainCheck,
  type PayrollFilters,
} from "../../infrastructure/payroll.repository";

/**
 * Runs BOTH ways of computing payroll over the same rows and reports whether they
 * agree (PROJECT_PLAN Phase 8 prompt: "keep the money rules in the pure domain
 * function and test both agree").
 *
 * The report sums in SQL, because a term is tens of thousands of rows. The domain
 * function is the definition of the rules. Two implementations of one rule are a
 * liability unless something holds them to each other — this is that something.
 *
 * It takes the tenant context and transaction rather than resolving a session,
 * because both halves must see EXACTLY the same rows: the same role, the same
 * branch, the same snapshot. Resolving auth twice would compare two answers to two
 * slightly different questions.
 */

export type EarningsReconciliation = {
  sqlSessions: number;
  sqlPiasters: number;
  domain: Earnings;
  agrees: boolean;
};

export async function reconcileEarnings(
  ctx: TenantContext,
  tx: Tx,
  filters: PayrollFilters,
): Promise<EarningsReconciliation> {
  const groups = await aggregateEarnings(ctx, tx, filters);
  // The unaggregated rows, deliberately INCLUDING cancelled ones: filtering them out
  // in SQL first would leave the domain function's own exclusion rule unexercised.
  const domain = calculateEarnings(await listSessionsForDomainCheck(ctx, tx, filters));

  const sqlSessions = groups.reduce((total, group) => total + group.sessions, 0);
  const sqlPiasters = groups.reduce((total, group) => total + group.amountPiasters, 0);

  return {
    sqlSessions,
    sqlPiasters,
    domain,
    agrees: sqlSessions === domain.sessions && sqlPiasters === domain.amountPiasters,
  };
}
