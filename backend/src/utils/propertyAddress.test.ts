import { describe, expect, it } from "vitest";

import { buildStreetViewLookupAddress } from "./propertyAddress";

describe("buildStreetViewLookupAddress", () => {
  it("uses the full address when already complete", () => {
    expect(
      buildStreetViewLookupAddress({
        address_full: "123 Main St, Park City, UT 84060",
        city: "Park City",
        state: "UT",
        zip: "84060",
      }),
    ).toBe("123 Main St, Park City, UT 84060");
  });

  it("appends missing city state and zip details", () => {
    expect(
      buildStreetViewLookupAddress({
        address_full: "742 Evergreen Terrace",
        city: "Salt Lake City",
        state: "UT",
        zip: "84105",
      }),
    ).toBe("742 Evergreen Terrace, Salt Lake City, UT 84105");
  });

  it("returns null when no usable address exists", () => {
    expect(
      buildStreetViewLookupAddress({
        address_full: null,
        city: null,
        state: null,
        zip: null,
      }),
    ).toBeNull();
  });
});
