import { beforeEach, describe, expect, it, vi } from "vitest";

import { generateEarnestDraft } from "./earnestDraftGenerator";
import { requestStructuredJson } from "./openaiStructuredOutput";

vi.mock("./openaiStructuredOutput", () => ({
  requestStructuredJson: vi.fn(),
}));

describe("generateEarnestDraft", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.OPENAI_MODEL = "gpt-4.1";
  });

  it("returns short draft content in the requested style", async () => {
    vi.mocked(requestStructuredJson).mockResolvedValue({
      subject: "Earnest Money - 200 Promenade",
      body: [
        "Hi Sarah,",
        "",
        "Per the executed purchase agreement for 200 Promenade, the earnest money deposit is $5,000 due by March 5th.",
        "Attached is the purchase contract. Could you please provide wiring instructions?",
        "",
        "Thank you,",
        "John Smith",
      ].join("\n"),
      generation_reason: "Simple earnest kickoff email to escrow.",
    });

    const result = await generateEarnestDraft({
      property_id: "prop_1",
      property_name: "200 Promenade",
      property_email: "200-promenade@demo.test",
      property_address: "200 Promenade Ln, Danville, CA 94506",
      buyer_names: ["John Smith"],
      earnest_money_amount: 5000,
      earnest_money_deadline: "2026-03-05",
      escrow_contact: {
        name: "Sarah Chen",
        email: "sarah@titleco.com",
      },
      attachment_filename: "purchase-contract.pdf",
    });

    expect(result.subject).toBe("Earnest Money - 200 Promenade");
    expect(result.body).toContain("Attached is the purchase contract.");
    expect(result.openai_model).toBe("gpt-4.1");
  });

  it("surfaces OpenAI failures", async () => {
    vi.mocked(requestStructuredJson).mockRejectedValue(new Error("bad draft"));

    await expect(
      generateEarnestDraft({
        property_id: "prop_1",
        property_name: "200 Promenade",
        property_email: "200-promenade@demo.test",
        property_address: "200 Promenade Ln, Danville, CA 94506",
        buyer_names: ["John Smith"],
        earnest_money_amount: null,
        earnest_money_deadline: null,
        escrow_contact: {
          name: "Sarah Chen",
          email: "sarah@titleco.com",
        },
        attachment_filename: "purchase-contract.pdf",
      }),
    ).rejects.toThrow("bad draft");
  });
});
