import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createContactsRouter } from "../routes/contacts";
import { createPropertiesRouter } from "../routes/properties";
import { ContactStore } from "../services/contactStore";
import { DocumentStore, StoredDocument } from "../services/documentStore";
import { EarnestWorkflowService } from "../services/earnestWorkflow";
import { generateEarnestDraft } from "../services/earnestDraftGenerator";
import { StreetViewService } from "../services/googleStreetView";
import {
  PropertyEmailSender,
  SendPropertyEmailInput,
  SendPropertyEmailResult,
} from "../services/propertyEmailSender";
import { PropertyStore } from "../services/propertyStore";
import { StoredPropertyRecord, StreetViewCacheEntry } from "../types/property";
import { PropertyWorkflowState } from "../types/workflow";
import { buildIntakePropertyFixture } from "../test-utils/buildIntakePropertyFixture";

vi.mock("../services/earnestDraftGenerator", () => ({
  generateEarnestDraft: vi.fn(),
}));

class IntegrationPropertyStore implements PropertyStore {
  constructor(private record: StoredPropertyRecord) {}

  async list(): Promise<StoredPropertyRecord[]> {
    return [this.record];
  }

  async create(parsedContract: StoredPropertyRecord["parsed_contract"]) {
    this.record = {
      id: "prop_created",
      property_name: parsedContract.property.address_full || "Unnamed Property",
      property_email: "created@bronaaelda.resend.app",
      created_at_iso: "2026-02-28T00:00:00.000Z",
      updated_at_iso: "2026-02-28T00:00:00.000Z",
      parsed_contract: parsedContract,
    };
    return this.record;
  }

  async findByDocHash(docHash: string): Promise<StoredPropertyRecord | null> {
    return this.record.parsed_contract.metadata.doc_hash === docHash
      ? this.record
      : null;
  }

  async findById(id: string): Promise<StoredPropertyRecord | null> {
    return this.record.id === id ? this.record : null;
  }

  async findByPropertyEmail(email: string): Promise<StoredPropertyRecord | null> {
    return this.record.property_email === email ? this.record : null;
  }

  async getWorkflowState(propertyId: string): Promise<PropertyWorkflowState | null> {
    return propertyId === this.record.id ? this.record.workflow_state || null : null;
  }

  async updateWorkflowState(
    id: string,
    workflowState: PropertyWorkflowState,
  ): Promise<StoredPropertyRecord> {
    if (id !== this.record.id) {
      throw new Error("not found");
    }

    this.record = {
      ...this.record,
      workflow_state: workflowState,
      updated_at_iso: "2026-02-28T00:10:00.000Z",
    };
    return this.record;
  }

  async updateStreetView(
    id: string,
    streetView: StreetViewCacheEntry,
  ): Promise<StoredPropertyRecord> {
    if (id !== this.record.id) {
      throw new Error("not found");
    }

    this.record = {
      ...this.record,
      street_view: streetView,
    };
    return this.record;
  }
}

class IntegrationDocumentStore {
  constructor(private documents: StoredDocument[]) {}

  async listByPropertyId(propertyId: string): Promise<StoredDocument[]> {
    return this.documents.filter((document) => document.property_id === propertyId);
  }

  async findById(id: string): Promise<StoredDocument | null> {
    return this.documents.find((document) => document.id === id) || null;
  }
}

class StubStreetViewService implements StreetViewService {
  async lookup(): Promise<StreetViewCacheEntry> {
    return {
      status: "available",
      last_checked_at_iso: "2026-02-28T00:05:00.000Z",
      source_address: "6119 W Montauk Ln Highland Utah Utah, Zip 84003",
      resolved_address: "6119 W Montauk Ln, Highland, UT 84003, USA",
      latitude: 40.4587,
      longitude: -111.805,
      target_latitude: 40.4586,
      target_longitude: -111.805,
      heading: 180,
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

class SpyPropertyEmailSender extends PropertyEmailSender {
  lastSendInput: SendPropertyEmailInput | null = null;

  async send(input: SendPropertyEmailInput): Promise<SendPropertyEmailResult> {
    this.lastSendInput = input;
    return {
      id: "msg_test_1",
      thread_id: "thread_test_1",
      sent_at: "2026-02-28T00:20:00.000Z",
      from: input.from,
      to: input.to,
      subject: input.subject,
    };
  }
}

describe("earnest intake flow integration", () => {
  let app: express.Express;
  let propertyStore: IntegrationPropertyStore;
  let documentStore: IntegrationDocumentStore;
  let contactStore: ContactStore;
  let propertyEmailSender: SpyPropertyEmailSender;
  let earnestWorkflowService: EarnestWorkflowService;
  let propertyId: string;
  let propertyEmail: string;
  let documentId: string;

  beforeEach(() => {
    vi.resetAllMocks();

    const fixture = buildIntakePropertyFixture();
    propertyStore = new IntegrationPropertyStore(fixture.property);
    documentStore = new IntegrationDocumentStore([fixture.document]);
    contactStore = new ContactStore();
    propertyEmailSender = new SpyPropertyEmailSender();
    earnestWorkflowService = new EarnestWorkflowService(
      propertyStore,
      documentStore as unknown as DocumentStore,
      contactStore,
      propertyEmailSender,
    );
    propertyId = fixture.property.id;
    propertyEmail = fixture.property.property_email || "";
    documentId = fixture.document.id;

    app = express();
    app.use(express.json());
    app.use("/api", createContactsRouter(contactStore));
    app.use(
      "/api",
      createPropertiesRouter(
        propertyStore,
        new StubStreetViewService(),
        documentStore as unknown as DocumentStore,
        earnestWorkflowService,
        propertyEmailSender,
      ),
    );
  });

  it("uses the intake-created property to prepare earnest, send the draft, and targets haydenkpeterson@gmail.com", async () => {
    vi.mocked(generateEarnestDraft).mockResolvedValue({
      subject: "Earnest Money - 6119 W Montauk Ln",
      body: [
        "Hi Hayden Peterson,",
        "",
        "Per the executed purchase agreement for 6119 W Montauk Ln, the earnest money deposit is $7,500.",
        "",
        "Attached is the purchase contract. Could you please provide wiring instructions?",
        "",
        "Thank you,",
        "John Smith",
      ].join("\n"),
      generation_reason: "Simple earnest request using contract details.",
      openai_model: "gpt-4.1",
    });

    const contactResponse = await request(app).post("/api/contacts").send({
      type: "escrow_officer",
      name: "Hayden Peterson",
      email: "haydenkpeterson@gmail.com",
    });

    expect(contactResponse.status).toBe(200);

    const prepareResponse = await request(app).post(
      `/api/properties/${propertyId}/pipeline/earnest/prepare`,
    );

    expect(prepareResponse.status).toBe(200);
    expect(prepareResponse.body.earnest.step_status).toBe("action_needed");
    expect(prepareResponse.body.earnest.contact.email).toBe(
      "haydenkpeterson@gmail.com",
    );
    expect(prepareResponse.body.earnest.attachment.filename).toBe(
      "purchase-contract.pdf",
    );
    expect(prepareResponse.body.earnest.draft.subject).toBeTruthy();
    expect(prepareResponse.body.earnest.draft.body).toContain(
      "6119 W Montauk Ln",
    );

    const sendResponse = await request(app)
      .post(`/api/properties/${propertyId}/pipeline/earnest/send`)
      .send({
        subject: prepareResponse.body.earnest.draft.subject,
        body: prepareResponse.body.earnest.draft.body,
      });

    expect(sendResponse.status).toBe(201);
    expect(sendResponse.body.earnest.step_status).toBe("waiting_for_parties");
    expect(sendResponse.body.earnest.send_state.message_id).toBe("msg_test_1");
    expect(sendResponse.body.earnest.send_state.thread_id).toBe("thread_test_1");

    expect(propertyEmailSender.lastSendInput).toMatchObject({
      to: ["haydenkpeterson@gmail.com"],
      from: propertyEmail,
      subject: prepareResponse.body.earnest.draft.subject,
    });
    expect(propertyEmailSender.lastSendInput?.attachments?.[0].document_id).toBe(
      documentId,
    );

    const persistedWorkflowState = await propertyStore.getWorkflowState(propertyId);
    expect(persistedWorkflowState?.steps.earnest_money.status).toBe(
      "waiting_for_parties",
    );
    expect(persistedWorkflowState?.earnest.draft.status).toBe("sent");
    expect(persistedWorkflowState?.earnest.draft.recipient_email).toBe(
      "haydenkpeterson@gmail.com",
    );
    expect(persistedWorkflowState?.earnest.draft.sent_message_id).toBe(
      "msg_test_1",
    );
  });

  it("returns locked when the earnest contact is missing", async () => {
    const prepareResponse = await request(app).post(
      `/api/properties/${propertyId}/pipeline/earnest/prepare`,
    );

    expect(prepareResponse.status).toBe(200);
    expect(prepareResponse.body.earnest.step_status).toBe("locked");
    expect(prepareResponse.body.earnest.locked_reason).toBe(
      "Escrow officer contact is missing.",
    );
  });

  it("unlocks after the earnest contact is added", async () => {
    vi.mocked(generateEarnestDraft).mockResolvedValue({
      subject: "Earnest Money - 6119 W Montauk Ln",
      body: "Hi Hayden Peterson,\n\nPlease send wiring instructions.\n\nThank you,\nJohn Smith",
      generation_reason: "Simple earnest request using contract details.",
      openai_model: "gpt-4.1",
    });

    const firstPrepare = await request(app).post(
      `/api/properties/${propertyId}/pipeline/earnest/prepare`,
    );
    expect(firstPrepare.body.earnest.step_status).toBe("locked");

    await request(app).post("/api/contacts").send({
      type: "escrow_officer",
      name: "Hayden Peterson",
      email: "haydenkpeterson@gmail.com",
    });

    const secondPrepare = await request(app).post(
      `/api/properties/${propertyId}/pipeline/earnest/prepare`,
    );

    expect(secondPrepare.status).toBe(200);
    expect(secondPrepare.body.earnest.step_status).toBe("action_needed");
  });

  it("locks when the REPC document is missing", async () => {
    documentStore = new IntegrationDocumentStore([]);
    earnestWorkflowService = new EarnestWorkflowService(
      propertyStore,
      documentStore as unknown as DocumentStore,
      contactStore,
      propertyEmailSender,
    );

    app = express();
    app.use(express.json());
    app.use("/api", createContactsRouter(contactStore));
    app.use(
      "/api",
      createPropertiesRouter(
        propertyStore,
        new StubStreetViewService(),
        documentStore as unknown as DocumentStore,
        earnestWorkflowService,
        propertyEmailSender,
      ),
    );

    await request(app).post("/api/contacts").send({
      type: "escrow_officer",
      name: "Hayden Peterson",
      email: "haydenkpeterson@gmail.com",
    });

    const prepareResponse = await request(app).post(
      `/api/properties/${propertyId}/pipeline/earnest/prepare`,
    );

    expect(prepareResponse.status).toBe(200);
    expect(prepareResponse.body.earnest.step_status).toBe("locked");
    expect(prepareResponse.body.earnest.locked_reason).toBe(
      "Purchase contract attachment is missing.",
    );
  });

  it("sends edited user content rather than only the generated draft", async () => {
    vi.mocked(generateEarnestDraft).mockResolvedValue({
      subject: "Earnest Money - 6119 W Montauk Ln",
      body: "Hi Hayden Peterson,\n\nOriginal draft.\n\nThank you,\nJohn Smith",
      generation_reason: "Simple earnest request using contract details.",
      openai_model: "gpt-4.1",
    });

    await request(app).post("/api/contacts").send({
      type: "escrow_officer",
      name: "Hayden Peterson",
      email: "haydenkpeterson@gmail.com",
    });

    await request(app).post(`/api/properties/${propertyId}/pipeline/earnest/prepare`);

    const sendResponse = await request(app)
      .post(`/api/properties/${propertyId}/pipeline/earnest/send`)
      .send({
        subject: "Edited Earnest Subject",
        body: "Hi Hayden Peterson,\n\nEdited body.\n\nThank you,\nJohn Smith",
      });

    expect(sendResponse.status).toBe(201);
    expect(propertyEmailSender.lastSendInput?.subject).toBe("Edited Earnest Subject");
    expect(propertyEmailSender.lastSendInput?.body).toContain("Edited body.");
  });
});
