import { describe, expect, it } from "vitest";
import { parseCsv, readHeaders, toCsv, toCsvField, toRows } from "./csv";

describe("parseCsv", () => {
  it("reads a simple file", () => {
    expect(parseCsv("a,b\n1,2\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("keeps commas inside quoted fields — Arabic names contain them", () => {
    expect(parseCsv('name,note\n"محمد, أحمد",ok\n')).toEqual([
      ["name", "note"],
      ["محمد, أحمد", "ok"],
    ]);
  });

  it("unescapes doubled quotes", () => {
    expect(parseCsv('a\n"say ""hi"""\n')).toEqual([["a"], ['say "hi"']]);
  });

  it("handles CRLF as well as LF", () => {
    expect(parseCsv("a,b\r\n1,2\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("strips the BOM Excel writes, which would otherwise corrupt the first header", () => {
    const rows = parseCsv("﻿full_name,parent_phone\nمحمد,01012345678\n");
    expect(rows[0]?.[0]).toBe("full_name");
  });

  it("drops blank lines rather than importing empty students", () => {
    expect(parseCsv("a\n1\n\n\n2\n")).toEqual([["a"], ["1"], ["2"]]);
  });

  it("tolerates a missing trailing newline", () => {
    expect(parseCsv("a,b\n1,2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});

describe("readHeaders", () => {
  it("accepts a file with every required column, in any case or order", () => {
    const rows = parseCsv("Join_Date,CLASS_NAME,parent_phone,Full_Name\n");
    const result = readHeaders(rows);
    expect(result.ok).toBe(true);
  });

  it("names exactly which required columns are missing", () => {
    const result = readHeaders(parseCsv("full_name,parent_phone\n"));
    expect(result).toEqual({ ok: false, missing: ["class_name", "join_date"] });
  });
});

describe("toRows", () => {
  it("numbers rows the way a spreadsheet does, so an error points at the right line", () => {
    const rows = parseCsv("full_name,parent_phone\nمحمد,01012345678\nمريم,01112345678\n");
    const headers = rows[0]?.map((h) => h.toLowerCase()) ?? [];
    const parsed = toRows(rows, headers);

    // Row 1 is the header, so the first student is line 2.
    expect(parsed[0]?.lineNumber).toBe(2);
    expect(parsed[1]?.lineNumber).toBe(3);
    expect(parsed[0]?.values.full_name).toBe("محمد");
  });

  it("fills missing trailing cells with empty strings rather than undefined", () => {
    const rows = parseCsv("a,b,c\n1\n");
    const parsed = toRows(rows, ["a", "b", "c"]);
    expect(parsed[0]?.values).toEqual({ a: "1", b: "", c: "" });
  });
});

describe("toCsv", () => {
  it("quotes only what needs quoting", () => {
    expect(toCsvField("plain")).toBe("plain");
    expect(toCsvField("has,comma")).toBe('"has,comma"');
    expect(toCsvField('has"quote')).toBe('"has""quote"');
    expect(toCsvField(null)).toBe("");
  });

  it("writes a BOM so Excel reads Arabic as UTF-8", () => {
    const csv = toCsv(["name"], [["محمد"]]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain("محمد");
  });

  it("round-trips through the parser", () => {
    const csv = toCsv(["name", "note"], [["محمد, أحمد", 'he said "hi"']]);
    const rows = parseCsv(csv);
    expect(rows[1]).toEqual(["محمد, أحمد", 'he said "hi"']);
  });
});
