import { buildClosingAltaDetectorPrompt } from "../prompts/closingAltaDetector";
import {
  ClosingAltaDetectorExtraction,
  ClosingAltaDetectorInput,
  ClosingAltaDetectorResult,
  closingAltaDetectorExtractionSchema,
} from "../schemas/closingAltaDetector.schema";
import { requestStructuredJson, withUploadedPdf } from "./openaiStructuredOutput";

const defaultTimeoutMs = Number(process.env.REQUEST_TIMEOUT_MS || "60000");

export class ClosingAltaDetectorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClosingAltaDetectorError";
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
  extraction: ClosingAltaDetectorExtraction,
): ClosingAltaDetectorExtraction {
  const warnings = [...extraction.warnings];
  const isAltaDocument =
    extraction.classification.is_alta_document &&
    extraction.classification.document_type === "alta_statement";

  if (!isAltaDocument) {
    if (!warnings.includes("Document was not classified as an ALTA closing statement.")) {
      warnings.push("Document was not classified as an ALTA closing statement.");
    }

    return {
      classification: {
        is_alta_document: false,
        document_type: "other",
        confidence: extraction.classification.confidence,
      },
      summary: null,
      warnings,
    };
  }

  return {
    ...extraction,
    summary:
      extraction.summary?.trim() || "ALTA closing statement detected for the transaction.",
    warnings,
  };
}

export async function detectClosingAltaDocument(
  input: ClosingAltaDetectorInput,
  options?: { timeoutMs?: number },
): Promise<ClosingAltaDetectorResult> {
  if (input.mimeType !== "application/pdf") {
    throw new ClosingAltaDetectorError(
      "Only application/pdf inputs are supported for closing ALTA detection.",
    );
  }

  if (input.fileBuffer.length === 0) {
    throw new ClosingAltaDetectorError("PDF input buffer is empty.");
  }

  const extractedAtIso = new Date().toISOString();

  return withUploadedPdf({
    fileBuffer: input.fileBuffer,
    filename: input.filename,
    mimeType: input.mimeType,
    timeoutMs: options?.timeoutMs ?? defaultTimeoutMs,
    async run({ client, model, fileId }) {
      const extraction = await requestStructuredJson<ClosingAltaDetectorExtraction>({
        client,
        model,
        input: buildPdfBackedInput(
          fileId,
          buildClosingAltaDetectorPrompt({
            filename: input.filename,
            receivedAtIso: input.received_at_iso,
          }),
        ),
        schemaName: "closing_alta_detector",
        schema: closingAltaDetectorExtractionSchema,
        timeoutMs: options?.timeoutMs ?? defaultTimeoutMs,
        emptyOutputMessage: "OpenAI returned no closing ALTA detector output.",
      });

      const normalized = normalizeExtraction(extraction);

      return {
        classification: normalized.classification,
        metadata: {
          filename: input.filename,
          mime_type: input.mimeType,
          bytes: input.fileBuffer.length,
          extracted_at_iso: extractedAtIso,
          openai_model: model,
        },
        summary: normalized.summary,
        warnings: normalized.warnings,
      };
    },
  });
}

export type {
  ClosingAltaDetectorInput,
  ClosingAltaDetectorResult,
} from "../schemas/closingAltaDetector.schema";
