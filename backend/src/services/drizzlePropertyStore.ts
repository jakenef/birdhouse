import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";

import { db } from "../db";
import { properties, type NewProperty } from "../db/schema";
import { ParsedPurchaseContract } from "../schemas/parsedPurchaseContract.schema";
import { DuplicatePropertyError, PropertyStore } from "./propertyStore";
import { StoredPropertyRecord, StreetViewCacheEntry } from "../types/property";
import { PropertyWorkflowState } from "../types/workflow";
import { derivePropertyName } from "../utils/propertyName";
import { generateEmailSlug } from "../utils/emailSlug";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generatePropertyId(): string {
  return `prop_${randomUUID().replace(/-/g, "").slice(0, 20)}`;
}

/**
 * Map a ParsedPurchaseContract into a flat Drizzle row,
 * storing the full contract JSON alongside extracted query-friendly columns.
 */
function contractToRow(
  id: string,
  propertyName: string,
  propertyEmail: string,
  contract: ParsedPurchaseContract,
  now: string,
): NewProperty {
  return {
    id,
    createdAt: now,
    updatedAt: now,

    docHash: contract.metadata.doc_hash,
    propertyName,
    propertyEmail,
    parsedContractJson: JSON.stringify(contract),

    address: contract.property.address_full ?? "Unknown",
    city: contract.property.city ?? null,
    state: contract.property.state ?? null,
    zip: contract.property.zip ?? null,

    buyerName: contract.parties.buyers.join(", ") || null,
    sellerName: contract.parties.sellers.join(", ") || null,

    purchasePrice: contract.money.purchase_price ?? null,
    earnestMoney: contract.money.earnest_money.amount ?? null,

    acceptanceDate: contract.key_dates.effective_date ?? null,
    closingDate: contract.key_dates.settlement_deadline ?? null,
    financingDeadline: contract.key_dates.financing_deadline ?? null,
    appraisalDeadline: contract.key_dates.appraisal_deadline ?? null,

    pipelineStage: "earnest_money",
    status: "active",

    lastActivityDescription: "Created from email intake",
    lastActivityAt: now,
  };
}

/**
 * Reconstitute a StoredPropertyRecord from a DB row.
 */
function rowToStoredRecord(
  row: typeof properties.$inferSelect,
): StoredPropertyRecord {
  const contract: ParsedPurchaseContract = row.parsedContractJson
    ? JSON.parse(row.parsedContractJson)
    : null;

  return {
    id: row.id,
    property_name: row.propertyName ?? row.address,
    property_email: row.propertyEmail,
    created_at_iso: row.createdAt,
    updated_at_iso: row.updatedAt,
    parsed_contract: contract,
    workflow_state: row.workflowStateJson
      ? (JSON.parse(row.workflowStateJson) as PropertyWorkflowState)
      : undefined,
    street_view: row.streetViewJson
      ? JSON.parse(row.streetViewJson)
      : undefined,
  };
}

// ---------------------------------------------------------------------------
// DrizzlePropertyStore
// ---------------------------------------------------------------------------

export class DrizzlePropertyStore implements PropertyStore {
  /**
   * Generate a unique property email by appending numeric suffixes if collisions occur.
   * Examples:
   *   "6119 W Montauk Ln" -> "6119-w-montauk-ln@domain"
   *   If collision -> "6119-w-montauk-ln-2@domain"
   */
  private async generateUniquePropertyEmail(
    address: string | null | undefined,
  ): Promise<string> {
    const domain = process.env.EMAIL_DOMAIN || "bronaaelda.resend.app";
    const baseSlug = generateEmailSlug(address);
    let candidate = `${baseSlug}@${domain}`;
    let suffix = 2;

    // Check for collisions and increment suffix until unique
    while (await this.findByPropertyEmail(candidate)) {
      candidate = `${baseSlug}-${suffix}@${domain}`;
      suffix++;
    }

    return candidate;
  }

  async list(): Promise<StoredPropertyRecord[]> {
    const rows = await db.select().from(properties).all();
    return rows.map(rowToStoredRecord).reverse();
  }

  async create(
    parsedContract: ParsedPurchaseContract,
  ): Promise<StoredPropertyRecord> {
    const docHash = parsedContract.metadata.doc_hash;

    // Check for duplicates
    const existing = await this.findByDocHash(docHash);
    if (existing) {
      throw new DuplicatePropertyError(
        `Property already exists for doc_hash ${docHash}.`,
      );
    }

    const id = generatePropertyId();
    const propertyName = derivePropertyName(parsedContract);
    const propertyEmail = await this.generateUniquePropertyEmail(
      parsedContract.property.address_full,
    );
    const now = new Date().toISOString();
    const row = contractToRow(
      id,
      propertyName,
      propertyEmail,
      parsedContract,
      now,
    );

    await db.insert(properties).values(row);

    return {
      id,
      property_name: propertyName,
      property_email: propertyEmail,
      created_at_iso: now,
      updated_at_iso: now,
      parsed_contract: parsedContract,
    };
  }

  async findByDocHash(docHash: string): Promise<StoredPropertyRecord | null> {
    const rows = await db
      .select()
      .from(properties)
      .where(eq(properties.docHash, docHash))
      .limit(1);

    if (rows.length === 0) return null;
    return rowToStoredRecord(rows[0]);
  }

  async findById(id: string): Promise<StoredPropertyRecord | null> {
    const rows = await db
      .select()
      .from(properties)
      .where(eq(properties.id, id))
      .limit(1);

    if (rows.length === 0) return null;
    return rowToStoredRecord(rows[0]);
  }

  async findByPropertyEmail(
    email: string,
  ): Promise<StoredPropertyRecord | null> {
    const rows = await db
      .select()
      .from(properties)
      .where(eq(properties.propertyEmail, email))
      .limit(1);

    if (rows.length === 0) return null;
    return rowToStoredRecord(rows[0]);
  }

  async getWorkflowState(propertyId: string): Promise<PropertyWorkflowState | null> {
    const property = await this.findById(propertyId);
    return property?.workflow_state || null;
  }

  async updateWorkflowState(
    id: string,
    workflowState: PropertyWorkflowState,
  ): Promise<StoredPropertyRecord> {
    const now = new Date().toISOString();

    await db
      .update(properties)
      .set({
        workflowStateJson: JSON.stringify(workflowState),
        updatedAt: now,
      })
      .where(eq(properties.id, id));

    const updated = await this.findById(id);
    if (!updated) {
      throw new Error(`Property ${id} not found after workflow update`);
    }

    return updated;
  }

  async updateStreetView(
    id: string,
    streetView: StreetViewCacheEntry,
  ): Promise<StoredPropertyRecord> {
    const now = new Date().toISOString();
    await db
      .update(properties)
      .set({
        streetViewJson: JSON.stringify(streetView),
        updatedAt: now,
      })
      .where(eq(properties.id, id));

    const updated = await this.findById(id);
    if (!updated) {
      throw new Error(`Property ${id} not found after street view update`);
    }
    return updated;
  }
}
