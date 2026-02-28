import { DocAiNormalizedContract } from "../services/docai";

export function buildRecoveryPrompt(docAiPayload: DocAiNormalizedContract): string {
  return [
    "You are reviewing a real estate purchase contract PDF and a DocAiNormalizedContract JSON payload.",
    "Your job is to recover missing canonical fields only when they are explicitly visible in the PDF.",
    "Focus only on these fields: purchase_price and earnest_money_amount.",
    "Use the PDF as the primary source for recovery and the DocAiNormalizedContract only for context and cross-checking.",
    "Return null with low confidence when a value is not explicit or you are uncertain.",
    "Return numeric values only. Strip currency symbols and commas.",
    "Do not guess, estimate, or infer from surrounding context.",
    "",
    "DocAiNormalizedContract JSON:",
    JSON.stringify(docAiPayload),
  ].join("\n");
}

export function buildStructuredOutputInput(
  docAiPayload: DocAiNormalizedContract,
): string {
  return [
    "You are transforming a DocAiNormalizedContract payload into ParsedPurchaseContract JSON.",
    "Use the provided JSON payload as the canonical source for structured contract fields.",
    "You may use the attached PDF for summary context and to understand the contract, but do not invent or override canonical values beyond what is already present in the provided JSON payload.",
    "If a field is missing or not directly supported by the payload, output null or [] and include the exact missing field label in obligations_and_risks.missing_info when required.",
    "Critical missing_info labels: buyers, sellers, property_address, purchase_price, settlement_deadline, earnest_money_amount, due_diligence_deadline.",
    "Metadata.doc_hash, filename, mime_type, bytes, page_count, extracted_at_iso, and model.openai_model must match the supplied payload and environment-backed model value. metadata.source must be upload.",
    "Dates must be YYYY-MM-DD if parseable; otherwise null. If a date is unusable, keep it null and include a warning.",
    "For property.address_full, copy the full address string when present. Split city, state, and zip only if clearly present in the address string; otherwise leave those fields null.",
    "For key_dates.possession, parse explicit patterns like N hour(s) after recording or N day(s) after recording into numeric fields. Always preserve the original possession text in timing when available.",
    "For obligations_and_risks.time_sensitive_items, create one item for each non-null deadline among due diligence, financing, appraisal, seller disclosure, and settlement. Use urgency high if within 7 days of effective_date, medium if 8-21, low otherwise. If effective_date is missing, set urgency to medium and note effective_date missing. If a deadline is before effective_date, set urgency to high and note the anomaly.",
    "The summary must be operational and agent-style, and it may use the attached PDF for general context. Mention purchase price, earnest money, key deadlines, and possession timing when available; if any are missing, state that they are missing rather than inventing them.",
    "Do not add generic statements about the contract being standard, comprehensive, compliant, typical, or aligned with jurisdictional forms unless that exact idea is explicit in the provided JSON payload.",
    "summary.bullets must contain 5 to 10 concise bullets. numbers_to_know must include only explicit values from the payload-derived contract data.",
    "recommended_next_actions must be grounded in the present deadlines, missing information, and transaction logistics, without adding unsupported details.",
    "Carry forward warnings from the payload and add any warning needed for unparseable dates or other unusable values.",
    "",
    "DocAiNormalizedContract JSON:",
    JSON.stringify(docAiPayload),
  ].join("\n");
}
