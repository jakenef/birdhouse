type BuildClosingAltaDetectorPromptArgs = {
  filename: string;
  receivedAtIso?: string | null;
};

export function buildClosingAltaDetectorPrompt(
  args: BuildClosingAltaDetectorPromptArgs,
): string {
  return [
    "You are reviewing a PDF attachment from a real-estate transaction inbox.",
    "Determine whether the document is an ALTA closing statement or ALTA settlement statement.",
    'Treat the document as "alta_statement" only when explicit signals support it, such as:',
    '- the phrase "ALTA Settlement Statement"',
    "- settlement statement / closing statement formatting",
    "- title or escrow company closing-document layout",
    "- buyer or seller debit/credit closing statement sections",
    'If it is not clearly an ALTA closing/settlement statement, return document_type "other", set is_alta_document to false, and explain why in warnings.',
    "Do not require buyer-versus-seller distinction for this task.",
    "Do not fabricate totals, parties, dates, or line items.",
    "If classified as an ALTA statement, provide a short operational summary suitable for an internal closing workflow.",
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
