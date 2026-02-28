import { beforeEach, describe, expect, it, vi } from "vitest";

import { ContactStore } from "./contactStore";
import { DocumentStore } from "./documentStore";
import {
  createInitialWorkflowState,
  EarnestWorkflowService,
} from "./earnestWorkflow";
import { generateEarnestDraft } from "./earnestDraftGenerator";
import { PropertyEmailSender } from "./propertyEmailSender";
import { PropertyStore } from "./propertyStore";
import { StoredPropertyRecord, StreetViewCacheEntry } from "../types/property";
import { PropertyWorkflowState } from "../types/workflow";
import { ParsedPurchaseContract } from "../schemas/parsedPurchaseContract.schema";

vi.mock("./earnestDraftGenerator", () => ({
  generateEarnestDraft: vi.fn(),
}));

function buildParsedContract(): ParsedPurchaseContract {
  return {
    metadata: {
      doc_hash: "doc-hash-1",
      filename: "contract.pdf",
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
      buyers: ["John Smith"],
      sellers: ["Seller One"],
    },
    property: {
      address_full: "200 Promenade Ln, Danville, CA 94506",
      city: "Danville",
      state: "CA",
      zip: "94506",
    },
    key_dates: {
      effective_date: "2026-02-28",
      due_diligence_deadline: "2026-03-10",
      financing_deadline: "2026-03-20",
      appraisal_deadline: "2026-03-18",
      seller_disclosure_deadline: null,
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
        amount: 5000,
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
  record: StoredPropertyRecord = {
    id: "prop_1",
    property_name: "200 Promenade",
    property_email: "200-promenade@demo.test",
    created_at_iso: "2026-02-28T00:00:00.000Z",
    updated_at_iso: "2026-02-28T00:00:00.000Z",
    parsed_contract: buildParsedContract(),
  };

  async list(): Promise<StoredPropertyRecord[]> {
    return [this.record];
  }

  async create(): Promise<StoredPropertyRecord> {
    return this.record;
  }

  async findByDocHash(): Promise<StoredPropertyRecord | null> {
    return this.record;
  }

  async findById(id: string): Promise<StoredPropertyRecord | null> {
    return id === this.record.id ? this.record : null;
  }

  async findByPropertyEmail(email: string): Promise<StoredPropertyRecord | null> {
    return email === this.record.property_email ? this.record : null;
  }

  async getWorkflowState(): Promise<PropertyWorkflowState | null> {
    return this.record.workflow_state || null;
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
      updated_at_iso: new Date().toISOString(),
    };

    return this.record;
  }

  async updateStreetView(
    id: string,
    streetView: StreetViewCacheEntry,
  ): Promise<StoredPropertyRecord> {
    this.record = {
      ...this.record,
      street_view: streetView,
    };
    return this.record;
  }
}

class InMemoryDocumentStore {
  documents = [
    {
      id: "doc_1",
      property_id: "prop_1",
      filename: "purchase-contract.pdf",
      file_path: "data/purchase-contract.pdf",
      mime_type: "application/pdf",
      size_bytes: 1234,
      doc_hash: "doc-hash-1",
      source: "email_intake",
      created_at: "2026-02-28T00:00:00.000Z",
    },
  ];

  async listByPropertyId(propertyId: string) {
    return this.documents.filter((document) => document.property_id === propertyId);
  }

  async findById(id: string) {
    return this.documents.find((document) => document.id === id) || null;
  }
}

describe("EarnestWorkflowService", () => {
  let propertyStore: InMemoryPropertyStore;
  let documentStore: InMemoryDocumentStore;
  let contactStore: ContactStore;
  let propertyEmailSender: PropertyEmailSender;
  let service: EarnestWorkflowService;

  beforeEach(() => {
    vi.resetAllMocks();
    propertyStore = new InMemoryPropertyStore();
    documentStore = new InMemoryDocumentStore();
    contactStore = new ContactStore();
    propertyEmailSender = new PropertyEmailSender();
    service = new EarnestWorkflowService(
      propertyStore,
      documentStore as unknown as DocumentStore,
      contactStore,
      propertyEmailSender,
    );
  });

  it("creates the initial shared workflow shape", () => {
    const state = createInitialWorkflowState();

    expect(state.steps.under_contract.status).toBe("completed");
    expect(state.steps.earnest_money.status).toBe("locked");
    expect(state.steps.financing.status).toBe("locked");
  });

  it("locks earnest when the contact is missing", async () => {
    const earnest = await service.prepareEarnestStep("prop_1");

    expect(earnest.step_status).toBe("locked");
    expect(earnest.locked_reason).toBe("Escrow officer contact is missing.");
  });

  it("locks earnest when the REPC is missing", async () => {
    documentStore.documents = [];
    contactStore.set({
      type: "escrow_officer",
      name: "Sarah Chen",
      email: "sarah@titleco.com",
      updated_at: "2026-02-28T00:00:00.000Z",
    });

    const earnest = await service.prepareEarnestStep("prop_1");

    expect(earnest.step_status).toBe("locked");
    expect(earnest.locked_reason).toBe("Purchase contract attachment is missing.");
  });

  it("creates an action-needed earnest draft when prerequisites exist", async () => {
    contactStore.set({
      type: "escrow_officer",
      name: "Sarah Chen",
      email: "sarah@titleco.com",
      company: "TitleCo",
      updated_at: "2026-02-28T00:00:00.000Z",
    });
    vi.mocked(generateEarnestDraft).mockResolvedValue({
      subject: "Earnest Money - 200 Promenade",
      body: "Hi Sarah,\n\nPlease provide wiring instructions.\n\nThank you,\nJohn Smith",
      generation_reason: "Simple earnest request.",
      openai_model: "gpt-4.1",
    });

    const earnest = await service.prepareEarnestStep("prop_1");

    expect(earnest.step_status).toBe("action_needed");
    expect(earnest.contact?.email).toBe("sarah@titleco.com");
    expect(earnest.attachment?.filename).toBe("purchase-contract.pdf");
    expect(earnest.draft.subject).toBe("Earnest Money - 200 Promenade");
  });

  it("sends the edited draft and transitions to waiting_for_parties", async () => {
    contactStore.set({
      type: "escrow_officer",
      name: "Sarah Chen",
      email: "sarah@titleco.com",
      company: "TitleCo",
      updated_at: "2026-02-28T00:00:00.000Z",
    });
    vi.mocked(generateEarnestDraft).mockResolvedValue({
      subject: "Earnest Money - 200 Promenade",
      body: "Hi Sarah",
      generation_reason: "Simple earnest request.",
      openai_model: "gpt-4.1",
    });

    await service.prepareEarnestStep("prop_1");
    const earnest = await service.sendEarnestDraft("prop_1", {
      subject: "Earnest Money - Edited",
      body: "Hi Sarah,\n\nPlease send wiring instructions.\n\nThank you,\nJohn Smith",
    });

    expect(earnest.step_status).toBe("waiting_for_parties");
    expect(earnest.draft.subject).toBe("Earnest Money - Edited");
    expect(earnest.send_state.message_id).toBeTruthy();
    expect(earnest.send_state.thread_id).toBeTruthy();
  });
});
