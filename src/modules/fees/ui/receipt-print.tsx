"use client";

import { ar } from "@/shared/i18n/ar";
import { formatEGP } from "@/shared/lib/money";
import { formatDisplayDate } from "@/shared/lib/time";
import { PrintSheet } from "@/shared/ui/print-sheet";
import type { PaymentMethod } from "@/shared/db/schema";

/**
 * The paper a family is handed (P5c).
 *
 * A receipt is the only part of this system a parent keeps, so it carries the number
 * they will quote back: `year/no`, unbroken per branch. A REVERSAL prints too, and says
 * so — a cancelled receipt that could not be printed would leave the office explaining
 * a hole in the numbering from memory.
 */
export function ReceiptPrint({
  receipt,
  centerName,
  logoPath,
  branchName,
}: {
  receipt: {
    amountPiasters: number;
    method: PaymentMethod;
    receiptYear: number;
    receiptNo: number;
    receivedAt: Date;
    note: string | null;
    reversesId: string | null;
    period: string;
    studentCode: string;
    fullName: string;
    className: string;
    receivedByName: string | null;
  };
  centerName: string;
  logoPath: string | null;
  branchName: string | null;
}) {
  const isReversal = receipt.reversesId !== null;

  return (
    <PrintSheet
      orientation="portrait"
      centerName={centerName}
      logoPath={logoPath}
      branchName={branchName}
      title={isReversal ? `${ar.fees.receipt} — ${ar.fees.reversal}` : ar.fees.receipt}
      subtitle={`${ar.fees.receiptNo} ${receipt.receiptYear}/${receipt.receiptNo}`}
      signature
    >
      <table className="w-full border-collapse text-sm">
        <tbody>
          <Row label={ar.fees.student} value={receipt.fullName} />
          <Row label={ar.students.code} value={receipt.studentCode} ltr />
          <Row label={ar.fees.class} value={receipt.className} />
          <Row label={ar.fees.period} value={receipt.period} ltr />
          <Row label={ar.fees.amount} value={formatEGP(Math.abs(receipt.amountPiasters))} ltr strong />
          <Row label={ar.fees.method} value={ar.fees.methods[receipt.method]} />
          <Row
            label={ar.attendance.date}
            value={formatDisplayDate(receipt.receivedAt.toISOString().slice(0, 10))}
          />
          {receipt.receivedByName ? <Row label={ar.fees.receivedBy} value={receipt.receivedByName} /> : null}
          {receipt.note ? <Row label={ar.fees.note} value={receipt.note} /> : null}
        </tbody>
      </table>

      {isReversal ? <p className="mt-4 border p-2 text-sm font-bold">{ar.fees.reverseDescription}</p> : null}
    </PrintSheet>
  );
}

function Row({
  label,
  value,
  ltr,
  strong,
}: {
  label: string;
  value: string;
  ltr?: boolean;
  strong?: boolean;
}) {
  return (
    <tr>
      <th className="w-40 border p-2 text-start">{label}</th>
      <td className={`border p-2 ${strong ? "text-base font-bold" : ""}`} dir={ltr ? "ltr" : undefined}>
        {value}
      </td>
    </tr>
  );
}
