import { buildEarnestDraftPrompt } from "../prompts/earnestDraft";
import {
  EarnestDraftResult,
  earnestDraftSchema,
} from "../schemas/earnestDraft.schema";
import { requestStructuredJson } from "./openaiStructuredOutput";

const defaultTimeoutMs = Number(process.env.REQUEST_TIMEOUT_MS || "60000");

export type EarnestDraftContext = {
  property_id: string;
  property_name: string;
  property_email: string;
  property_address: string | null;
  buyer_names: string[];
  earnest_money_amount: number | null;
  earnest_money_deadline: string | null;
  escrow_contact: {
    name: string;
    email: string;
    company?: string;
  };
  attachment_filename: string;
};

export async function generateEarnestDraft(
  context: EarnestDraftContext,
  options?: { timeoutMs?: number },
): Promise<EarnestDraftResult & { openai_model: string }> {
  const result = await requestStructuredJson<EarnestDraftResult>({
    input: buildEarnestDraftPrompt({
      property_name: context.property_name,
      property_address: context.property_address,
      buyer_names: context.buyer_names,
      earnest_money_amount: context.earnest_money_amount,
      earnest_money_deadline: context.earnest_money_deadline,
      escrow_contact_name: context.escrow_contact.name,
      attachment_filename: context.attachment_filename,
    }),
    schemaName: "earnest_draft",
    schema: earnestDraftSchema,
    timeoutMs: options?.timeoutMs ?? defaultTimeoutMs,
    emptyOutputMessage: "OpenAI returned no earnest draft output.",
  });

  return {
    ...result,
    openai_model: process.env.OPENAI_MODEL as string,
  };
}
