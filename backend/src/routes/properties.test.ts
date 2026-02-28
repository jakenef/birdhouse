import express from "express";
import request from "supertest";
import { describe, expect, it, beforeEach } from "vitest";

import { ParsedPurchaseContract } from "../schemas/parsedPurchaseContract.schema";
import { DocumentStore } from "../services/documentStore";
import {
  EarnestWorkflowError,
  EarnestWorkflowService,
} from "../services/earnestWorkflow";
import { StreetViewService } from "../services/googleStreetView";
import { PropertyEmailSender } from "../services/propertyEmailSender";
import {
  DuplicatePropertyError,
  PropertyStore,
} from "../services/propertyStore";
import { StoredPropertyRecord, StreetViewCacheEntry } from "../types/property";
import { PropertyWorkflowState } from "../types/workflow";
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
      property_email: `property-${this.records.length + 1}@demo.test`,
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

  async findById(id: string): Promise<StoredPropertyRecord | null> {
    return this.records.find((record) => record.id === id) || null;
  }

  async getWorkflowState(propertyId: string): Promise<PropertyWorkflowState | null> {
    return (await this.findById(propertyId))?.workflow_state || null;
  }

  async updateWorkflowState(
    id: string,
    workflowState: PropertyWorkflowState,
  ): Promise<StoredPropertyRecord> {
    const record = await this.findById(id);
    if (!record) {
      throw new Error("not found");
    }

    record.workflow_state = workflowState;
    record.updated_at_iso = "2026-02-28T00:10:00.000Z";
    return record;
  }

  async updateStreetView(
    id: string,
    streetView: StreetViewCacheEntry,
  ): Promise<StoredPropertyRecord> {
    const record = await this.findById(id);
    if (!record) {
      throw new Error("not found");
    }

    record.street_view = streetView;
    record.updated_at_iso = "2026-02-28T00:10:00.000Z";
    return record;
  }
}

class StubDocumentStore {
  async listByPropertyId() {
    return [];
  }

  async findById() {
    return null;
  }
}

class StubPropertyEmailSender {
  async send(input: {
    from: string;
    to: string[];
    subject: string;
  }) {
    return {
      id: "msg_123",
      thread_id: "thread_123",
      sent_at: "2026-02-28T00:20:00.000Z",
      from: input.from,
      to: input.to,
      subject: input.subject,
    };
  }
}

class StubEarnestWorkflowService {
  async getEarnestStep(propertyId: string) {
    if (propertyId === "prop_missing") {
      throw new EarnestWorkflowError("Property not found.");
    }

    return {
      property_id: propertyId,
      property_email: "123-main@demo.test",
      current_label: "earnest_money" as const,
      step_status: "locked" as const,
      locked_reason: "Escrow officer contact is missing.",
      prompt_to_user: "Add your escrow officer contact to prepare the earnest email.",
      contact: null,
      attachment: null,
      draft: {
        subject: null,
        body: null,
        generated_at_iso: null,
        openai_model: null,
        generation_reason: null,
      },
      send_state: {
        thread_id: null,
        message_id: null,
        sent_at_iso: null,
      },
    };
  }

  async prepareEarnestStep(propertyId: string) {
    return {
      property_id: propertyId,
      property_email: "123-main@demo.test",
      current_label: "earnest_money" as const,
      step_status: "action_needed" as const,
      locked_reason: null,
      prompt_to_user: null,
      contact: {
        type: "escrow_officer" as const,
        name: "Sarah Chen",
        email: "sarah@titleco.com",
        company: "TitleCo",
      },
      attachment: {
        document_id: "doc_1",
        filename: "purchase-contract.pdf",
      },
      draft: {
        subject: "Earnest Money - 123 Main",
        body: "Hi Sarah",
        generated_at_iso: "2026-02-28T00:00:00.000Z",
        openai_model: "gpt-4.1",
        generation_reason: "Simple earnest draft.",
      },
      send_state: {
        thread_id: null,
        message_id: null,
        sent_at_iso: null,
      },
    };
  }

  async sendEarnestDraft(propertyId: string, input: { subject: string; body: string }) {
    if (propertyId === "prop_locked") {
      throw new EarnestWorkflowError(
        "Earnest draft can only be sent when the step is action_needed.",
      );
    }

    return {
      property_id: propertyId,
      property_email: "123-main@demo.test",
      current_label: "earnest_money" as const,
      step_status: "waiting_for_parties" as const,
      locked_reason: null,
      prompt_to_user: null,
      contact: {
        type: "escrow_officer" as const,
        name: "Sarah Chen",
        email: "sarah@titleco.com",
      },
      attachment: {
        document_id: "doc_1",
        filename: "purchase-contract.pdf",
      },
      draft: {
        subject: input.subject,
        body: input.body,
        generated_at_iso: "2026-02-28T00:00:00.000Z",
        openai_model: "gpt-4.1",
        generation_reason: "Simple earnest draft.",
      },
      send_state: {
        thread_id: "thread_123",
        message_id: "msg_123",
        sent_at_iso: "2026-02-28T00:20:00.000Z",
      },
    };
  }
}

class StubStreetViewService implements StreetViewService {
  async lookup(): Promise<StreetViewCacheEntry> {
    return {
      status: "available",
      last_checked_at_iso: "2026-02-28T00:05:00.000Z",
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
  }

  async fetchImage() {
    return {
      body: Buffer.from("jpeg-data"),
      contentType: "image/jpeg",
    };
  }
}

describe("properties routes", () => {
  let app: express.Express;
  let store: InMemoryPropertyStore;

  beforeEach(() => {
    store = new InMemoryPropertyStore();
    app = express();
    app.use(express.json());
    app.use(
      "/api",
      createPropertiesRouter(
        store,
        new StubStreetViewService(),
        new StubDocumentStore() as unknown as DocumentStore,
        new StubEarnestWorkflowService() as unknown as EarnestWorkflowService,
        new StubPropertyEmailSender() as unknown as PropertyEmailSender,
      ),
    );
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
      street_view: {
        status: "available",
        image_url: "/api/properties/prop_2/street-view",
      },
    });
  });

  it("hydrates street view data into the property list", async () => {
    await request(app).post("/api/properties").send(buildParsedContract("doc-1"));

    const response = await request(app).get("/api/properties");

    expect(response.status).toBe(200);
    expect(response.body.properties[0].street_view).toMatchObject({
      status: "available",
      image_url: "/api/properties/prop_1/street-view",
      pano_id: "pano-123",
    });
  });

  it("serves the street view proxy image", async () => {
    await request(app).post("/api/properties").send(buildParsedContract("doc-1"));

    const response = await request(app).get("/api/properties/prop_1/street-view");

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("image/jpeg");
    expect(Buffer.isBuffer(response.body)).toBe(true);
  });

  it("returns 404 when a property does not exist for the street view route", async () => {
    const response = await request(app).get("/api/properties/prop_missing/street-view");

    expect(response.status).toBe(404);
  });

  it("returns the earnest pipeline state", async () => {
    await request(app).post("/api/properties").send(buildParsedContract("doc-1"));

    const response = await request(app).get("/api/properties/prop_1/pipeline/earnest");

    expect(response.status).toBe(200);
    expect(response.body.earnest.step_status).toBe("locked");
  });

  it("prepares the earnest draft", async () => {
    await request(app).post("/api/properties").send(buildParsedContract("doc-1"));

    const response = await request(app).post(
      "/api/properties/prop_1/pipeline/earnest/prepare",
    );

    expect(response.status).toBe(200);
    expect(response.body.earnest.step_status).toBe("action_needed");
    expect(response.body.earnest.draft.subject).toBe("Earnest Money - 123 Main");
  });

  it("rejects earnest send requests without subject or body", async () => {
    await request(app).post("/api/properties").send(buildParsedContract("doc-1"));

    const missingSubject = await request(app)
      .post("/api/properties/prop_1/pipeline/earnest/send")
      .send({ body: "Hi Sarah" });

    expect(missingSubject.status).toBe(400);

    const missingBody = await request(app)
      .post("/api/properties/prop_1/pipeline/earnest/send")
      .send({ subject: "Earnest Money - 123 Main" });

    expect(missingBody.status).toBe(400);
  });

  it("sends the earnest draft and returns waiting_for_parties", async () => {
    await request(app).post("/api/properties").send(buildParsedContract("doc-1"));

    const response = await request(app)
      .post("/api/properties/prop_1/pipeline/earnest/send")
      .send({
        subject: "Earnest Money - 123 Main",
        body: "Hi Sarah",
      });

    expect(response.status).toBe(201);
    expect(response.body.earnest.step_status).toBe("waiting_for_parties");
    expect(response.body.earnest.send_state.message_id).toBe("msg_123");
  });

  it("uses the shared mocked sender for inbox send", async () => {
    await request(app).post("/api/properties").send(buildParsedContract("doc-1"));

    const response = await request(app)
      .post("/api/properties/prop_1/inbox/send")
      .send({
        to: ["sarah@titleco.com"],
        subject: "Re: Earnest Money",
        body: "Following up",
      });

    expect(response.status).toBe(201);
    expect(response.body.message.id).toBe("msg_123");
    expect(response.body.message.thread_id).toBe("thread_123");
  });
});
