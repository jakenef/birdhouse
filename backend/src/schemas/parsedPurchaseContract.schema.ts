export type ParsedPurchaseContract = {
  metadata: {
    doc_hash: string;
    filename: string;
    mime_type: string;
    bytes: number;
    page_count: number;
    extracted_at_iso: string;
    source: "upload";
    model: {
      openai_model: string;
    };
    confidence: {
      overall: number;
      notes: string;
    };
  };
  parties: {
    buyers: string[];
    sellers: string[];
  };
  property: {
    address_full: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
  };
  key_dates: {
    effective_date: string | null;
    due_diligence_deadline: string | null;
    financing_deadline: string | null;
    appraisal_deadline: string | null;
    seller_disclosure_deadline: string | null;
    settlement_deadline: string | null;
    possession: {
      timing: string | null;
      hours_after_recording: number | null;
      days_after_recording: number | null;
    };
  };
  money: {
    purchase_price: number | null;
    earnest_money: {
      amount: number | null;
    };
  };
  obligations_and_risks: {
    missing_info: string[];
    time_sensitive_items: Array<{
      label: string;
      due_date: string | null;
      urgency: "high" | "medium" | "low";
      notes: string | null;
    }>;
    warnings: string[];
  };
  summary: {
    one_paragraph: string;
    bullets: string[];
    numbers_to_know: Array<{
      label: string;
      value: string;
    }>;
    recommended_next_actions: Array<{
      action: string;
      owner_role:
        | "agent"
        | "buyer"
        | "seller"
        | "lender"
        | "escrow"
        | "title"
        | "internal_ops"
        | "unknown";
      due_date: string | null;
    }>;
  };
};

export const parsedPurchaseContractSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "metadata",
    "parties",
    "property",
    "key_dates",
    "money",
    "obligations_and_risks",
    "summary",
  ],
  properties: {
    metadata: {
      type: "object",
      additionalProperties: false,
      required: [
        "doc_hash",
        "filename",
        "mime_type",
        "bytes",
        "page_count",
        "extracted_at_iso",
        "source",
        "model",
        "confidence",
      ],
      properties: {
        doc_hash: { type: "string" },
        filename: { type: "string" },
        mime_type: { type: "string" },
        bytes: { type: "number" },
        page_count: { type: "number" },
        extracted_at_iso: { type: "string" },
        source: { type: "string", enum: ["upload"] },
        model: {
          type: "object",
          additionalProperties: false,
          required: ["openai_model"],
          properties: {
            openai_model: { type: "string" },
          },
        },
        confidence: {
          type: "object",
          additionalProperties: false,
          required: ["overall", "notes"],
          properties: {
            overall: { type: "number", minimum: 0, maximum: 1 },
            notes: { type: "string" },
          },
        },
      },
    },
    parties: {
      type: "object",
      additionalProperties: false,
      required: ["buyers", "sellers"],
      properties: {
        buyers: {
          type: "array",
          items: { type: "string" },
        },
        sellers: {
          type: "array",
          items: { type: "string" },
        },
      },
    },
    property: {
      type: "object",
      additionalProperties: false,
      required: ["address_full", "city", "state", "zip"],
      properties: {
        address_full: { type: ["string", "null"] },
        city: { type: ["string", "null"] },
        state: { type: ["string", "null"] },
        zip: { type: ["string", "null"] },
      },
    },
    key_dates: {
      type: "object",
      additionalProperties: false,
      required: [
        "effective_date",
        "due_diligence_deadline",
        "financing_deadline",
        "appraisal_deadline",
        "seller_disclosure_deadline",
        "settlement_deadline",
        "possession",
      ],
      properties: {
        effective_date: { type: ["string", "null"] },
        due_diligence_deadline: { type: ["string", "null"] },
        financing_deadline: { type: ["string", "null"] },
        appraisal_deadline: { type: ["string", "null"] },
        seller_disclosure_deadline: { type: ["string", "null"] },
        settlement_deadline: { type: ["string", "null"] },
        possession: {
          type: "object",
          additionalProperties: false,
          required: ["timing", "hours_after_recording", "days_after_recording"],
          properties: {
            timing: { type: ["string", "null"] },
            hours_after_recording: { type: ["number", "null"] },
            days_after_recording: { type: ["number", "null"] },
          },
        },
      },
    },
    money: {
      type: "object",
      additionalProperties: false,
      required: ["purchase_price", "earnest_money"],
      properties: {
        purchase_price: { type: ["number", "null"] },
        earnest_money: {
          type: "object",
          additionalProperties: false,
          required: ["amount"],
          properties: {
            amount: { type: ["number", "null"] },
          },
        },
      },
    },
    obligations_and_risks: {
      type: "object",
      additionalProperties: false,
      required: ["missing_info", "time_sensitive_items", "warnings"],
      properties: {
        missing_info: {
          type: "array",
          items: { type: "string" },
        },
        time_sensitive_items: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["label", "due_date", "urgency", "notes"],
            properties: {
              label: { type: "string" },
              due_date: { type: ["string", "null"] },
              urgency: {
                type: "string",
                enum: ["high", "medium", "low"],
              },
              notes: { type: ["string", "null"] },
            },
          },
        },
        warnings: {
          type: "array",
          items: { type: "string" },
        },
      },
    },
    summary: {
      type: "object",
      additionalProperties: false,
      required: [
        "one_paragraph",
        "bullets",
        "numbers_to_know",
        "recommended_next_actions",
      ],
      properties: {
        one_paragraph: { type: "string" },
        bullets: {
          type: "array",
          items: { type: "string" },
          minItems: 5,
          maxItems: 10,
        },
        numbers_to_know: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["label", "value"],
            properties: {
              label: { type: "string" },
              value: { type: "string" },
            },
          },
        },
        recommended_next_actions: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["action", "owner_role", "due_date"],
            properties: {
              action: { type: "string" },
              owner_role: {
                type: "string",
                enum: [
                  "agent",
                  "buyer",
                  "seller",
                  "lender",
                  "escrow",
                  "title",
                  "internal_ops",
                  "unknown",
                ],
              },
              due_date: { type: ["string", "null"] },
            },
          },
        },
      },
    },
  },
} as const;
