import { describe, expect, it } from "vitest";

import { parseDateToIso } from "./parseDate";

describe("parseDateToIso", () => {
  it("keeps ISO dates", () => {
    expect(parseDateToIso("2026-02-27")).toBe("2026-02-27");
  });

  it("parses slash-delimited month/day/year dates", () => {
    expect(parseDateToIso("2/7/2026")).toBe("2026-02-07");
    expect(parseDateToIso("02/17/2026")).toBe("2026-02-17");
  });

  it("parses year-first slash dates", () => {
    expect(parseDateToIso("2026/02/27")).toBe("2026-02-27");
  });

  it("parses month-name dates", () => {
    expect(parseDateToIso("February 7, 2026")).toBe("2026-02-07");
    expect(parseDateToIso("Feb 17, 2026")).toBe("2026-02-17");
  });

  it("returns null for invalid dates", () => {
    expect(parseDateToIso("02/30/2026")).toBeNull();
    expect(parseDateToIso("not a date")).toBeNull();
  });

  it("returns null for empty values", () => {
    expect(parseDateToIso("")).toBeNull();
    expect(parseDateToIso(null)).toBeNull();
    expect(parseDateToIso(undefined)).toBeNull();
  });
});
