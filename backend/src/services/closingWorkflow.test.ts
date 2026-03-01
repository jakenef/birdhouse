import { beforeEach, describe, expect, it } from "vitest";

import { PropertyStore } from "./propertyStore";
import {
  ClosingWorkflowService,
  type ClosingStepView,
} from "./closingWorkflow";
import { StoredPropertyRecord, StreetViewCacheEntry } from "../types/property";
import { PropertyWorkflowState } from "../types/workflow";
import { buildIntakePropertyFixture } from "../test-utils/buildIntakePropertyFixture";

class InMemoryPropertyStore implements PropertyStore {
  record: StoredPropertyRecord = buildIntakePropertyFixture().property;

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
    _id: string,
    streetView: StreetViewCacheEntry,
  ): Promise<StoredPropertyRecord> {
    this.record = {
      ...this.record,
      street_view: streetView,
    };
    return this.record;
  }
}

describe("ClosingWorkflowService", () => {
  let propertyStore: InMemoryPropertyStore;
  let service: ClosingWorkflowService;

  beforeEach(() => {
    propertyStore = new InMemoryPropertyStore();
    service = new ClosingWorkflowService(propertyStore);
  });

  it("returns a locked closing step initially", async () => {
    const closing = await service.getClosingStep("prop_fixture_1");

    expect(closing.step_status).toBe("locked");
    expect(closing.pending_user_action).toBe("none");
  });

  it("moves closing to action_needed when an ALTA document is detected", async () => {
    const closing = await service.applyAltaDetection("prop_fixture_1", {
      messageId: "im_alta",
      threadId: "thr_closing",
      documentId: "doc_alta",
      filename: "alta.pdf",
      summary: "ALTA closing statement detected for the transaction.",
      confidence: 0.95,
      reason: 'Attachment "alta.pdf" was classified as an ALTA closing statement.',
      analyzedAtIso: "2026-02-28T18:00:00.000Z",
    });

    expect(closing.step_status).toBe("action_needed");
    expect(closing.pending_user_action).toBe("confirm_closing_complete");
    expect(closing.evidence_document.document_id).toBe("doc_alta");
  });

  it("marks all pipeline steps completed when closing is confirmed", async () => {
    await service.applyAltaDetection("prop_fixture_1", {
      messageId: "im_alta",
      threadId: "thr_closing",
      documentId: "doc_alta",
      filename: "alta.pdf",
      summary: "ALTA closing statement detected for the transaction.",
      confidence: 0.95,
      reason: 'Attachment "alta.pdf" was classified as an ALTA closing statement.',
      analyzedAtIso: "2026-02-28T18:00:00.000Z",
    });

    const closing = await service.confirmComplete("prop_fixture_1");
    const workflowState = await propertyStore.getWorkflowState("prop_fixture_1");

    expect(closing.step_status).toBe("completed");
    expect(closing.pending_user_action).toBe("none");
    expect(
      Object.values(workflowState?.steps || {}).every((step) => step.status === "completed"),
    ).toBe(true);
  });

  it("rejects completion when closing confirmation is not pending", async () => {
    await expect(service.confirmComplete("prop_fixture_1")).rejects.toThrow(
      "Closing can only be completed when user confirmation is pending.",
    );
  });
});
