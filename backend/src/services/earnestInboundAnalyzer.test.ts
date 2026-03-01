import { beforeEach, describe, expect, it, vi } from "vitest";

import { analyzeEarnestInboundEmail } from "./earnestInboundAnalyzer";
import { parseEmailPipeline } from "./emailPipelineParser";
import { requestStructuredJson } from "./openaiStructuredOutput";

vi.mock("./emailPipelineParser", () => ({
  parseEmailPipeline: vi.fn(),
}));

vi.mock("./openaiStructuredOutput", () => ({
  requestStructuredJson: vi.fn(),
}));

describe("analyzeEarnestInboundEmail", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("maps a wiring instructions email into an earnest confirmation prompt", async () => {
    vi.mocked(parseEmailPipeline).mockResolvedValue({
      summary: "Escrow sent secure wiring instructions for the earnest deposit.",
      primary_stage: "earnest_money_deposit",
      substage: null,
      urgency: "medium",
      confidence: 0.93,
      key_facts: { dates: [], people: [], actions: [], money: [] },
      warnings: [],
    });
    vi.mocked(requestStructuredJson).mockResolvedValue({
      earnest_signal: "wire_instructions_provided",
      suggested_user_action: "confirm_earnest_complete",
      confidence: 0.91,
      reason: "The email explicitly provides wiring instructions and says funds will be confirmed later.",
      warnings: [],
    });

    const result = await analyzeEarnestInboundEmail({
      subject: "RE: Earnest Money - 200 Promenade",
      from: "sarah@titleco.com",
      to: ["buyer@example.com"],
      received_at_iso: "2026-02-28T12:00:00.000Z",
      text_body: "Attached are the secure wiring instructions.",
    });

    expect(result.pipeline_label).toBe("earnest_money");
    expect(result.earnest_signal).toBe("wire_instructions_provided");
    expect(result.suggested_user_action).toBe("confirm_earnest_complete");
    expect(result.summary).toContain("wiring instructions");
  });

  it("maps a receipt confirmation email into an earnest completion prompt", async () => {
    vi.mocked(parseEmailPipeline).mockResolvedValue({
      summary: "Escrow confirmed the earnest money deposit has been received.",
      primary_stage: "earnest_money_deposit",
      substage: null,
      urgency: "low",
      confidence: 0.95,
      key_facts: { dates: [], people: [], actions: [], money: [] },
      warnings: [],
    });
    vi.mocked(requestStructuredJson).mockResolvedValue({
      earnest_signal: "earnest_received_confirmation",
      suggested_user_action: "confirm_earnest_complete",
      confidence: 0.97,
      reason: "The email says the earnest money deposit was received and the buyer is all set.",
      warnings: [],
    });

    const result = await analyzeEarnestInboundEmail({
      subject: "Earnest Money Received - 200 Promenade",
      from: "sarah@titleco.com",
      to: ["buyer@example.com"],
      received_at_iso: "2026-02-28T12:00:00.000Z",
      text_body: "We have received the $5,000 earnest money deposit.",
    });

    expect(result.pipeline_label).toBe("earnest_money");
    expect(result.earnest_signal).toBe("earnest_received_confirmation");
    expect(result.suggested_user_action).toBe("confirm_earnest_complete");
  });

  it("returns no earnest signal for non-earnest emails", async () => {
    vi.mocked(parseEmailPipeline).mockResolvedValue({
      summary: "The lender requested updated pay stubs.",
      primary_stage: "financing_period",
      substage: null,
      urgency: "medium",
      confidence: 0.9,
      key_facts: { dates: [], people: [], actions: [], money: [] },
      warnings: [],
    });

    const result = await analyzeEarnestInboundEmail({
      subject: "Updated lender docs",
      from: "loan@example.com",
      to: ["buyer@example.com"],
      received_at_iso: "2026-02-28T12:00:00.000Z",
      text_body: "Please upload your most recent pay stubs.",
    });

    expect(result.pipeline_label).toBe("financing");
    expect(result.earnest_signal).toBe("none");
    expect(result.suggested_user_action).toBe("none");
    expect(requestStructuredJson).not.toHaveBeenCalled();
  });

  it("preserves a low-confidence earnest result without promoting it", async () => {
    vi.mocked(parseEmailPipeline).mockResolvedValue({
      summary: "Escrow may be discussing earnest logistics.",
      primary_stage: "earnest_money_deposit",
      substage: null,
      urgency: "low",
      confidence: 0.7,
      key_facts: { dates: [], people: [], actions: [], money: [] },
      warnings: ["Email stage is ambiguous."],
    });
    vi.mocked(requestStructuredJson).mockResolvedValue({
      earnest_signal: "wire_instructions_provided",
      suggested_user_action: "confirm_earnest_complete",
      confidence: 0.55,
      reason: "The email hints at sending funds but does not clearly provide instructions.",
      warnings: ["Signal confidence is low."],
    });

    const result = await analyzeEarnestInboundEmail({
      subject: "Earnest follow-up",
      from: "escrow@example.com",
      to: ["buyer@example.com"],
      received_at_iso: "2026-02-28T12:00:00.000Z",
      text_body: "Let me know once this is handled.",
    });

    expect(result.confidence).toBe(0.55);
    expect(result.warnings).toContain("Signal confidence is low.");
    expect(result.suggested_user_action).toBe("confirm_earnest_complete");
  });
});
