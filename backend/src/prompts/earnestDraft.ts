type EarnestDraftPromptContext = {
  property_name: string;
  property_address: string | null;
  buyer_names: string[];
  earnest_money_amount: number | null;
  earnest_money_deadline: string | null;
  escrow_contact_name: string;
  attachment_filename: string;
};

export function buildEarnestDraftPrompt(
  context: EarnestDraftPromptContext,
): string {
  return [
    "You are drafting a very short buyer-side earnest money email to escrow/title.",
    "Return valid JSON only.",
    "Write in the style of this example:",
    'Subject: Earnest Money - 200 Promenade',
    "Hi Sarah,",
    "Per the executed purchase agreement for 200 Promenade, the earnest money deposit is $5,000 due by March 5th.",
    "Attached is the purchase contract. Could you please provide wiring instructions? I will initiate the transfer today.",
    "Thank you,",
    "John Smith",
    "",
    "Requirements:",
    "- Keep it short and plain.",
    "- Use the escrow contact name in the greeting.",
    "- Mention the executed purchase agreement.",
    "- Mention earnest amount if present.",
    "- Mention earnest due date if present.",
    "- Mention that the purchase contract is attached.",
    "- Ask for wiring instructions or the next earnest money step.",
    "- Use buyer names from context for the signoff when present.",
    "- Do not invent any facts.",
    "- Do not add legal analysis or generic transaction boilerplate.",
    "",
    "Context:",
    JSON.stringify(context, null, 2),
  ].join("\n");
}
