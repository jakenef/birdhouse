export type EmailPipelineStage =
  | "earnest_money_deposit"
  | "due_diligence"
  | "financing_period"
  | "title_escrow"
  | "signing_date"
  | "closing"
  | "unknown";

export type EmailPipelineSubstage = "appraisal" | null;

export type EmailActionOwnerRole =
  | "agent"
  | "buyer"
  | "seller"
  | "lender"
  | "escrow"
  | "title"
  | "unknown";

export type EmailParserInput = {
  subject: string;
  from: string;
  to?: string[];
  received_at_iso?: string | null;
  text_body?: string | null;
  html_body?: string | null;
};

export type EmailParserResult = {
  summary: string;
  primary_stage: EmailPipelineStage;
  substage: EmailPipelineSubstage;
  urgency: "high" | "medium" | "low";
  confidence: number;
  key_facts: {
    dates: Array<{
      label: string;
      iso_date: string | null;
      raw_text: string;
    }>;
    people: Array<{
      role: string;
      name: string;
    }>;
    actions: Array<{
      action: string;
      owner_role: EmailActionOwnerRole;
      due_date: string | null;
    }>;
    money: Array<{
      label: string;
      amount: number | null;
      raw_text: string;
    }>;
  };
  warnings: string[];
};

export const emailPipelineParserSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "summary",
    "primary_stage",
    "substage",
    "urgency",
    "confidence",
    "key_facts",
    "warnings",
  ],
  properties: {
    summary: { type: "string" },
    primary_stage: {
      type: "string",
      enum: [
        "earnest_money_deposit",
        "due_diligence",
        "financing_period",
        "title_escrow",
        "signing_date",
        "closing",
        "unknown",
      ],
    },
    substage: {
      type: ["string", "null"],
      enum: ["appraisal", null],
    },
    urgency: {
      type: "string",
      enum: ["high", "medium", "low"],
    },
    confidence: {
      type: "number",
      minimum: 0,
      maximum: 1,
    },
    key_facts: {
      type: "object",
      additionalProperties: false,
      required: ["dates", "people", "actions", "money"],
      properties: {
        dates: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["label", "iso_date", "raw_text"],
            properties: {
              label: { type: "string" },
              iso_date: { type: ["string", "null"] },
              raw_text: { type: "string" },
            },
          },
        },
        people: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["role", "name"],
            properties: {
              role: { type: "string" },
              name: { type: "string" },
            },
          },
        },
        actions: {
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
                  "unknown",
                ],
              },
              due_date: { type: ["string", "null"] },
            },
          },
        },
        money: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["label", "amount", "raw_text"],
            properties: {
              label: { type: "string" },
              amount: { type: ["number", "null"] },
              raw_text: { type: "string" },
            },
          },
        },
      },
    },
    warnings: {
      type: "array",
      items: { type: "string" },
    },
  },
} as const;
