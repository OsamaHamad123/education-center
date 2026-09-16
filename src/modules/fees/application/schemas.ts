import { z } from "zod";

/**
 * Lives here rather than beside the use cases because a `"use server"` file may only
 * export async functions.
 *
 * Money arrives from a form in POUNDS, because that is what a person types on a
 * receipt, and is converted to integer piasters in ONE place — the schema — so nothing
 * below this line ever handles a float (CLAUDE.md, "Money is stored as integer
 * piasters").
 */

const pounds = z.coerce
  .number({ error: "أدخل مبلغاً صحيحاً" })
  .min(0, "المبلغ لا يكون بالسالب")
  .max(1_000_000, "المبلغ كبير جداً")
  .transform((value, ctx) => {
    const piasters = Math.round(value * 100);
    // Guard against float noise: 12.005 must be rejected, not silently rounded.
    if (Math.abs(value * 100 - piasters) > 0.001) {
      ctx.addIssue({ code: "custom", message: "أقصى دقة قرش واحد" });
      return z.NEVER;
    }
    return piasters;
  });

const period = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "شهر غير صالح");

export const setFeePlanSchema = z.object({
  classId: z.uuid("معرّف غير صالح"),
  amountPounds: pounds,
  /** The month the price applies from; stored as its first day. */
  effectiveFrom: period,
});

export const generateInvoicesSchema = z.object({
  period,
  classId: z.uuid("معرّف غير صالح").optional(),
});

export const recordPaymentSchema = z.object({
  invoiceId: z.uuid("معرّف غير صالح"),
  amountPounds: pounds,
  method: z.enum(["cash", "instapay", "wallet", "bank"]),
  note: z.string().trim().max(200, "الملاحظة طويلة جداً").optional(),
});

export const reversePaymentSchema = z.object({
  paymentId: z.uuid("معرّف غير صالح"),
  reason: z.string().trim().min(3, "اكتب سبب الإلغاء").max(200, "السبب طويل جداً"),
});

export const setDiscountSchema = z.object({
  invoiceId: z.uuid("معرّف غير صالح"),
  discountPounds: pounds,
  // Required whenever there is a discount; the database checks it too, because a
  // discount nobody can explain is the one an auditor asks about.
  reason: z.string().trim().max(200, "السبب طويل جداً").optional(),
});
