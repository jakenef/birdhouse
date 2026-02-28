import { describe, expect, it } from "vitest";

import { ContactStore } from "./contactStore";

describe("ContactStore", () => {
  it("stores and returns a contact by type", () => {
    const store = new ContactStore();

    store.set({
      type: "escrow_officer",
      name: "Sarah Chen",
      email: "sarah@titleco.com",
      updated_at: "2026-02-28T00:00:00.000Z",
    });

    expect(store.getByType("escrow_officer")).toMatchObject({
      name: "Sarah Chen",
      email: "sarah@titleco.com",
    });
  });

  it("lists all contacts and overwrites by type", () => {
    const store = new ContactStore();

    store.set({
      type: "escrow_officer",
      name: "Sarah Chen",
      email: "sarah@titleco.com",
      updated_at: "2026-02-28T00:00:00.000Z",
    });
    store.set({
      type: "escrow_officer",
      name: "Amy Closer",
      email: "amy@titleco.com",
      updated_at: "2026-02-28T01:00:00.000Z",
    });
    store.set({
      type: "lender",
      name: "Tom Loan",
      email: "tom@lender.com",
      updated_at: "2026-02-28T01:05:00.000Z",
    });

    expect(store.list()).toHaveLength(2);
    expect(store.getByType("escrow_officer")?.name).toBe("Amy Closer");
  });
});
