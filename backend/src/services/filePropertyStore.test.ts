import { promises as fs } from "fs";
import os from "os";
import path from "path";

import { describe, expect, it, beforeEach, afterEach } from "vitest";

import { ParsedPurchaseContract } from "../schemas/parsedPurchaseContract.schema";
import { FilePropertyStore } from "./filePropertyStore";
import { DuplicatePropertyError, PropertyStoreError } from "./propertyStore";
import { StreetViewCacheEntry } from "../types/property";

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

describe("FilePropertyStore", () => {
  let tempDir: string;
  let filePath: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "birdhouse-store-"));
    filePath = path.join(tempDir, "mock-properties.json");
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("creates the file lazily and reads empty state", async () => {
    const store = new FilePropertyStore(filePath);

    await expect(store.list()).resolves.toEqual([]);
    await expect(fs.access(filePath)).resolves.toBeUndefined();
  });

  it("appends a valid record and returns newest first", async () => {
    const store = new FilePropertyStore(filePath);

    const first = await store.create(buildParsedContract("doc-1"));
    const second = await store.create(buildParsedContract("doc-2"));

    const records = await store.list();

    expect(records).toHaveLength(2);
    expect(records[0].id).toBe(second.id);
    expect(records[1].id).toBe(first.id);
  });

  it("rejects duplicate doc_hash values", async () => {
    const store = new FilePropertyStore(filePath);

    await store.create(buildParsedContract("doc-1"));

    await expect(store.create(buildParsedContract("doc-1"))).rejects.toBeInstanceOf(
      DuplicatePropertyError,
    );
  });

  it("surfaces malformed file errors", async () => {
    const store = new FilePropertyStore(filePath);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, "{not json", "utf8");

    await expect(store.list()).rejects.toBeInstanceOf(PropertyStoreError);
  });

  it("accepts existing records without street view metadata", async () => {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(
      filePath,
      JSON.stringify(
        {
          properties: [
            {
              id: "prop_1",
              property_name: "123 Main St, Park City, UT 84060",
              created_at_iso: "2026-02-28T00:00:00.000Z",
              updated_at_iso: "2026-02-28T00:00:00.000Z",
              parsed_contract: buildParsedContract("doc-1"),
            },
          ],
        },
        null,
        2,
      ),
      "utf8",
    );

    const store = new FilePropertyStore(filePath);
    await expect(store.list()).resolves.toHaveLength(1);
  });

  it("accepts existing street view cache entries from the older shape", async () => {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(
      filePath,
      JSON.stringify(
        {
          properties: [
            {
              id: "prop_1",
              property_name: "123 Main St, Park City, UT 84060",
              created_at_iso: "2026-02-28T00:00:00.000Z",
              updated_at_iso: "2026-02-28T00:00:00.000Z",
              parsed_contract: buildParsedContract("doc-1"),
              street_view: {
                status: "available",
                last_checked_at_iso: "2026-02-28T01:00:00.000Z",
                source_address: "123 Main St, Park City, UT 84060",
                resolved_address: "123 Main St, Park City, UT 84060, USA",
                latitude: 40.6461,
                longitude: -111.498,
                pano_id: "pano-123",
                error_message: null,
              },
            },
          ],
        },
        null,
        2,
      ),
      "utf8",
    );

    const store = new FilePropertyStore(filePath);
    await expect(store.list()).resolves.toHaveLength(1);
  });

  it("updates street view cache metadata for an existing record", async () => {
    const store = new FilePropertyStore(filePath);
    const created = await store.create(buildParsedContract("doc-1"));
    const streetView: StreetViewCacheEntry = {
      status: "available",
      last_checked_at_iso: "2026-02-28T01:00:00.000Z",
      source_address: "123 Main St, Park City, UT 84060",
      resolved_address: "123 Main St, Park City, UT 84060, USA",
      latitude: 40.6461,
      longitude: -111.498,
      target_latitude: 40.6462,
      target_longitude: -111.4978,
      heading: 44,
      pano_id: "pano-123",
      error_message: null,
    };

    const updated = await store.updateStreetView(created.id, streetView);
    const fetched = await store.findById(created.id);

    expect(updated.street_view).toEqual(streetView);
    expect(fetched?.street_view).toEqual(streetView);
  });
});
