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

describe("formula injection", () => {
  it("stops a cell Excel would execute", () => {
    // The payload that matters: a name field is free text typed at the desk, and the
    // file is opened by the centre's own staff.
    expect(toCsvField('=HYPERLINK("http://x/","اضغط")')).toBe('"\'=HYPERLINK(""http://x/"",""اضغط"")"');
    expect(toCsvField("=1+1")).toBe("'=1+1");
    expect(toCsvField("@SUM(A1:A9)")).toBe("'@SUM(A1:A9)");
    expect(toCsvField("+cmd|' /C calc'!A0")).toBe(`'+cmd|' /C calc'!A0`);
    expect(toCsvField("-2+3+cmd|' /C calc'!A0")).toBe(`'-2+3+cmd|' /C calc'!A0`);
  });

  it("stops a leading tab or carriage return, which Excel also treats as a lead-in", () => {
    // A tab needs no quoting in a comma-separated file, so it only gains the prefix.
    expect(toCsvField("\t=1+1")).toBe("'\t=1+1");
    // A carriage return does need quoting, and gets both.
    expect(toCsvField("\r=1+1")).toBe('"\'\r=1+1"');
  });

  it("leaves a phone number alone", () => {
    // `+201012345678` is arithmetic, not a call. Escaping it would put a visible
    // apostrophe in front of every phone in the export for no gain.
    expect(toCsvField("+201012345678")).toBe("+201012345678");
    expect(toCsvField("+20 102 007 8001")).toBe("+20 102 007 8001");
    expect(toCsvField("-5")).toBe("-5");
  });

  it("leaves ordinary content alone", () => {
    expect(toCsvField("محمد أحمد السيد")).toBe("محمد أحمد السيد");
    expect(toCsvField("NSR-26-00001")).toBe("NSR-26-00001");
    expect(toCsvField("2026-09-16")).toBe("2026-09-16");
    expect(toCsvField(1450)).toBe("1450");
    expect(toCsvField("علمي 1 - بنين")).toBe("علمي 1 - بنين");
  });

  it("protects the header row too, not only the cells", () => {
    expect(toCsv(["=cmd"], [["ok"]])).toContain("'=cmd");
  });
});
