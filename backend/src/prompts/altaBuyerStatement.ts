type BuildAltaBuyerStatementPromptArgs = {
  filename: string;
  receivedAtIso?: string | null;
};

export function buildAltaBuyerStatementPrompt(
  args: BuildAltaBuyerStatementPromptArgs,
): string {
  return [
    "You are reviewing a PDF attachment from a real-estate transaction workflow.",
    "Your first job is classification: determine whether the PDF is an ALTA Settlement Statement for the buyer.",
    "Only treat the document as alta_settlement_statement_buyer when explicit signals support it, such as:",
    '- the phrase "ALTA Settlement Statement"',
    '- a buyer label or buyer-focused debit/credit section',
    "- settlement/title company formatting and buyer-oriented due from or due to buyer totals",
    'If the PDF is not clearly a buyer ALTA statement, return document_type "other", set is_alta_buyer_statement to false, set statement and money to null, and explain the reason in warnings.',
    "If it is a buyer ALTA statement, extract only explicit core settlement fields. Use null for anything not explicit.",
    "Normalize settlement_date and disbursement_date to YYYY-MM-DD when parseable.",
    "Normalize printed_at_iso to a full ISO timestamp only when the date and time are explicit enough; otherwise null.",
    "Normalize currency values to numbers without currency symbols or commas.",
    "If there are multiple deposit lines, sum them into deposits_total only when those lines are explicit in the document.",
    "Do not fabricate parties, fees, line items, or totals.",
    "",
    "Attachment context:",
    JSON.stringify(
      {
        filename: args.filename,
        received_at_iso: args.receivedAtIso || null,
      },
      null,
      2,
    ),
  ].join("\n");
}
