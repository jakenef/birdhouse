import type {
  Document,
  PropertyDocumentsProperty,
  PropertyDocumentsResponse,
} from "../types/document";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isAiSummary(
  value: unknown,
): value is { title: string; summary: string; highlights: string[] } {
  return (
    isRecord(value) &&
    typeof value.title === "string" &&
    typeof value.summary === "string" &&
    Array.isArray(value.highlights) &&
    value.highlights.every((h) => typeof h === "string")
  );
}

function isDocument(value: unknown): value is Document {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    typeof value.filename === "string" &&
    typeof value.mime_type === "string" &&
    (typeof value.size_bytes === "number" || value.size_bytes === null) &&
    (typeof value.source === "string" || value.source === null) &&
    (value.ai_summary === null || isAiSummary(value.ai_summary)) &&
    typeof value.created_at === "string" &&
    typeof value.download_url === "string"
  );
}

function isPropertyDocumentsProperty(
  value: unknown,
): value is PropertyDocumentsProperty {
  if (!isRecord(value) || !Array.isArray(value.documents)) {
    return false;
  }

  const streetView = value.street_view;

  return (
    typeof value.id === "string" &&
    typeof value.property_name === "string" &&
    (typeof value.address_full === "string" || value.address_full === null) &&
    (typeof value.city === "string" || value.city === null) &&
    (typeof value.state === "string" || value.state === null) &&
    (typeof value.zip === "string" || value.zip === null) &&
    isRecord(streetView) &&
    typeof streetView.status === "string" &&
    (typeof streetView.image_url === "string" ||
      streetView.image_url === null) &&
    value.documents.every((document) => isDocument(document))
  );
}

function isPropertyDocumentsResponse(
  value: unknown,
): value is PropertyDocumentsResponse {
  if (!isRecord(value)) {
    return false;
  }

  return isPropertyDocumentsProperty(value.property);
}

export async function getPropertyDocuments(
  propertyId: string,
): Promise<PropertyDocumentsResponse> {
  const response = await fetch(
    `/api/properties/${encodeURIComponent(propertyId)}`,
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch property documents (${response.status}).`);
  }

  const payload: unknown = await response.json();
  if (!isPropertyDocumentsResponse(payload)) {
    throw new Error("Invalid property documents response.");
  }

  return payload;
}
