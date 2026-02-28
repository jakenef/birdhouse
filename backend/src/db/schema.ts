import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

export const properties = sqliteTable("properties", {
  id: text("id").primaryKey(), // uuid
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),

  // Property info
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
  acceptanceDate: text("acceptance_date"),     // effective date of contract
  closingDate: text("closing_date"),           // settlement date
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
});

export type Property = typeof properties.$inferSelect;
export type NewProperty = typeof properties.$inferInsert;
