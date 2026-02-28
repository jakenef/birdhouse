import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";

import { db } from "../db";
import { documents, type NewDocument } from "../db/schema";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type StoredDocument = {
  id: string;
  property_id: string;
  filename: string;
  file_path: string;
  mime_type: string;
  size_bytes: number | null;
  doc_hash: string | null;
  source: string | null;
  created_at: string;
};

export type CreateDocumentInput = {
  propertyId: string;
  filename: string;
  filePath: string;
  mimeType: string;
  sizeBytes?: number;
  docHash?: string;
  source?: string;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateDocumentId(): string {
  return `doc_${randomUUID().replace(/-/g, "").slice(0, 20)}`;
}

function rowToStoredDocument(
  row: typeof documents.$inferSelect,
): StoredDocument {
  return {
    id: row.id,
    property_id: row.propertyId,
    filename: row.filename,
    file_path: row.filePath,
    mime_type: row.mimeType,
    size_bytes: row.sizeBytes,
    doc_hash: row.docHash,
    source: row.source,
    created_at: row.createdAt,
  };
}

// ---------------------------------------------------------------------------
// DocumentStore
// ---------------------------------------------------------------------------

export class DocumentStore {
  /** List all documents for a given property, newest first. */
  async listByPropertyId(propertyId: string): Promise<StoredDocument[]> {
    const rows = await db
      .select()
      .from(documents)
      .where(eq(documents.propertyId, propertyId))
      .all();

    return rows.map(rowToStoredDocument).reverse();
  }

  /** Find a single document by ID. */
  async findById(id: string): Promise<StoredDocument | null> {
    const rows = await db
      .select()
      .from(documents)
      .where(eq(documents.id, id))
      .limit(1);

    if (rows.length === 0) return null;
    return rowToStoredDocument(rows[0]);
  }

  /** Create a new document record. Returns the stored document. */
  async create(input: CreateDocumentInput): Promise<StoredDocument> {
    const id = generateDocumentId();
    const now = new Date().toISOString();

    const row: NewDocument = {
      id,
      propertyId: input.propertyId,
      filename: input.filename,
      filePath: input.filePath,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes ?? null,
      docHash: input.docHash ?? null,
      source: input.source ?? "email_intake",
      createdAt: now,
    };

    await db.insert(documents).values(row);

    return {
      id,
      property_id: input.propertyId,
      filename: input.filename,
      file_path: input.filePath,
      mime_type: input.mimeType,
      size_bytes: input.sizeBytes ?? null,
      doc_hash: input.docHash ?? null,
      source: input.source ?? "email_intake",
      created_at: now,
    };
  }
}
