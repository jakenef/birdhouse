export type ClosingAltaDetectorInput = {
  fileBuffer: Buffer;
  filename: string;
  mimeType: string;
  received_at_iso?: string | null;
};

export type ClosingAltaDetectorResult = {
  classification: {
    is_alta_document: boolean;
    document_type: "alta_statement" | "other";
    confidence: number;
  };
  metadata: {
    filename: string;
    mime_type: string;
    bytes: number;
    extracted_at_iso: string;
    openai_model: string;
  };
  summary: string | null;
  warnings: string[];
};

export type ClosingAltaDetectorExtraction = Pick<
  ClosingAltaDetectorResult,
  "classification" | "summary" | "warnings"
>;

export const closingAltaDetectorExtractionSchema = {
  type: "object",
  additionalProperties: false,
  required: ["classification", "summary", "warnings"],
  properties: {
    classification: {
      type: "object",
      additionalProperties: false,
      required: ["is_alta_document", "document_type", "confidence"],
      properties: {
        is_alta_document: { type: "boolean" },
        document_type: {
          type: "string",
          enum: ["alta_statement", "other"],
        },
        confidence: {
          type: "number",
          minimum: 0,
          maximum: 1,
        },
      },
    },
    summary: {
      type: ["string", "null"],
    },
    warnings: {
      type: "array",
      items: { type: "string" },
    },
  },
} as const;
