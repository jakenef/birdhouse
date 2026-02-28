import OpenAI, { toFile } from "openai";

import {
  buildRecoveryPrompt,
  buildStructuredOutputInput,
} from "../prompts/structuredOutput";
import {
  ParsedPurchaseContract,
  parsedPurchaseContractSchema,
} from "../schemas/parsedPurchaseContract.schema";
import { parsePossessionTiming } from "../utils/possession";
import { DocAiNormalizedContract } from "./docai";

type ParsePurchaseContractArgs = {
  docAiPayload: DocAiNormalizedContract;
  fileBuffer: Buffer;
  filename: string;
  mimeType: string;
  timeoutMs: number;
};

type OpenAiResponseShape = {
  output_text?: string;
  output?: Array<{
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
};

type RecoveryCandidate = {
  value: number | null;
  confidence: number;
  evidence: string | null;
};

type MissingFieldRecovery = {
  purchase_price: RecoveryCandidate;
  earnest_money_amount: RecoveryCandidate;
  notes: string[];
};

type TimeSensitiveItem = ParsedPurchaseContract["obligations_and_risks"]["time_sensitive_items"][number];

const recoverySchema = {
  type: "object",
  additionalProperties: false,
  required: ["purchase_price", "earnest_money_amount", "notes"],
  properties: {
    purchase_price: {
      type: "object",
      additionalProperties: false,
      required: ["value", "confidence", "evidence"],
      properties: {
        value: { type: ["number", "null"] },
        confidence: { type: "number", minimum: 0, maximum: 1 },
        evidence: { type: ["string", "null"] },
      },
    },
    earnest_money_amount: {
      type: "object",
      additionalProperties: false,
      required: ["value", "confidence", "evidence"],
      properties: {
        value: { type: ["number", "null"] },
        confidence: { type: "number", minimum: 0, maximum: 1 },
        evidence: { type: ["string", "null"] },
      },
    },
    notes: {
      type: "array",
      items: { type: "string" },
    },
  },
} as const;

const recoveryThreshold = Number(
  process.env.RECOVERY_AUTO_ACCEPT_CONFIDENCE || "0.9",
);

export class OpenAiServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpenAiServiceError";
  }
}

function extractOutputText(response: OpenAiResponseShape): string | null {
  if (typeof response.output_text === "string" && response.output_text.trim().length > 0) {
    return response.output_text;
  }

  const aggregated = (response.output || [])
    .flatMap((item) => item.content || [])
    .filter((item) => item.type === "output_text" && typeof item.text === "string")
    .map((item) => item.text as string)
    .join("")
    .trim();

  return aggregated.length > 0 ? aggregated : null;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutHandle: NodeJS.Timeout | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new OpenAiServiceError(`OpenAI request timed out after ${timeoutMs}ms.`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

function parseJsonOutput<T>(response: OpenAiResponseShape, errorMessage: string): T {
  const outputText = extractOutputText(response);
  if (!outputText) {
    throw new OpenAiServiceError(errorMessage);
  }

  try {
    return JSON.parse(outputText) as T;
  } catch (_error) {
    throw new OpenAiServiceError("OpenAI returned invalid JSON output.");
  }
}

function buildFileBackedInput(fileId: string, prompt: string) {
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

function shouldAutoAccept(
  currentValue: number | null,
  candidate: RecoveryCandidate,
): boolean {
  return (
    currentValue === null &&
    candidate.value !== null &&
    Number.isFinite(candidate.value) &&
    candidate.confidence >= recoveryThreshold
  );
}

function mergeRecoveryNotes(
  warnings: string[],
  notes: string[],
  appliedRecoveryNotes: string[],
): string[] {
  const merged = [...warnings];

  for (const note of [...notes, ...appliedRecoveryNotes]) {
    if (!merged.includes(note)) {
      merged.push(note);
    }
  }

  return merged;
}

function applyRecoveries(
  docAiPayload: DocAiNormalizedContract,
  recovery: MissingFieldRecovery,
): {
  mergedPayload: DocAiNormalizedContract;
  appliedRecoveryNotes: string[];
} {
  const appliedRecoveryNotes: string[] = [];

  let purchasePrice = docAiPayload.fields.purchase_price;
  if (shouldAutoAccept(purchasePrice, recovery.purchase_price)) {
    purchasePrice = recovery.purchase_price.value;
    appliedRecoveryNotes.push(
      `Auto-accepted purchase_price from PDF review at confidence ${recovery.purchase_price.confidence.toFixed(2)}.`,
    );
  }

  let earnestMoneyAmount = docAiPayload.fields.earnest_money_amount;
  if (shouldAutoAccept(earnestMoneyAmount, recovery.earnest_money_amount)) {
    earnestMoneyAmount = recovery.earnest_money_amount.value;
    appliedRecoveryNotes.push(
      `Auto-accepted earnest_money_amount from PDF review at confidence ${recovery.earnest_money_amount.confidence.toFixed(2)}.`,
    );
  }

  return {
    mergedPayload: {
      ...docAiPayload,
      fields: {
        ...docAiPayload.fields,
        purchase_price: purchasePrice,
        earnest_money_amount: earnestMoneyAmount,
      },
      warnings: mergeRecoveryNotes(
        docAiPayload.warnings,
        recovery.notes,
        appliedRecoveryNotes,
      ),
    },
    appliedRecoveryNotes,
  };
}

function mergeConfidenceNotes(
  existingNotes: string,
  appliedRecoveryNotes: string[],
): string {
  const notes = [existingNotes.trim(), ...appliedRecoveryNotes]
    .map((note) => note.trim())
    .filter(Boolean);

  return notes.join(" ");
}

function daysBetween(start: string, end: string): number | null {
  const startDate = new Date(`${start}T00:00:00Z`);
  const endDate = new Date(`${end}T00:00:00Z`);

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return null;
  }

  return Math.round((endDate.getTime() - startDate.getTime()) / 86400000);
}

function computeMissingInfo(docAiPayload: DocAiNormalizedContract): string[] {
  const missing: string[] = [];
  const { fields } = docAiPayload;

  if (fields.buyer_names.length === 0) {
    missing.push("buyers");
  }
  if (fields.seller_names.length === 0) {
    missing.push("sellers");
  }
  if (!fields.property_address) {
    missing.push("property_address");
  }
  if (fields.purchase_price === null) {
    missing.push("purchase_price");
  }
  if (!fields.settlement_deadline) {
    missing.push("settlement_deadline");
  }
  if (fields.earnest_money_amount === null) {
    missing.push("earnest_money_amount");
  }
  if (!fields.due_diligence_deadline) {
    missing.push("due_diligence_deadline");
  }

  return missing;
}

function computeTimeSensitiveItems(
  docAiPayload: DocAiNormalizedContract,
): TimeSensitiveItem[] {
  const { fields } = docAiPayload;
  const deadlines: Array<{ label: string; dueDate: string | null }> = [
    { label: "Due Diligence Deadline", dueDate: fields.due_diligence_deadline },
    { label: "Financing Deadline", dueDate: fields.financing_deadline },
    { label: "Appraisal Deadline", dueDate: fields.appraisal_deadline },
    {
      label: "Seller Disclosure Deadline",
      dueDate: fields.seller_disclosure_deadline,
    },
    { label: "Settlement Deadline", dueDate: fields.settlement_deadline },
  ];

  return deadlines
    .filter((item) => item.dueDate !== null)
    .map((item) => {
      if (!fields.effective_date) {
        return {
          label: item.label,
          due_date: item.dueDate,
          urgency: "medium" as const,
          notes: "effective_date missing",
        };
      }

      const offsetDays = daysBetween(fields.effective_date, item.dueDate as string);
      if (offsetDays === null) {
        return {
          label: item.label,
          due_date: item.dueDate,
          urgency: "medium" as const,
          notes: "date comparison unavailable",
        };
      }

      if (offsetDays < 0) {
        return {
          label: item.label,
          due_date: item.dueDate,
          urgency: "high" as const,
          notes: "deadline precedes effective_date",
        };
      }

      if (offsetDays <= 7) {
        return {
          label: item.label,
          due_date: item.dueDate,
          urgency: "high" as const,
          notes: null,
        };
      }

      if (offsetDays <= 21) {
        return {
          label: item.label,
          due_date: item.dueDate,
          urgency: "medium" as const,
          notes: null,
        };
      }

      return {
        label: item.label,
        due_date: item.dueDate,
        urgency: "low" as const,
        notes: null,
      };
    });
}

function mergeWarnings(
  parsed: ParsedPurchaseContract,
  docAiPayload: DocAiNormalizedContract,
  appliedRecoveryNotes: string[],
): ParsedPurchaseContract {
  const mergedWarnings = [...parsed.obligations_and_risks.warnings];
  const normalizedPossession = parsePossessionTiming(
    docAiPayload.fields.possession_timing,
  );

  for (const warning of docAiPayload.warnings) {
    if (!mergedWarnings.includes(warning)) {
      mergedWarnings.push(warning);
    }
  }

  return {
    ...parsed,
    metadata: {
      ...parsed.metadata,
      doc_hash: docAiPayload.doc_hash,
      filename: docAiPayload.filename,
      mime_type: docAiPayload.mime_type,
      bytes: docAiPayload.bytes,
      page_count: docAiPayload.page_count,
      extracted_at_iso: docAiPayload.extracted_at_iso,
      source: "upload",
      model: {
        openai_model: process.env.OPENAI_MODEL as string,
      },
      confidence: {
        ...parsed.metadata.confidence,
        notes: mergeConfidenceNotes(
          parsed.metadata.confidence.notes,
          appliedRecoveryNotes,
        ),
      },
    },
    parties: {
      buyers: docAiPayload.fields.buyer_names,
      sellers: docAiPayload.fields.seller_names,
    },
    property: {
      ...parsed.property,
      address_full: docAiPayload.fields.property_address,
    },
    key_dates: {
      ...parsed.key_dates,
      effective_date: docAiPayload.fields.effective_date,
      due_diligence_deadline: docAiPayload.fields.due_diligence_deadline,
      financing_deadline: docAiPayload.fields.financing_deadline,
      appraisal_deadline: docAiPayload.fields.appraisal_deadline,
      seller_disclosure_deadline: docAiPayload.fields.seller_disclosure_deadline,
      settlement_deadline: docAiPayload.fields.settlement_deadline,
      possession: normalizedPossession,
    },
    money: {
      purchase_price: docAiPayload.fields.purchase_price,
      earnest_money: {
        amount: docAiPayload.fields.earnest_money_amount,
      },
    },
    obligations_and_risks: {
      ...parsed.obligations_and_risks,
      missing_info: computeMissingInfo(docAiPayload),
      time_sensitive_items: computeTimeSensitiveItems(docAiPayload),
      warnings: mergedWarnings,
    },
  };
}

async function recoverMissingFields(
  client: OpenAI,
  docAiPayload: DocAiNormalizedContract,
  fileId: string,
  filename: string,
  timeoutMs: number,
): Promise<MissingFieldRecovery> {
  const response = await withTimeout(
    client.responses.create({
      model: process.env.OPENAI_MODEL as string,
      input: buildFileBackedInput(fileId, buildRecoveryPrompt(docAiPayload)),
      store: false,
      text: {
        format: {
          type: "json_schema",
          name: "missing_field_recovery",
          strict: true,
          schema: recoverySchema,
        },
      },
    }),
    timeoutMs,
  );

  return parseJsonOutput<MissingFieldRecovery>(
    response as OpenAiResponseShape,
    "OpenAI returned no missing-field recovery output.",
  );
}

async function buildFinalStructuredResponse(
  client: OpenAI,
  docAiPayload: DocAiNormalizedContract,
  fileId: string,
  filename: string,
  timeoutMs: number,
): Promise<ParsedPurchaseContract> {
  const response = await withTimeout(
    client.responses.create({
        model: process.env.OPENAI_MODEL as string,
      input: buildFileBackedInput(fileId, buildStructuredOutputInput(docAiPayload)),
      store: false,
      text: {
        format: {
          type: "json_schema",
          name: "parsed_purchase_contract",
          strict: true,
          schema: parsedPurchaseContractSchema,
        },
      },
    }),
    timeoutMs,
  );

  return parseJsonOutput<ParsedPurchaseContract>(
    response as OpenAiResponseShape,
    "OpenAI returned no structured output text.",
  );
}

export async function parsePurchaseContractWithOpenAi(
  args: ParsePurchaseContractArgs,
): Promise<ParsedPurchaseContract> {
  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  let uploadedFileId: string | null = null;

  try {
    const uploadedFile = await withTimeout(
      client.files.create({
        file: await toFile(args.fileBuffer, args.filename, {
          type: args.mimeType,
        }),
        purpose: "user_data",
      }),
      args.timeoutMs,
    );

    uploadedFileId = uploadedFile.id;

    const recovery = await recoverMissingFields(
      client,
      args.docAiPayload,
      uploadedFileId,
      args.filename,
      args.timeoutMs,
    );

    const { mergedPayload, appliedRecoveryNotes } = applyRecoveries(
      args.docAiPayload,
      recovery,
    );

    const parsed = await buildFinalStructuredResponse(
      client,
      mergedPayload,
      uploadedFileId,
      args.filename,
      args.timeoutMs,
    );

    return mergeWarnings(parsed, mergedPayload, appliedRecoveryNotes);
  } catch (error) {
    if (error instanceof OpenAiServiceError) {
      throw error;
    }

    throw new OpenAiServiceError(
      error instanceof Error
        ? `OpenAI request failed: ${error.message}`
        : "OpenAI request failed.",
    );
  } finally {
    if (uploadedFileId) {
      try {
        await client.files.delete(uploadedFileId);
      } catch (_error) {
        // Ignore cleanup failures for transient uploaded files.
      }
    }
  }
}
