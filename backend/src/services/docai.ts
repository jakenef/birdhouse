import { DocumentProcessorServiceClient, protos } from "@google-cloud/documentai";

import { parseDateToIso } from "../utils/parseDate";

export type DocAiContractFields = {
  appraisal_deadline: string | null;
  buyer_names: string[];
  due_diligence_deadline: string | null;
  earnest_money_amount: number | null;
  effective_date: string | null;
  financing_deadline: string | null;
  possession_timing: string | null;
  property_address: string | null;
  purchase_price: number | null;
  seller_disclosure_deadline: string | null;
  seller_names: string[];
  settlement_deadline: string | null;
};

export type DocAiNormalizedContract = {
  doc_hash: string;
  filename: string;
  mime_type: string;
  bytes: number;
  page_count: number;
  extracted_at_iso: string;
  fields: DocAiContractFields;
  warnings: string[];
};

type ExtractContractFieldsArgs = {
  buffer: Buffer;
  bytes: number;
  docHash: string;
  filename: string;
  mimeType: string;
  timeoutMs: number;
};

type CandidateMap = Record<keyof DocAiContractFields, string[]>;

type DocAiEntity = protos.google.cloud.documentai.v1.Document.IEntity;
type DocAiPage = protos.google.cloud.documentai.v1.Document.IPage;
type DocAiDocument = protos.google.cloud.documentai.v1.IDocument;

const aliasMap: Record<keyof DocAiContractFields, string[]> = {
  appraisal_deadline: ["appraisal_deadline", "appraisal"],
  buyer_names: ["buyer", "buyers", "buyer_name", "buyer_names"],
  due_diligence_deadline: [
    "due_diligence_deadline",
    "due_diligence",
    "inspection_deadline",
  ],
  earnest_money_amount: [
    "earnest_money",
    "earnest_money_amount",
    "earnest_deposit",
  ],
  effective_date: ["effective_date"],
  financing_deadline: [
    "financing_deadline",
    "loan_deadline",
    "loan_contingency_deadline",
  ],
  possession_timing: ["possession", "possession_timing", "occupancy"],
  property_address: [
    "property_address",
    "address",
    "subject_property_address",
  ],
  purchase_price: ["purchase_price", "sales_price", "price"],
  seller_disclosure_deadline: [
    "seller_disclosure_deadline",
    "disclosure_deadline",
  ],
  seller_names: ["seller", "sellers", "seller_name", "seller_names"],
  settlement_deadline: ["settlement_deadline", "settlement_date", "closing_date"],
};

export class DocAiServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DocAiServiceError";
  }
}

function createEmptyCandidateMap(): CandidateMap {
  return {
    appraisal_deadline: [],
    buyer_names: [],
    due_diligence_deadline: [],
    earnest_money_amount: [],
    effective_date: [],
    financing_deadline: [],
    possession_timing: [],
    property_address: [],
    purchase_price: [],
    seller_disclosure_deadline: [],
    seller_names: [],
    settlement_deadline: [],
  };
}

function normalizeKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s_-]/g, "")
    .replace(/[\s-]+/g, "_");
}

function getFieldKey(rawKey: string | null | undefined): keyof DocAiContractFields | null {
  if (!rawKey) {
    return null;
  }

  const normalized = normalizeKey(rawKey);

  for (const [fieldKey, aliases] of Object.entries(aliasMap) as [
    keyof DocAiContractFields,
    string[],
  ][]) {
    if (aliases.includes(normalized)) {
      return fieldKey;
    }
  }

  return null;
}

function getTextAnchorContent(
  text: string | null | undefined,
  textAnchor:
    | protos.google.cloud.documentai.v1.Document.ITextAnchor
    | null
    | undefined,
): string {
  if (!text || !textAnchor?.textSegments?.length) {
    return "";
  }

  return textAnchor.textSegments
    .map((segment) => {
      const startIndex = Number(segment.startIndex || 0);
      const endIndex = Number(segment.endIndex || 0);
      return text.slice(startIndex, endIndex);
    })
    .join("")
    .trim();
}

function getEntityValue(document: DocAiDocument, entity: DocAiEntity): string {
  const textValue =
    entity.normalizedValue?.text ||
    entity.mentionText ||
    getTextAnchorContent(document.text, entity.textAnchor);

  return (textValue || "").trim();
}

function addCandidate(
  candidates: CandidateMap,
  fieldKey: keyof DocAiContractFields | null,
  value: string,
): void {
  const cleanedValue = value.trim();
  if (!fieldKey || cleanedValue.length === 0) {
    return;
  }

  candidates[fieldKey].push(cleanedValue);
}

function collectEntityCandidates(
  document: DocAiDocument,
  entities: DocAiEntity[] | null | undefined,
  candidates: CandidateMap,
): void {
  if (!entities?.length) {
    return;
  }

  for (const entity of entities) {
    addCandidate(candidates, getFieldKey(entity.type), getEntityValue(document, entity));
    collectEntityCandidates(document, entity.properties, candidates);
  }
}

function collectFormFieldCandidates(
  document: DocAiDocument,
  pages: DocAiPage[] | null | undefined,
  candidates: CandidateMap,
): void {
  if (!pages?.length) {
    return;
  }

  for (const page of pages) {
    for (const formField of page.formFields || []) {
      const fieldName = getTextAnchorContent(document.text, formField.fieldName?.textAnchor);
      const fieldValue = getTextAnchorContent(
        document.text,
        formField.fieldValue?.textAnchor,
      );

      addCandidate(candidates, getFieldKey(fieldName), fieldValue);
    }
  }
}

function dedupe(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function shouldSplitCommaSeparatedNames(parts: string[]): boolean {
  if (parts.length < 2) {
    return false;
  }

  const corporatePattern = /\b(llc|inc|ltd|corp|company|trust|properties)\b/i;

  return parts.every((part) => {
    if (corporatePattern.test(part)) {
      return false;
    }

    const wordCount = part
      .split(/\s+/)
      .map((token) => token.trim())
      .filter(Boolean).length;

    return wordCount >= 2;
  });
}

function splitNames(values: string[]): string[] {
  return dedupe(
    values.flatMap((value) => {
      const primaryParts = value
        .split(/\s+and\s+|;|\n/gi)
        .map((part) => part.trim())
        .filter(Boolean);

      return primaryParts.flatMap((part) => {
        const commaParts = part
          .split(",")
          .map((segment) => segment.trim())
          .filter(Boolean);

        return shouldSplitCommaSeparatedNames(commaParts) ? commaParts : [part];
      });
    }),
  );
}

function parseNumberField(
  fieldLabel: keyof DocAiContractFields,
  values: string[],
  warnings: string[],
): number | null {
  const candidate = values.find((value) => value.trim().length > 0);
  if (!candidate) {
    return null;
  }

  const sanitized = candidate.replace(/[$,\s]/g, "");
  const parsed = Number(sanitized);

  if (!Number.isFinite(parsed)) {
    warnings.push(`Unable to parse numeric value for ${fieldLabel}.`);
    return null;
  }

  return parsed;
}

function parseDateField(
  fieldLabel: keyof DocAiContractFields,
  values: string[],
  warnings: string[],
): string | null {
  const candidate = values.find((value) => value.trim().length > 0);
  if (!candidate) {
    return null;
  }

  const parsed = parseDateToIso(candidate);
  if (!parsed) {
    warnings.push(`Unable to parse date for ${fieldLabel}.`);
  }
  return parsed;
}

function parseStringField(values: string[]): string | null {
  const candidate = values.find((value) => value.trim().length > 0);
  return candidate ? candidate.trim() : null;
}

function normalizeContractFields(
  candidates: CandidateMap,
  warnings: string[],
): DocAiContractFields {
  return {
    appraisal_deadline: parseDateField(
      "appraisal_deadline",
      candidates.appraisal_deadline,
      warnings,
    ),
    buyer_names: splitNames(candidates.buyer_names),
    due_diligence_deadline: parseDateField(
      "due_diligence_deadline",
      candidates.due_diligence_deadline,
      warnings,
    ),
    earnest_money_amount: parseNumberField(
      "earnest_money_amount",
      candidates.earnest_money_amount,
      warnings,
    ),
    effective_date: parseDateField("effective_date", candidates.effective_date, warnings),
    financing_deadline: parseDateField(
      "financing_deadline",
      candidates.financing_deadline,
      warnings,
    ),
    possession_timing: parseStringField(candidates.possession_timing),
    property_address: parseStringField(candidates.property_address),
    purchase_price: parseNumberField("purchase_price", candidates.purchase_price, warnings),
    seller_disclosure_deadline: parseDateField(
      "seller_disclosure_deadline",
      candidates.seller_disclosure_deadline,
      warnings,
    ),
    seller_names: splitNames(candidates.seller_names),
    settlement_deadline: parseDateField(
      "settlement_deadline",
      candidates.settlement_deadline,
      warnings,
    ),
  };
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutHandle: NodeJS.Timeout | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new DocAiServiceError(`Document AI request timed out after ${timeoutMs}ms.`));
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

export async function extractContractFieldsFromDocAi(
  args: ExtractContractFieldsArgs,
): Promise<DocAiNormalizedContract> {
  const client = new DocumentProcessorServiceClient();
  const processorName = client.processorPath(
    process.env.GOOGLE_CLOUD_PROJECT_ID as string,
    process.env.GOOGLE_CLOUD_LOCATION as string,
    process.env.DOCUMENT_AI_PROCESSOR_ID as string,
  );

  try {
    const [result] = await withTimeout(
      client.processDocument({
        name: processorName,
        rawDocument: {
          content: args.buffer,
          mimeType: args.mimeType,
        },
      }),
      args.timeoutMs,
    );

    const document = result.document;
    if (!document) {
      throw new DocAiServiceError("Document AI returned no document payload.");
    }

    const warnings: string[] = [];
    const candidates = createEmptyCandidateMap();
    collectEntityCandidates(document, document.entities, candidates);
    collectFormFieldCandidates(document, document.pages, candidates);

    const pageCount = document.pages?.length || 0;
    if (pageCount === 0) {
      warnings.push("Document AI did not report page_count.");
    }

    return {
      doc_hash: args.docHash,
      filename: args.filename,
      mime_type: args.mimeType,
      bytes: args.bytes,
      page_count: pageCount,
      extracted_at_iso: new Date().toISOString(),
      fields: normalizeContractFields(candidates, warnings),
      warnings,
    };
  } catch (error) {
    if (error instanceof DocAiServiceError) {
      throw error;
    }

    throw new DocAiServiceError(
      error instanceof Error
        ? `Document AI request failed: ${error.message}`
        : "Document AI request failed.",
    );
  }
}
