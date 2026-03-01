export type EarnestInboundSignalExtraction = {
  earnest_signal:
    | "none"
    | "wire_instructions_provided"
    | "earnest_received_confirmation";
  suggested_user_action:
    | "none"
    | "confirm_earnest_complete";
  confidence: number;
  reason: string;
  warnings: string[];
};

export const earnestInboundSignalSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "earnest_signal",
    "suggested_user_action",
    "confidence",
    "reason",
    "warnings",
  ],
  properties: {
    earnest_signal: {
      type: "string",
      enum: [
        "none",
        "wire_instructions_provided",
        "earnest_received_confirmation",
      ],
    },
    suggested_user_action: {
      type: "string",
      enum: ["none", "confirm_earnest_complete"],
    },
    confidence: {
      type: "number",
      minimum: 0,
      maximum: 1,
    },
    reason: {
      type: "string",
    },
    warnings: {
      type: "array",
      items: {
        type: "string",
      },
    },
  },
} as const;
