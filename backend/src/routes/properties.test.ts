import express from "express";
import request from "supertest";
import { describe, expect, it, beforeEach } from "vitest";

import { ParsedPurchaseContract } from "../schemas/parsedPurchaseContract.schema";
import {
  DuplicatePropertyError,
  PropertyStore,
} from "../services/propertyStore";
import { StoredPropertyRecord } from "../types/property";
import { createPropertiesRouter } from "./properties";

function buildParsedContract(docHash: string): ParsedPurchaseContract {
  return {
    metadata: {
      doc_hash: docHash,
      filename: `${docHash}.pdf`,
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

class InMemoryPropertyStore implements PropertyStore {
  private readonly records: StoredPropertyRecord[] = [];

  async list(): Promise<StoredPropertyRecord[]> {
    return [...this.records].reverse();
  }

  async create(
    parsedContract: ParsedPurchaseContract,
  ): Promise<StoredPropertyRecord> {
    const existing = this.records.find(
      (record) =>
        record.parsed_contract.metadata.doc_hash === parsedContract.metadata.doc_hash,
    );

    if (existing) {
      throw new DuplicatePropertyError("duplicate");
    }

    const record: StoredPropertyRecord = {
      id: `prop_${this.records.length + 1}`,
      property_name: parsedContract.property.address_full || "Unnamed Property",
      created_at_iso: `2026-02-28T00:00:0${this.records.length}.000Z`,
      updated_at_iso: `2026-02-28T00:00:0${this.records.length}.000Z`,
      parsed_contract: parsedContract,
    };

    this.records.push(record);
    return record;
  }

  async findByDocHash(docHash: string): Promise<StoredPropertyRecord | null> {
    return (
      this.records.find(
        (record) => record.parsed_contract.metadata.doc_hash === docHash,
      ) || null
    );
  }
}

describe("properties routes", () => {
  let app: express.Express;
  let store: InMemoryPropertyStore;

  beforeEach(() => {
    store = new InMemoryPropertyStore();
    app = express();
    app.use(express.json());
    app.use("/api", createPropertiesRouter(store));
  });

  it("accepts a valid parsed contract", async () => {
    const response = await request(app)
      .post("/api/properties")
      .send(buildParsedContract("doc-1"));

    expect(response.status).toBe(201);
    expect(response.body.property.doc_hash).toBe("doc-1");
    expect(response.body.property.property_name).toBe(
      "123 Main St, Park City, UT 84060",
    );
  });

  it("rejects invalid payloads", async () => {
    const response = await request(app).post("/api/properties").send({});

    expect(response.status).toBe(400);
  });

  it("returns 409 for duplicate doc_hash", async () => {
    await request(app).post("/api/properties").send(buildParsedContract("doc-1"));
    const response = await request(app)
      .post("/api/properties")
      .send(buildParsedContract("doc-1"));

    expect(response.status).toBe(409);
  });

  it("returns an empty list when no records exist", async () => {
    const response = await request(app).get("/api/properties");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ properties: [] });
  });

  it("returns newest-first mapped card dtos", async () => {
    await request(app).post("/api/properties").send(buildParsedContract("doc-1"));
    await request(app).post("/api/properties").send(buildParsedContract("doc-2"));

    const response = await request(app).get("/api/properties");

    expect(response.status).toBe(200);
    expect(response.body.properties).toHaveLength(2);
    expect(response.body.properties[0].doc_hash).toBe("doc-2");
    expect(response.body.properties[1].doc_hash).toBe("doc-1");
    expect(response.body.properties[0]).toMatchObject({
      property_name: "123 Main St, Park City, UT 84060",
      address_full: "123 Main St, Park City, UT 84060",
      city: "Park City",
      state: "UT",
      zip: "84060",
      purchase_price: 500000,
    });
  });
});
