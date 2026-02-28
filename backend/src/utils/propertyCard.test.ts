import { describe, expect, it } from "vitest";

import { ParsedPurchaseContract } from "../schemas/parsedPurchaseContract.schema";
import { StoredPropertyRecord } from "../types/property";
import { toPropertyCardDto } from "./propertyCard";

function buildParsedContract(): ParsedPurchaseContract {
  return {
    metadata: {
      doc_hash: "doc-123",
      filename: "sample.pdf",
      mime_type: "application/pdf",
      bytes: 1024,
      page_count: 2,
      extracted_at_iso: "2026-02-28T00:00:00.000Z",
      source: "upload",
      model: {
        openai_model: "gpt-4.1",
      },
      confidence: {
        overall: 0.95,
        notes: "",
      },
    },
    parties: {
      buyers: ["Buyer One"],
      sellers: ["Seller One"],
    },
    property: {
      address_full: "123 Main St, Park City, UT 84060",
      city: "Park City",
      state: "UT",
      zip: "84060",
    },
    key_dates: {
      effective_date: "2026-03-01",
      due_diligence_deadline: "2026-03-10",
      financing_deadline: "2026-03-20",
      appraisal_deadline: "2026-03-20",
      seller_disclosure_deadline: "2026-03-05",
      settlement_deadline: "2026-04-01",
      possession: {
        timing: null,
        hours_after_recording: null,
        days_after_recording: null,
      },
    },
    money: {
      purchase_price: 500000,
      earnest_money: {
        amount: 10000,
      },
    },
    obligations_and_risks: {
      missing_info: [],
      time_sensitive_items: [],
      warnings: [],
    },
    summary: {
      one_paragraph: "Summary",
      bullets: ["One", "Two", "Three", "Four", "Five"],
      numbers_to_know: [],
      recommended_next_actions: [],
    },
  };
}

describe("toPropertyCardDto", () => {
  it("maps a stored record to a card dto", () => {
    const record: StoredPropertyRecord = {
      id: "prop_1",
      property_name: "123 Main St, Park City, UT 84060",
      created_at_iso: "2026-02-28T01:00:00.000Z",
      updated_at_iso: "2026-02-28T01:00:00.000Z",
      parsed_contract: buildParsedContract(),
    };

    expect(toPropertyCardDto(record)).toEqual({
      id: "prop_1",
      property_name: "123 Main St, Park City, UT 84060",
      doc_hash: "doc-123",
      address_full: "123 Main St, Park City, UT 84060",
      city: "Park City",
      state: "UT",
      zip: "84060",
      purchase_price: 500000,
      buyers: ["Buyer One"],
      sellers: ["Seller One"],
      effective_date: "2026-03-01",
      settlement_deadline: "2026-04-01",
      created_at_iso: "2026-02-28T01:00:00.000Z",
      updated_at_iso: "2026-02-28T01:00:00.000Z",
    });
  });
});
