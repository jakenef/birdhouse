import { describe, expect, it } from "vitest";

import { derivePropertyName } from "./propertyName";

describe("derivePropertyName", () => {
  it("uses the full address when available", () => {
    expect(
      derivePropertyName({
        property: {
          address_full: "123 Main St, Salt Lake City, UT 84101",
          city: "Salt Lake City",
          state: "UT",
        },
      }),
    ).toBe("123 Main St, Salt Lake City, UT 84101");
  });

  it("falls back to city and state", () => {
    expect(
      derivePropertyName({
        property: {
          address_full: null,
          city: "Park City",
          state: "UT",
        },
      }),
    ).toBe("Park City, UT");
  });

  it("falls back to unnamed property", () => {
    expect(
      derivePropertyName({
        property: {
          address_full: null,
          city: null,
          state: null,
        },
      }),
    ).toBe("Unnamed Property");
  });
});
