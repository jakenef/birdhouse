import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  AltaBuyerStatementParserError,
  parseAltaBuyerStatement,
} from "./altaBuyerStatementParser";
import { requestStructuredJson, withUploadedPdf } from "./openaiStructuredOutput";

vi.mock("./openaiStructuredOutput", () => ({
  requestStructuredJson: vi.fn(),
  withUploadedPdf: vi.fn(),
}));

function buildBaseExtraction() {
  return {
    classification: {
      is_alta_buyer_statement: true,
      document_type: "alta_settlement_statement_buyer" as const,
      confidence: 0.97,
    },
    statement: {
      file_number: "0718-7324069",
      statement_status: "Final Settlement Statement",
      title_company: "First American Title Company",
      escrow_officer: "Anne DeGrano/JV",
      settlement_location: "630 San Ramon Valley Blvd, Ste. 120, Danville, CA 94526",
      property_address: "200 Promenade Ln, Danville, CA 94506",
      buyer_name: "Point Green Home Solutions, LLC",
      seller_name: "The Jay Meiseles Family Trust",
      lender_name: "Kundan Ventures LLC",
      settlement_date: "2025-10-29",
      disbursement_date: "2025-10-29",
      printed_at_iso: "2025-10-29T12:31:00.000Z",
    },
    money: {
      sale_price: 950000,
      deposits_total: 112426.14,
      loan_amount: 855000,
      subtotal_debit: 967172.14,
      subtotal_credit: 967426.14,
      due_from_buyer: null,
      due_to_buyer: 254,
      total_debit: 967426.14,
      total_credit: 967426.14,
    },
    warnings: [],
  };
}

describe("parseAltaBuyerStatement", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(withUploadedPdf).mockImplementation(async (args) =>
      args.run({
        client: {
          responses: {
            create: vi.fn(),
          },
          files: {
            create: vi.fn(),
            delete: vi.fn(),
          },
        },
        model: "gpt-4.1",
        fileId: "file_123",
        bytes: 3210,
      }),
    );
  });

  it("returns parsed ALTA buyer statement data", async () => {
    vi.mocked(requestStructuredJson).mockResolvedValue(buildBaseExtraction());

    const result = await parseAltaBuyerStatement({
      fileBuffer: Buffer.from("pdf"),
      filename: "alta.pdf",
      mimeType: "application/pdf",
    });

    expect(result.classification.document_type).toBe("alta_settlement_statement_buyer");
    expect(result.metadata.filename).toBe("alta.pdf");
    expect(result.metadata.openai_model).toBe("gpt-4.1");
    expect(result.money?.deposits_total).toBe(112426.14);
  });

  it("normalizes non-matching documents to other and null extraction payloads", async () => {
    vi.mocked(requestStructuredJson).mockResolvedValue({
      ...buildBaseExtraction(),
      classification: {
        is_alta_buyer_statement: false,
        document_type: "other" as const,
        confidence: 0.66,
      },
      warnings: ["No ALTA buyer indicators found."],
    });

    const result = await parseAltaBuyerStatement({
      fileBuffer: Buffer.from("pdf"),
      filename: "other.pdf",
      mimeType: "application/pdf",
    });

    expect(result.classification.document_type).toBe("other");
    expect(result.statement).toBeNull();
    expect(result.money).toBeNull();
    expect(result.warnings).toContain("No ALTA buyer indicators found.");
    expect(result.warnings).toContain(
      "Document was not classified as an ALTA Settlement Statement - Buyer.",
    );
  });

  it("rejects non-pdf inputs", async () => {
    await expect(
      parseAltaBuyerStatement({
        fileBuffer: Buffer.from("not-a-pdf"),
        filename: "note.txt",
        mimeType: "text/plain",
      }),
    ).rejects.toBeInstanceOf(AltaBuyerStatementParserError);
  });

  it("surfaces structured output failures", async () => {
    vi.mocked(requestStructuredJson).mockRejectedValue(new Error("bad json"));

    await expect(
      parseAltaBuyerStatement({
        fileBuffer: Buffer.from("pdf"),
        filename: "alta.pdf",
        mimeType: "application/pdf",
      }),
    ).rejects.toThrow("bad json");
  });
});
