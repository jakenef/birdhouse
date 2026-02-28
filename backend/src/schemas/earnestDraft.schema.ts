export type EarnestDraftResult = {
  subject: string;
  body: string;
  generation_reason: string;
};

export const earnestDraftSchema = {
  type: "object",
  additionalProperties: false,
  required: ["subject", "body", "generation_reason"],
  properties: {
    subject: { type: "string" },
    body: { type: "string" },
    generation_reason: { type: "string" },
  },
} as const;
