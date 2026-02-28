import { ParsedPurchaseContract } from "../schemas/parsedPurchaseContract.schema";
import {
  requestStructuredJson,
  withUploadedPdf,
} from "./openaiStructuredOutput";

export type DocumentAiSummary = {
  title: string;
  summary: string;
  highlights: string[];
};

/**
 * Build input for OpenAI with an uploaded PDF file.
 */
function buildPdfBackedInput(fileId: string, prompt: string) {
  return [
    {
      role: "user" as const,
      content: [
        {
          type: "input_text" as const,
          text: prompt,
        },
        {
          type: "input_file" as const,
          file_id: fileId,
        },
      ],
    },
  ];
}

/**
 * Convert a purchase contract's AI summary into document AI summary format.
 */
export function extractContractSummary(
  contract: ParsedPurchaseContract,
): DocumentAiSummary {
  const highlights: string[] = [
    ...contract.summary.bullets.slice(0, 3),
    ...contract.summary.recommended_next_actions
      .slice(0, 2)
      .map((action) => action.action),
  ];

  return {
    title: "Purchase Contract and Timeline Terms",
    summary: contract.summary.one_paragraph,
    highlights: highlights.slice(0, 5), // max 5 highlights
  };
}

/**
 * Generate an AI summary for a general PDF document (not a purchase contract).
 */
export async function summarizePdf(args: {
  buffer: Buffer;
  filename: string;
  timeoutMs: number;
}): Promise<DocumentAiSummary> {
  const prompt = `You are analyzing a real estate transaction document.

Generate a concise AI summary with:
1. **title**: A short descriptive title (max 60 characters)
2. **summary**: A 2-3 sentence overview of the document's purpose and key information
3. **highlights**: 3-5 actionable bullet points highlighting critical information, deadlines, or next steps

Be specific and focus on information that would help a real estate agent manage the transaction efficiently.`;

  const jsonSchema = {
    type: "object" as const,
    additionalProperties: false,
    required: ["title", "summary", "highlights"],
    properties: {
      title: {
        type: "string" as const,
        description: "Short descriptive title for the document (max 60 chars)",
      },
      summary: {
        type: "string" as const,
        description: "2-3 sentence overview of the document",
      },
      highlights: {
        type: "array" as const,
        description:
          "3-5 actionable bullet points with critical info or next steps",
        items: { type: "string" as const },
        minItems: 3,
        maxItems: 5,
      },
    },
  };

  return withUploadedPdf({
    fileBuffer: args.buffer,
    filename: args.filename,
    mimeType: "application/pdf",
    timeoutMs: args.timeoutMs,
    async run({ client, model, fileId }) {
      return requestStructuredJson<DocumentAiSummary>({
        client,
        model,
        input: buildPdfBackedInput(fileId, prompt),
        schemaName: "document_summary",
        schema: jsonSchema,
        timeoutMs: args.timeoutMs,
        emptyOutputMessage: "OpenAI returned no document summary.",
      });
    },
  });
}
