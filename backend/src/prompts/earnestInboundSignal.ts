type BuildEarnestInboundSignalPromptArgs = {
  subject: string;
  from: string;
  to: string[];
  received_at_iso?: string | null;
  text_body?: string | null;
  html_body?: string | null;
  pipeline_summary: string;
  pipeline_confidence: number;
};

export function buildEarnestInboundSignalPrompt(
  args: BuildEarnestInboundSignalPromptArgs,
): string {
  return [
    "You are analyzing a real-estate transaction email that has already been classified into the earnest money stage.",
    "Return valid JSON only.",
    "Choose one earnest_signal:",
    "- wire_instructions_provided: the email provides wiring instructions, payment instructions, escrow trust details, or clearly tells the buyer to send earnest funds next",
    "- earnest_received_confirmation: the email explicitly confirms the earnest money or deposit has been received",
    "- none: neither of the above is explicit",
    "Choose one suggested_user_action:",
    '- confirm_earnest_complete when earnest_signal is wire_instructions_provided and the buyer should follow the instructions and then mark earnest complete',
    '- confirm_earnest_complete when earnest_signal is earnest_received_confirmation and the buyer can now confirm earnest is complete',
    "- none otherwise",
    "Do not guess. If the signal is uncertain, return none with lower confidence.",
    "The reason should be one sentence and reference the explicit email language.",
    "",
    "Existing pipeline parse context:",
    JSON.stringify(
      {
        summary: args.pipeline_summary,
        confidence: args.pipeline_confidence,
      },
      null,
      2,
    ),
    "",
    "Email payload:",
    JSON.stringify(
      {
        subject: args.subject,
        from: args.from,
        to: args.to,
        received_at_iso: args.received_at_iso || null,
        text_body: args.text_body || null,
        html_body: args.html_body || null,
      },
      null,
      2,
    ),
  ].join("\n");
}
