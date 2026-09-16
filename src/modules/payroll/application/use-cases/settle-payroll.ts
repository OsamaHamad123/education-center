"use server";

import { z } from "zod";
import { createAction } from "@/shared/actions/create-action";
import { ar } from "@/shared/i18n/ar";
import { err, ok } from "@/shared/lib/result";
import { todayInCairo } from "@/shared/lib/time";
import { checkSettlement } from "../../domain/settlement";
import { aggregateEarnings, findRun, insertRun, listRunsFor } from "../../infrastructure/payroll.repository";

/**
 * Recording that a teacher has been paid for a month (`drizzle/0016`).
 *
 * The amount is NOT taken from the client. It is recomputed from the sessions inside
 * the same transaction and snapshotted onto the row — so what is written is what the
 * system believed at the moment the money changed hands, and a later correction to a
 * register shows up as a discrepancy rather than silently rewriting history.
 *
 * Settling freezes that month's registers for that teacher. Reversing it opens them
 * again, which is why the reversal is a row somebody signs their name to rather than
 * a delete.
 */

const periodField = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "شهر غير صالح");

const settleSchema = z.object({
  teacherId: z.uuid("معرّف غير صالح"),
  period: periodField,
  note: z.string().trim().max(200, "الملاحظة طويلة جداً").optional(),
});

const reverseSchema = z.object({
  runId: z.uuid("معرّف غير صالح"),
  reason: z.string().trim().min(3, "اكتب سبب الإلغاء").max(200, "السبب طويل جداً"),
});

export const settlePayroll = createAction({
  permission: "payroll.settle",
  schema: settleSchema,
  audit: { action: "create", entity: "payroll_run", entityId: (out: { id: string }) => out.id },
  revalidate: { paths: ["/payroll", "/payroll/runs", "/teacher/earnings"] },
  handler: async ({ tx, ctx, input }) => {
    if (!ctx.branchId) return err("BRANCH_REQUIRED", ar.errors.BRANCH_REQUIRED);

    // Recomputed here, never sent by the client: the amount on a payroll row is the
    // system's own figure, and a number that arrived over the wire is not that.
    const groups = await aggregateEarnings(ctx, tx, {
      from: `${input.period}-01`,
      to: endOfPeriod(input.period),
      teacherId: input.teacherId,
      branchId: ctx.branchId,
    });
    const amountPiasters = groups.reduce((total, group) => total + group.amountPiasters, 0);
    const sessionsCount = groups.reduce((total, group) => total + group.sessions, 0);

    const runs = await listRunsFor(ctx, tx, ctx.branchId, input.teacherId, input.period);
    const problem = checkSettlement({
      runs,
      computedPiasters: amountPiasters,
      period: input.period,
      currentPeriod: todayInCairo().slice(0, 7),
    });
    if (problem === "FUTURE_PERIOD") return err("VALIDATION_ERROR", ar.payroll.futurePeriod);
    if (problem === "NOTHING_TO_PAY") return err("CONFLICT", ar.payroll.nothingToPay);
    if (problem === "ALREADY_SETTLED") return err("CONFLICT", ar.payroll.alreadySettled);

    const row = await insertRun(ctx, tx, {
      branchId: ctx.branchId,
      teacherId: input.teacherId,
      period: input.period,
      amountPiasters,
      sessionsCount,
      note: input.note ?? null,
    });
    return ok(row);
  },
});

/**
 * Undoes a settlement, as a row rather than an erasure — and reopens the month.
 *
 * The unique index on `reverses_id` is what stops the same payout being reversed
 * twice; checking first would be a race between two people at two desks.
 */
export const reversePayrollRun = createAction({
  permission: "payroll.settle",
  schema: reverseSchema,
  audit: { action: "delete", entity: "payroll_run.reversal", entityId: (out: { id: string }) => out.id },
  revalidate: { paths: ["/payroll", "/payroll/runs", "/teacher/earnings"] },
  handler: async ({ tx, ctx, input }) => {
    if (!ctx.branchId) return err("BRANCH_REQUIRED", ar.errors.BRANCH_REQUIRED);

    const original = await findRun(ctx, tx, input.runId);
    // A run in another branch is invisible under RLS, so this is a 404 and not a 403.
    if (!original) return err("NOT_FOUND", ar.errors.NOT_FOUND);
    if (original.amountPiasters < 0) return err("CONFLICT", ar.payroll.alreadyReversal);

    const row = await insertRun(ctx, tx, {
      branchId: original.branchId,
      teacherId: original.teacherId,
      period: original.period,
      amountPiasters: -original.amountPiasters,
      sessionsCount: original.sessionsCount,
      note: input.reason,
      reversesId: original.id,
    });
    return ok(row);
  },
});

/** The last day of a `YYYY-MM`, without pulling in a date library for one line. */
function endOfPeriod(period: string): string {
  const year = Number(period.slice(0, 4));
  const month = Number(period.slice(5, 7));
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${period}-${String(last).padStart(2, "0")}`;
}
