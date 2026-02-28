import { describe, expect, it } from "vitest";
import { normalizeSubject, subjectThreadId } from "./emailThreading";

describe("normalizeSubject", () => {
  it("returns the subject lowercased and trimmed", () => {
    expect(normalizeSubject("  Hello World  ")).toBe("hello world");
  });

  it("strips a single Re: prefix", () => {
    expect(normalizeSubject("Re: Hello World")).toBe("hello world");
  });

  it("strips a single Fwd: prefix", () => {
    expect(normalizeSubject("Fwd: Hello World")).toBe("hello world");
  });

  it("strips Fw: shorthand", () => {
    expect(normalizeSubject("Fw: Hello World")).toBe("hello world");
  });

  it("strips nested Re/Fwd prefixes", () => {
    expect(normalizeSubject("Re: Fwd: Re: Hello World")).toBe("hello world");
  });

  it("strips non-English reply prefixes: Aw (German), Sv (Swedish)", () => {
    expect(normalizeSubject("Aw: Sv: Important")).toBe("important");
  });

  it("handles case-insensitive prefixes", () => {
    expect(normalizeSubject("RE: FWD: re: fwd: subject")).toBe("subject");
  });

  it("returns empty string for prefix-only subject", () => {
    expect(normalizeSubject("Re:")).toBe("");
  });

  it("handles empty input", () => {
    expect(normalizeSubject("")).toBe("");
  });

  it("preserves subject that looks similar to a prefix but isn't", () => {
    expect(normalizeSubject("Review: This Document")).toBe(
      "review: this document",
    );
  });
});

describe("subjectThreadId", () => {
  it("returns a thr_ prefixed string", () => {
    const id = subjectThreadId("hello world", "prop_1");
    expect(id).toMatch(/^thr_[0-9a-f]{16}$/);
  });

  it("is deterministic for the same inputs", () => {
    const a = subjectThreadId("hello world", "prop_1");
    const b = subjectThreadId("hello world", "prop_1");
    expect(a).toBe(b);
  });

  it("differs when subject differs", () => {
    const a = subjectThreadId("hello world", "prop_1");
    const b = subjectThreadId("goodbye world", "prop_1");
    expect(a).not.toBe(b);
  });

  it("differs when property ID differs", () => {
    const a = subjectThreadId("hello world", "prop_1");
    const b = subjectThreadId("hello world", "prop_2");
    expect(a).not.toBe(b);
  });
});
