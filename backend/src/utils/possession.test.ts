import { describe, expect, it } from "vitest";

import { parsePossessionTiming } from "./possession";

describe("parsePossessionTiming", () => {
  it("parses hours after recording", () => {
    expect(parsePossessionTiming("72 Hours after Recording")).toEqual({
      timing: "72 Hours after Recording",
      hours_after_recording: 72,
      days_after_recording: null,
    });
  });

  it("parses days after recording", () => {
    expect(parsePossessionTiming("3 days after recording")).toEqual({
      timing: "3 days after recording",
      hours_after_recording: null,
      days_after_recording: 3,
    });
  });

  it("preserves plain timing strings", () => {
    expect(parsePossessionTiming("Upon Recording")).toEqual({
      timing: "Upon Recording",
      hours_after_recording: null,
      days_after_recording: null,
    });
  });

  it("returns nulls for empty input", () => {
    expect(parsePossessionTiming("  ")).toEqual({
      timing: null,
      hours_after_recording: null,
      days_after_recording: null,
    });
  });
});
