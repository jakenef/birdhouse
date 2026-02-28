import { buildAltaBuyerStatementPrompt } from "../prompts/altaBuyerStatement";
import {
  AltaBuyerStatementExtraction,
  AltaBuyerStatementParserInput,
  AltaBuyerStatementParserResult,
  altaBuyerStatementExtractionSchema,
} from "../schemas/altaBuyerStatement.schema";
import { requestStructuredJson, withUploadedPdf } from "./openaiStructuredOutput";

const defaultTimeoutMs = Number(process.env.REQUEST_TIMEOUT_MS || "60000");

export class AltaBuyerStatementParserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AltaBuyerStatementParserError";
  }
}

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

function normalizeExtraction(
  extraction: AltaBuyerStatementExtraction,
): AltaBuyerStatementExtraction {
  const warnings = [...extraction.warnings];
  const isBuyerStatement =
    extraction.classification.is_alta_buyer_statement &&
    extraction.classification.document_type === "alta_settlement_statement_buyer";

  if (!isBuyerStatement) {
    if (
      !warnings.includes(
        "Document was not classified as an ALTA Settlement Statement - Buyer.",
      )
    ) {
      warnings.push(
        "Document was not classified as an ALTA Settlement Statement - Buyer.",
      );
    }

    return {
      classification: {
        is_alta_buyer_statement: false,
        document_type: "other",
        confidence: extraction.classification.confidence,
      },
      statement: null,
      money: null,
      warnings,
    };
  }

  return {
    ...extraction,
    warnings,
  };
}

export async function parseAltaBuyerStatement(
  input: AltaBuyerStatementParserInput,
  options?: { timeoutMs?: number },
): Promise<AltaBuyerStatementParserResult> {
  if (input.mimeType !== "application/pdf") {
    throw new AltaBuyerStatementParserError(
      "Only application/pdf inputs are supported for ALTA statement parsing.",
    );
  }

  if (input.fileBuffer.length === 0) {
    throw new AltaBuyerStatementParserError("PDF input buffer is empty.");
  }

  const extractedAtIso = new Date().toISOString();

  return withUploadedPdf({
    fileBuffer: input.fileBuffer,
    filename: input.filename,
    mimeType: input.mimeType,
    timeoutMs: options?.timeoutMs ?? defaultTimeoutMs,
    async run({ client, model, fileId }) {
      const extraction = await requestStructuredJson<AltaBuyerStatementExtraction>({
        client,
        model,
        input: buildPdfBackedInput(
          fileId,
          buildAltaBuyerStatementPrompt({
            filename: input.filename,
            receivedAtIso: input.received_at_iso,
          }),
        ),
        schemaName: "alta_buyer_statement_parser",
        schema: altaBuyerStatementExtractionSchema,
        timeoutMs: options?.timeoutMs ?? defaultTimeoutMs,
        emptyOutputMessage: "OpenAI returned no ALTA buyer statement parser output.",
      });

      const normalized = normalizeExtraction(extraction);

      return {
        classification: normalized.classification,
        metadata: {
          filename: input.filename,
          mime_type: input.mimeType,
          bytes: input.fileBuffer.length,
          page_count: null,
          extracted_at_iso: extractedAtIso,
          openai_model: model,
        },
        statement: normalized.statement,
        money: normalized.money,
        warnings: normalized.warnings,
      };
    },
  });
}

export type {
  AltaBuyerStatementParserInput,
  AltaBuyerStatementParserResult,
} from "../schemas/altaBuyerStatement.schema";
