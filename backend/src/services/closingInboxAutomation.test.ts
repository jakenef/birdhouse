import { promises as fs } from "fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ClosingInboxAutomation } from "./closingInboxAutomation";
import { detectClosingAltaDocument } from "./closingAltaDetector";

vi.mock("./closingAltaDetector", () => ({
  detectClosingAltaDocument: vi.fn(),
}));

describe("ClosingInboxAutomation", () => {
  const documentStore = {
    findById: vi.fn(),
  };
  const closingWorkflowService = {
    applyAltaDetection: vi.fn(),
  };

  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(fs, "readFile").mockResolvedValue(Buffer.from("pdf"));
  });

  it("applies closing workflow when an ALTA PDF is detected", async () => {
    documentStore.findById.mockResolvedValue({
      id: "doc_alta",
      property_id: "prop_1",
      filename: "alta.pdf",
      file_path: "data/intake-pdfs/alta.pdf",
      mime_type: "application/pdf",
    });
    vi.mocked(detectClosingAltaDocument).mockResolvedValue({
      classification: {
        is_alta_document: true,
        document_type: "alta_statement",
        confidence: 0.91,
      },
      metadata: {
        filename: "alta.pdf",
        mime_type: "application/pdf",
        bytes: 3,
        extracted_at_iso: "2026-02-28T18:00:00.000Z",
        openai_model: "gpt-4.1",
      },
      summary: "ALTA closing statement detected for the transaction.",
      warnings: [],
    });

    const automation = new ClosingInboxAutomation(
      documentStore as any,
      closingWorkflowService as any,
    );

    await automation.processStoredMessage({
      propertyId: "prop_1",
      messageId: "im_1",
      threadId: "thr_1",
      receivedAtIso: "2026-02-28T18:00:00.000Z",
      documentIds: ["doc_alta"],
    });

    expect(closingWorkflowService.applyAltaDetection).toHaveBeenCalledWith(
      "prop_1",
      expect.objectContaining({
        documentId: "doc_alta",
        filename: "alta.pdf",
      }),
    );
  });

  it("ignores non-ALTA PDFs", async () => {
    documentStore.findById.mockResolvedValue({
      id: "doc_other",
      property_id: "prop_1",
      filename: "other.pdf",
      file_path: "data/intake-pdfs/other.pdf",
      mime_type: "application/pdf",
    });
    vi.mocked(detectClosingAltaDocument).mockResolvedValue({
      classification: {
        is_alta_document: false,
        document_type: "other",
        confidence: 0.43,
      },
      metadata: {
        filename: "other.pdf",
        mime_type: "application/pdf",
        bytes: 3,
        extracted_at_iso: "2026-02-28T18:00:00.000Z",
        openai_model: "gpt-4.1",
      },
      summary: null,
      warnings: ["No explicit ALTA indicators found."],
    });

    const automation = new ClosingInboxAutomation(
      documentStore as any,
      closingWorkflowService as any,
    );

    const result = await automation.processStoredMessage({
      propertyId: "prop_1",
      messageId: "im_1",
      threadId: "thr_1",
      receivedAtIso: "2026-02-28T18:00:00.000Z",
      documentIds: ["doc_other"],
    });

    expect(result).toBeNull();
    expect(closingWorkflowService.applyAltaDetection).not.toHaveBeenCalled();
  });

  it("skips low-confidence detections", async () => {
    documentStore.findById.mockResolvedValue({
      id: "doc_alta",
      property_id: "prop_1",
      filename: "alta.pdf",
      file_path: "data/intake-pdfs/alta.pdf",
      mime_type: "application/pdf",
    });
    vi.mocked(detectClosingAltaDocument).mockResolvedValue({
      classification: {
        is_alta_document: true,
        document_type: "alta_statement",
        confidence: 0.61,
      },
      metadata: {
        filename: "alta.pdf",
        mime_type: "application/pdf",
        bytes: 3,
        extracted_at_iso: "2026-02-28T18:00:00.000Z",
        openai_model: "gpt-4.1",
      },
      summary: "Possible ALTA statement.",
      warnings: [],
    });

    const automation = new ClosingInboxAutomation(
      documentStore as any,
      closingWorkflowService as any,
    );

    const result = await automation.processStoredMessage({
      propertyId: "prop_1",
      messageId: "im_1",
      threadId: "thr_1",
      receivedAtIso: "2026-02-28T18:00:00.000Z",
      documentIds: ["doc_alta"],
    });

    expect(result).toBeNull();
    expect(closingWorkflowService.applyAltaDetection).not.toHaveBeenCalled();
  });
});
