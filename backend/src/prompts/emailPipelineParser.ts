import { EmailParserInput } from "../schemas/emailPipelineParser.schema";

type BuildEmailPipelinePromptArgs = {
  email: EmailParserInput;
  normalizedBody: string;
};

export function buildEmailPipelinePrompt(
  args: BuildEmailPipelinePromptArgs,
): string {
  return [
    "You are classifying a residential real-estate transaction email for an internal operations system.",
    "Return valid JSON only.",
    "Choose exactly one primary_stage from:",
    "- earnest_money_deposit: deposit requested, receipt sent, wire/check instructions, deposit confirmation",
    "- due_diligence: inspections, objection deadlines, repair negotiations, document review, contingency activity",
    "- financing_period: underwriting, conditional approval, loan docs in progress, appraisal ordering/results",
    "- title_escrow: title commitment, escrow instructions, payoff coordination, HOA demands, settlement preparation",
    "- signing_date: scheduling or confirming signing or notary appointment",
    "- closing: final closing confirmation, recording, funding, keys, disbursement completion",
    "- unknown: the email does not clearly belong in one of the stages above",
    'Use substage "appraisal" only when primary_stage is "financing_period" and the email explicitly discusses appraisal.',
    "Summarize in 2 to 4 operational sentences suitable for internal transaction workflow notes.",
    "Extract only explicit facts from the email. Do not infer missing dates, owners, people, or money values.",
    "For dates, set iso_date to YYYY-MM-DD when explicit and parseable; otherwise use null and preserve the original text in raw_text.",
    "For actions, only include concrete requested or completed tasks that are explicitly stated.",
    "Set urgency high only for explicit immediate deadlines, same-day urgency, or overdue action; medium for upcoming action; low otherwise.",
    "If the email is ambiguous, choose unknown and add a warning.",
    "",
    "Normalized email payload:",
    JSON.stringify(
      {
        subject: args.email.subject,
        from: args.email.from,
        to: args.email.to || [],
        received_at_iso: args.email.received_at_iso || null,
        body: args.normalizedBody,
      },
      null,
      2,
    ),
  ].join("\n");
}
