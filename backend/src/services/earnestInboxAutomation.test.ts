import { beforeEach, describe, expect, it, vi } from "vitest";

import { EarnestInboxAutomation } from "./earnestInboxAutomation";
import { analyzeEarnestInboundEmail } from "./earnestInboundAnalyzer";

vi.mock("./earnestInboundAnalyzer", () => ({
  analyzeEarnestInboundEmail: vi.fn(),
}));

describe("EarnestInboxAutomation", () => {
  const inboxStore = {
    updateAnalysis: vi.fn(),
  };
  const earnestWorkflowService = {
    applyInboxAnalysis: vi.fn(),
  };

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("analyzes and applies actionable inbound earnest emails", async () => {
    vi.mocked(analyzeEarnestInboundEmail).mockResolvedValue({
      version: 1,
      pipeline_label: "earnest_money",
      summary: "Escrow sent wiring instructions.",
      confidence: 0.9,
      reason: "The email explicitly provides wiring instructions.",
      earnest_signal: "wire_instructions_provided",
      suggested_user_action: "confirm_wire_sent",
      warnings: [],
      analyzed_at_iso: "2026-02-28T12:00:00.000Z",
    });

    const automation = new EarnestInboxAutomation(
      inboxStore as any,
      earnestWorkflowService as any,
    );

    await automation.processStoredMessage({
      id: "im_1",
      property_id: "prop_1",
      thread_id: "thr_1",
      direction: "inbound",
      from_email: "escrow@example.com",
      from_name: "Sarah",
      to: [{ email: "prop@demo.test", name: null }],
      cc: [],
      bcc: [],
      subject: "RE: Earnest Money",
      body_text: "Attached are the secure wiring instructions.",
      body_html: null,
      resend_email_id: "resend_in_1",
      message_id: "<inbound@example.com>",
      in_reply_to: null,
      references: [],
      has_attachments: true,
      read: false,
      sent_at: "2026-02-28T12:00:00.000Z",
      read_at: null,
      created_at: "2026-02-28T12:00:00.000Z",
      analysis: null,
    });

    expect(inboxStore.updateAnalysis).toHaveBeenCalledWith(
      "im_1",
      expect.objectContaining({
        earnest_signal: "wire_instructions_provided",
      }),
    );
    expect(earnestWorkflowService.applyInboxAnalysis).toHaveBeenCalledWith(
      "prop_1",
      "im_1",
      "thr_1",
      expect.objectContaining({
        suggested_user_action: "confirm_wire_sent",
      }),
    );
  });

  it("skips outbound messages and already analyzed messages", async () => {
    const automation = new EarnestInboxAutomation(
      inboxStore as any,
      earnestWorkflowService as any,
    );

    await automation.processStoredMessage({
      id: "im_2",
      property_id: "prop_1",
      thread_id: "thr_1",
      direction: "outbound",
      from_email: "prop@demo.test",
      from_name: null,
      to: [],
      cc: [],
      bcc: [],
      subject: "Earnest Money",
      body_text: "Original send",
      body_html: null,
      resend_email_id: "resend_out_1",
      message_id: null,
      in_reply_to: null,
      references: [],
      has_attachments: false,
      read: true,
      sent_at: "2026-02-28T12:00:00.000Z",
      read_at: "2026-02-28T12:00:00.000Z",
      created_at: "2026-02-28T12:00:00.000Z",
      analysis: null,
    });

    await automation.processStoredMessage({
      id: "im_3",
      property_id: "prop_1",
      thread_id: "thr_1",
      direction: "inbound",
      from_email: "escrow@example.com",
      from_name: "Sarah",
      to: [],
      cc: [],
      bcc: [],
      subject: "Earnest Money",
      body_text: "Already analyzed",
      body_html: null,
      resend_email_id: "resend_in_2",
      message_id: null,
      in_reply_to: null,
      references: [],
      has_attachments: false,
      read: false,
      sent_at: "2026-02-28T12:00:00.000Z",
      read_at: null,
      created_at: "2026-02-28T12:00:00.000Z",
      analysis: {
        version: 1,
        pipeline_label: "earnest_money",
        summary: "Already analyzed.",
        confidence: 0.9,
        reason: "existing",
        earnest_signal: "wire_instructions_provided",
        suggested_user_action: "confirm_wire_sent",
        warnings: [],
        analyzed_at_iso: "2026-02-28T12:00:00.000Z",
      },
    });

    expect(analyzeEarnestInboundEmail).not.toHaveBeenCalled();
    expect(inboxStore.updateAnalysis).not.toHaveBeenCalled();
  });
});
