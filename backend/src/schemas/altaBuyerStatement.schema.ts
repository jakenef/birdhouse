export type AltaBuyerStatementParserInput = {
  fileBuffer: Buffer;
  filename: string;
  mimeType: string;
  received_at_iso?: string | null;
};

export type AltaBuyerStatementParserResult = {
  classification: {
    is_alta_buyer_statement: boolean;
    document_type: "alta_settlement_statement_buyer" | "other";
    confidence: number;
  };
  metadata: {
    filename: string;
    mime_type: string;
    bytes: number;
    page_count: number | null;
    extracted_at_iso: string;
    openai_model: string;
  };
  statement: {
    file_number: string | null;
    statement_status: string | null;
    title_company: string | null;
    escrow_officer: string | null;
    settlement_location: string | null;
    property_address: string | null;
    buyer_name: string | null;
    seller_name: string | null;
    lender_name: string | null;
    settlement_date: string | null;
    disbursement_date: string | null;
    printed_at_iso: string | null;
  } | null;
  money: {
    sale_price: number | null;
    deposits_total: number | null;
    loan_amount: number | null;
    subtotal_debit: number | null;
    subtotal_credit: number | null;
    due_from_buyer: number | null;
    due_to_buyer: number | null;
    total_debit: number | null;
    total_credit: number | null;
  } | null;
  warnings: string[];
};

export type AltaBuyerStatementExtraction = Pick<
  AltaBuyerStatementParserResult,
  "classification" | "statement" | "money" | "warnings"
>;

export const altaBuyerStatementExtractionSchema = {
  type: "object",
  additionalProperties: false,
  required: ["classification", "statement", "money", "warnings"],
  properties: {
    classification: {
      type: "object",
      additionalProperties: false,
      required: ["is_alta_buyer_statement", "document_type", "confidence"],
      properties: {
        is_alta_buyer_statement: { type: "boolean" },
        document_type: {
          type: "string",
          enum: ["alta_settlement_statement_buyer", "other"],
        },
        confidence: {
          type: "number",
          minimum: 0,
          maximum: 1,
        },
      },
    },
    statement: {
      anyOf: [
        { type: "null" },
        {
          type: "object",
          additionalProperties: false,
          required: [
            "file_number",
            "statement_status",
            "title_company",
            "escrow_officer",
            "settlement_location",
            "property_address",
            "buyer_name",
            "seller_name",
            "lender_name",
            "settlement_date",
            "disbursement_date",
            "printed_at_iso",
          ],
          properties: {
            file_number: { type: ["string", "null"] },
            statement_status: { type: ["string", "null"] },
            title_company: { type: ["string", "null"] },
            escrow_officer: { type: ["string", "null"] },
            settlement_location: { type: ["string", "null"] },
            property_address: { type: ["string", "null"] },
            buyer_name: { type: ["string", "null"] },
            seller_name: { type: ["string", "null"] },
            lender_name: { type: ["string", "null"] },
            settlement_date: { type: ["string", "null"] },
            disbursement_date: { type: ["string", "null"] },
            printed_at_iso: { type: ["string", "null"] },
          },
        },
      ],
    },
    money: {
      anyOf: [
        { type: "null" },
        {
          type: "object",
          additionalProperties: false,
          required: [
            "sale_price",
            "deposits_total",
            "loan_amount",
            "subtotal_debit",
            "subtotal_credit",
            "due_from_buyer",
            "due_to_buyer",
            "total_debit",
            "total_credit",
          ],
          properties: {
            sale_price: { type: ["number", "null"] },
            deposits_total: { type: ["number", "null"] },
            loan_amount: { type: ["number", "null"] },
            subtotal_debit: { type: ["number", "null"] },
            subtotal_credit: { type: ["number", "null"] },
            due_from_buyer: { type: ["number", "null"] },
            due_to_buyer: { type: ["number", "null"] },
            total_debit: { type: ["number", "null"] },
            total_credit: { type: ["number", "null"] },
          },
        },
      ],
    },
    warnings: {
      type: "array",
      items: { type: "string" },
    },
  },
} as const;
