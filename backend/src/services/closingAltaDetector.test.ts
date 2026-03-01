import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ClosingAltaDetectorError,
  detectClosingAltaDocument,
} from "./closingAltaDetector";
import { requestStructuredJson, withUploadedPdf } from "./openaiStructuredOutput";

vi.mock("./openaiStructuredOutput", () => ({
  requestStructuredJson: vi.fn(),
  withUploadedPdf: vi.fn(),
}));

describe("detectClosingAltaDocument", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(withUploadedPdf).mockImplementation(async (args) =>
      args.run({
        client: {
          responses: { create: vi.fn() },
          files: { create: vi.fn(), delete: vi.fn() },
        },
        model: "gpt-4.1",
        fileId: "file_123",
        bytes: 3210,
      }),
    );
  });

  it("returns parsed ALTA detection data", async () => {
    vi.mocked(requestStructuredJson).mockResolvedValue({
      classification: {
        is_alta_document: true,
        document_type: "alta_statement" as const,
        confidence: 0.96,
      },
      summary: "ALTA closing statement detected for the transaction.",
      warnings: [],
    });

    const result = await detectClosingAltaDocument({
      fileBuffer: Buffer.from("pdf"),
      filename: "alta.pdf",
      mimeType: "application/pdf",
    });

    expect(result.classification.document_type).toBe("alta_statement");
    expect(result.metadata.filename).toBe("alta.pdf");
    expect(result.metadata.openai_model).toBe("gpt-4.1");
    expect(result.summary).toContain("ALTA");
  });

  it("normalizes non-matching documents to other", async () => {
    vi.mocked(requestStructuredJson).mockResolvedValue({
      classification: {
        is_alta_document: false,
        document_type: "other" as const,
        confidence: 0.41,
      },
      summary: null,
      warnings: ["No explicit ALTA indicators found."],
    });

    const result = await detectClosingAltaDocument({
      fileBuffer: Buffer.from("pdf"),
      filename: "other.pdf",
      mimeType: "application/pdf",
    });

    expect(result.classification.document_type).toBe("other");
    expect(result.summary).toBeNull();
    expect(result.warnings).toContain(
      "Document was not classified as an ALTA closing statement.",
    );
  });

  it("rejects non-pdf inputs", async () => {
    await expect(
      detectClosingAltaDocument({
        fileBuffer: Buffer.from("txt"),
        filename: "note.txt",
        mimeType: "text/plain",
      }),
    ).rejects.toBeInstanceOf(ClosingAltaDetectorError);
  });

  it("surfaces structured output failures", async () => {
    vi.mocked(requestStructuredJson).mockRejectedValue(new Error("bad json"));

    await expect(
      detectClosingAltaDocument({
        fileBuffer: Buffer.from("pdf"),
        filename: "alta.pdf",
        mimeType: "application/pdf",
      }),
    ).rejects.toThrow("bad json");
  });
});
