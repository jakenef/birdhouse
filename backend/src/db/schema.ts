import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

export const properties = sqliteTable("properties", {
  id: text("id").primaryKey(), // uuid
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),

  // Document identity
  docHash: text("doc_hash").unique(), // sha256 of the original PDF
  propertyName: text("property_name"), // derived from address

  // Full parsed contract (JSON blob — single source of truth)
  parsedContractJson: text("parsed_contract_json"), // JSON string of ParsedPurchaseContract

  // Property info (extracted for querying)
  address: text("address").notNull(),
  city: text("city"),
  state: text("state"),
  zip: text("zip"),
  county: text("county"),
  propertyType: text("property_type"), // e.g. "single-family", "condo", "townhome"

  // Deal parties
  buyerName: text("buyer_name"),
  sellerName: text("seller_name"),
  buyerAgent: text("buyer_agent"),
  sellerAgent: text("seller_agent"),
  buyerBrokerage: text("buyer_brokerage"),
  sellerBrokerage: text("seller_brokerage"),

  // Financial
  purchasePrice: real("purchase_price"),
  earnestMoney: real("earnest_money"),
  concessions: real("concessions"),
  downPayment: real("down_payment"),

  // Key dates
  acceptanceDate: text("acceptance_date"), // effective date of contract
  closingDate: text("closing_date"), // settlement date
  possessionDate: text("possession_date"),

  // Deadline dates (parsed from contract)
  earnestMoneyDeadline: text("earnest_money_deadline"),
  inspectionDeadline: text("inspection_deadline"),
  financingDeadline: text("financing_deadline"),
  appraisalDeadline: text("appraisal_deadline"),

  // Pipeline status
  pipelineStage: text("pipeline_stage").default("earnest_money"),
  // "earnest_money" | "inspections" | "financing" | "appraisal" | "title_escrow" | "closing"

  status: text("status").default("active"),
  // "active" | "closed" | "archived" | "cancelled"

  // Unique property email for inbound docs
  propertyEmail: text("property_email"),

  // Settlement totals (populated later from ALTA upload)
  brokerCommission: real("broker_commission"),
  loanPayoff: real("loan_payoff"),
  titleEscrowFees: real("title_escrow_fees"),
  transferTaxes: real("transfer_taxes"),
  totalClosingCosts: real("total_closing_costs"),
  netToSeller: real("net_to_seller"),
  cashToClose: real("cash_to_close"),

  // Activity tracking
  lastActivityDescription: text("last_activity_description"),
  lastActivityAt: text("last_activity_at"),

  // Misc / notes
  notes: text("notes"),

  // Street view cache (JSON blob)
  streetViewJson: text("street_view_json"),
});

export type Property = typeof properties.$inferSelect;
export type NewProperty = typeof properties.$inferInsert;

// ---------------------------------------------------------------------------
// Processed emails — tracks which Resend email IDs we've already handled
// ---------------------------------------------------------------------------

export const processedEmails = sqliteTable("processed_emails", {
  emailId: text("email_id").primaryKey(),
  processedAt: text("processed_at").notNull(),
});

// ---------------------------------------------------------------------------
// Documents — files (PDFs, etc.) attached to a property
// ---------------------------------------------------------------------------

export const documents = sqliteTable("documents", {
  id: text("id").primaryKey(),
  propertyId: text("property_id").notNull(), // FK to properties.id
  filename: text("filename").notNull(), // original filename
  filePath: text("file_path").notNull(), // path on disk (relative to backend/)
  mimeType: text("mime_type").notNull(), // e.g. "application/pdf"
  sizeBytes: integer("size_bytes"), // file size in bytes
  docHash: text("doc_hash"), // sha256 of the file
  source: text("source").default("email_intake"), // "email_intake" | "manual_upload"
  createdAt: text("created_at").notNull(),
});

export type Document = typeof documents.$inferSelect;
export type NewDocument = typeof documents.$inferInsert;
