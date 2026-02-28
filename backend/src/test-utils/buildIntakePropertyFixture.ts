import { ParsedPurchaseContract } from "../schemas/parsedPurchaseContract.schema";
import { StoredDocument } from "../services/documentStore";
import { StoredPropertyRecord } from "../types/property";

type BuildIntakePropertyFixtureArgs = {
  propertyId?: string;
  propertyEmail?: string;
  propertyName?: string;
  documentId?: string;
  documentFilename?: string;
  docHash?: string;
};

export function buildIntakePropertyFixture(
  args: BuildIntakePropertyFixtureArgs = {},
): {
  property: StoredPropertyRecord;
  document: StoredDocument;
} {
  const docHash = args.docHash || "fixture-doc-hash-1";
  const parsedContract: ParsedPurchaseContract = {
    metadata: {
      doc_hash: docHash,
      filename: args.documentFilename || "purchase-contract.pdf",
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
      address_full: "6119 W Montauk Ln Highland Utah Utah, Zip 84003",
      city: "Highland",
      state: "Utah",
      zip: "84003",
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
      purchase_price: 590075,
      earnest_money: {
        amount: 7500,
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

  const property: StoredPropertyRecord = {
    id: args.propertyId || "prop_fixture_1",
    property_name: args.propertyName || "6119 W Montauk Ln",
    property_email:
      args.propertyEmail || "6119-w-montauk-ln@bronaaelda.resend.app",
    created_at_iso: "2026-02-28T00:00:00.000Z",
    updated_at_iso: "2026-02-28T00:00:00.000Z",
    parsed_contract: parsedContract,
  };

  const document: StoredDocument = {
    id: args.documentId || "doc_fixture_1",
    property_id: property.id,
    filename: args.documentFilename || "purchase-contract.pdf",
    file_path: "data/intake-pdfs/purchase-contract.pdf",
    mime_type: "application/pdf",
    size_bytes: 1024,
    doc_hash: docHash,
    source: "email_intake",
    ai_summary: null,
    created_at: "2026-02-28T00:00:00.000Z",
  };

  return { property, document };
}
