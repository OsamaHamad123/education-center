import { describe, expect, it } from "vitest";
import { dateParam, readDateRange, uuidParam } from "./url-filters";

const UUID = "7b68d458-d423-4260-88d4-1fd9e59d04b5";

describe("dateParam", () => {
  it("keeps a real calendar day", () => {
    expect(dateParam.parse("2026-09-16")).toBe("2026-09-16");
  });

  it("drops a day that does not exist, however well formed", () => {
    // These were the 500s: the shape is right and Postgres still refuses the cast.
    expect(dateParam.parse("2026-02-31")).toBeUndefined();
    expect(dateParam.parse("2026-13-01")).toBeUndefined();
    expect(dateParam.parse("2026-00-10")).toBeUndefined();
  });

  it("drops anything that is not a date at all", () => {
    expect(dateParam.parse("abc")).toBeUndefined();
    expect(dateParam.parse("")).toBeUndefined();
    expect(dateParam.parse("2026/09/16")).toBeUndefined();
    expect(dateParam.parse("16-09-2026")).toBeUndefined();
    expect(dateParam.parse(42)).toBeUndefined();
    expect(dateParam.parse(["2026-09-16"])).toBeUndefined();
  });

  it("passes an absent value through untouched", () => {
    expect(dateParam.parse(undefined)).toBeUndefined();
  });
});

describe("uuidParam", () => {
  it("keeps a well-formed id", () => {
    expect(uuidParam.parse(UUID)).toBe(UUID);
  });

  it("drops a malformed one instead of sending it to Postgres", () => {
    expect(uuidParam.parse("not-a-uuid")).toBeUndefined();
    expect(uuidParam.parse("")).toBeUndefined();
    expect(uuidParam.parse(`${UUID}'; drop table students; --`)).toBeUndefined();
  });

  it("does not judge whether the id exists — that is RLS's answer, not this file's", () => {
    expect(uuidParam.parse("00000000-0000-4000-8000-000000000000")).toBe(
      "00000000-0000-4000-8000-000000000000",
    );
  });
});

describe("readDateRange", () => {
  it("reads both ends", () => {
    expect(readDateRange({ from: "2026-09-01", to: "2026-09-30" })).toEqual({
      from: "2026-09-01",
      to: "2026-09-30",
    });
  });

  it("keeps the good half and drops the bad one", () => {
    expect(readDateRange({ from: "abc", to: "2026-09-30" })).toEqual({
      from: undefined,
      to: "2026-09-30",
    });
  });

  it("survives a query string with nothing useful in it", () => {
    expect(readDateRange({ from: "abc", to: "def" })).toEqual({ from: undefined, to: undefined });
    expect(readDateRange({})).toEqual({ from: undefined, to: undefined });
    expect(readDateRange(undefined)).toEqual({ from: undefined, to: undefined });
  });

  it("ignores the rest of the query string", () => {
    expect(readDateRange({ from: "2026-09-01", to: "2026-09-02", page: "3", junk: "x" })).toEqual({
      from: "2026-09-01",
      to: "2026-09-02",
    });
  });
});
