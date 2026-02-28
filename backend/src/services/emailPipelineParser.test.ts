import { beforeEach, describe, expect, it, vi } from "vitest";

import { parseEmailPipeline } from "./emailPipelineParser";
import { requestStructuredJson } from "./openaiStructuredOutput";

vi.mock("./openaiStructuredOutput", () => ({
  requestStructuredJson: vi.fn(),
}));

function buildBaseResult() {
  return {
    summary: "Wire instructions were sent and the buyer needs to submit the deposit today.",
    primary_stage: "earnest_money_deposit" as const,
    substage: null,
    urgency: "high" as const,
    confidence: 0.93,
    key_facts: {
      dates: [
        {
          label: "Deposit due",
          iso_date: "2026-03-01",
          raw_text: "March 1, 2026",
        },
      ],
      people: [
        {
          role: "buyer",
          name: "Buyer One",
        },
      ],
      actions: [
        {
          action: "Send earnest money wire",
          owner_role: "buyer" as const,
          due_date: "2026-03-01",
        },
      ],
      money: [
        {
          label: "Earnest money",
          amount: 10000,
          raw_text: "$10,000",
        },
      ],
    },
    warnings: [],
  };
}

describe("parseEmailPipeline", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns a fallback result when the email body is empty", async () => {
    const result = await parseEmailPipeline({
      subject: "Quick note",
      from: "agent@example.com",
      text_body: "  ",
    });

    expect(result.primary_stage).toBe("unknown");
    expect(result.warnings).toContain("Email body is empty or nearly empty.");
    expect(vi.mocked(requestStructuredJson)).not.toHaveBeenCalled();
  });

  it("classifies an earnest money email", async () => {
    vi.mocked(requestStructuredJson).mockResolvedValue(buildBaseResult());

    const result = await parseEmailPipeline({
      subject: "Earnest money receipt",
      from: "escrow@example.com",
      received_at_iso: "2026-02-28T15:00:00Z",
      text_body: "We received the earnest money deposit.",
    });

    expect(result.primary_stage).toBe("earnest_money_deposit");
    expect(result.urgency).toBe("high");
    expect(result.key_facts.money[0].amount).toBe(10000);
  });

  it("classifies financing appraisal emails and strips html bodies", async () => {
    vi.mocked(requestStructuredJson).mockResolvedValue({
      ...buildBaseResult(),
      primary_stage: "financing_period",
      substage: "appraisal",
      urgency: "medium",
      summary: "The lender ordered the appraisal and is waiting on the report.",
    });

    await parseEmailPipeline({
      subject: "Appraisal ordered",
      from: "lender@example.com",
      html_body:
        "<div>The appraisal was ordered.<br/>Report expected by 10/29/2025.</div>",
    });

    expect(vi.mocked(requestStructuredJson)).toHaveBeenCalledTimes(1);
    const requestArgs = vi.mocked(requestStructuredJson).mock.calls[0][0];
    expect(String(requestArgs.input)).toContain("The appraisal was ordered.");
    expect(String(requestArgs.input)).toContain("Report expected by 10/29/2025.");
  });

  it("adds ambiguity and date-normalization warnings", async () => {
    vi.mocked(requestStructuredJson).mockResolvedValue({
      ...buildBaseResult(),
      primary_stage: "unknown",
      key_facts: {
        ...buildBaseResult().key_facts,
        dates: [
          {
            label: "Close of escrow",
            iso_date: null,
            raw_text: "next Thursday afternoon",
          },
        ],
      },
      warnings: [],
    });

    const result = await parseEmailPipeline({
      subject: "Status update",
      from: "agent@example.com",
      text_body: "We may need to close next Thursday afternoon.",
    });

    expect(result.warnings).toContain("Email stage is ambiguous.");
    expect(result.warnings).toContain(
      "Could not normalize explicit date text: next Thursday afternoon",
    );
  });

  it("filters blank people and normalizes relative dates from received_at_iso", async () => {
    vi.mocked(requestStructuredJson).mockResolvedValue({
      ...buildBaseResult(),
      key_facts: {
        ...buildBaseResult().key_facts,
        dates: [
          {
            label: "Deposit received",
            iso_date: null,
            raw_text: "today",
          },
        ],
        people: [
          {
            role: "buyer",
            name: " ",
          },
          {
            role: "escrow",
            name: "Jane Closer",
          },
        ],
      },
    });

    const result = await parseEmailPipeline({
      subject: "Deposit received",
      from: "escrow@example.com",
      received_at_iso: "2026-02-28T15:00:00Z",
      text_body: "Deposit received today.",
    });

    expect(result.key_facts.dates[0].iso_date).toBe("2026-02-28");
    expect(result.key_facts.people).toEqual([
      {
        role: "escrow",
        name: "Jane Closer",
      },
    ]);
  });

  it("drops an invalid appraisal substage when the stage is not financing", async () => {
    vi.mocked(requestStructuredJson).mockResolvedValue({
      ...buildBaseResult(),
      primary_stage: "closing",
      substage: "appraisal",
    });

    const result = await parseEmailPipeline({
      subject: "Closed and funded",
      from: "title@example.com",
      text_body: "Recording is complete and funds have disbursed.",
    });

    expect(result.primary_stage).toBe("closing");
    expect(result.substage).toBeNull();
    expect(result.warnings).toContain(
      "Appraisal substage is only valid under financing_period.",
    );
  });
});
