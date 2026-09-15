/**
 * CSV import and export for students (PROJECT_PLAN Phase 4).
 *
 * Pure parsing and shaping: no database, no framework. The import is deliberately
 * two-step — parse to rows with per-row errors, show a preview, then write only the
 * valid rows — because a silent half-import of a class register is worse than none.
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

/** Quotes a field only when it needs it, so the common case stays readable. */
export function toCsvField(value: string | number | null | undefined): string {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(headers: readonly string[], rows: readonly (string | number | null)[][]): string {
  const lines = [headers.map(toCsvField).join(",")];
  for (const row of rows) lines.push(row.map(toCsvField).join(","));
  // The BOM is what makes Excel open Arabic as UTF-8 instead of mojibake.
  return `﻿${lines.join("\r\n")}\r\n`;
}
