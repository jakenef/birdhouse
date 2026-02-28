import { db } from "../db";
import { properties, NewProperty } from "../db/schema";
import { randomUUID } from "crypto";

/**
 * Seeds the database with sample properties for development.
 * Only inserts if the table is empty.
 */
export async function seedProperties() {
  const existing = await db.select().from(properties);
  if (existing.length > 0) return;

  const now = new Date().toISOString();

  const sampleProperties: NewProperty[] = [
    {
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
      address: "742 Evergreen Terrace",
      city: "Salt Lake City",
      state: "UT",
      zip: "84101",
      county: "Salt Lake",
      propertyType: "single-family",
      buyerName: "Homer Simpson",
      sellerName: "Ned Flanders",
      buyerAgent: "Marge Simpson",
      sellerAgent: "Maude Flanders",
      buyerBrokerage: "Springfield Realty",
      sellerBrokerage: "Flanders & Co",
      purchasePrice: 425000,
      earnestMoney: 5000,
      concessions: 3000,
      downPayment: 85000,
      acceptanceDate: "2026-02-20",
      closingDate: "2026-04-15",
      possessionDate: "2026-04-16",
      earnestMoneyDeadline: "2026-02-24",
      inspectionDeadline: "2026-03-06",
      financingDeadline: "2026-03-20",
      appraisalDeadline: "2026-03-25",
      pipelineStage: "inspections",
      status: "active",
      propertyEmail: "tx_742evergreen@birdhouse.app",
      lastActivityDescription: "Purchase agreement received via email",
      lastActivityAt: now,
    },
    {
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
      address: "1600 Pennsylvania Ave NW",
      city: "Provo",
      state: "UT",
      zip: "84601",
      county: "Utah",
      propertyType: "condo",
      buyerName: "Jane Doe",
      sellerName: "John Smith",
      buyerAgent: "Alice Walker",
      sellerAgent: "Bob Turner",
      buyerBrokerage: "Mountain West Realty",
      sellerBrokerage: "Wasatch Partners",
      purchasePrice: 315000,
      earnestMoney: 3000,
      concessions: 0,
      downPayment: 63000,
      acceptanceDate: "2026-02-15",
      closingDate: "2026-03-30",
      possessionDate: "2026-03-31",
      earnestMoneyDeadline: "2026-02-19",
      inspectionDeadline: "2026-02-28",
      financingDeadline: "2026-03-15",
      appraisalDeadline: "2026-03-20",
      pipelineStage: "financing",
      status: "active",
      propertyEmail: "tx_1600penn@birdhouse.app",
      lastActivityDescription: "Inspection report uploaded",
      lastActivityAt: now,
    },
    {
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
      address: "221B Baker Street",
      city: "Draper",
      state: "UT",
      zip: "84020",
      county: "Salt Lake",
      propertyType: "townhome",
      buyerName: "Sherlock Holmes",
      sellerName: "Mrs. Hudson",
      buyerAgent: "Dr. Watson",
      sellerAgent: "Mycroft Holmes",
      buyerBrokerage: "Baker Street Brokerage",
      sellerBrokerage: "Hudson Properties",
      purchasePrice: 550000,
      earnestMoney: 8000,
      concessions: 5000,
      downPayment: 110000,
      acceptanceDate: "2026-02-25",
      closingDate: "2026-04-30",
      possessionDate: "2026-05-01",
      earnestMoneyDeadline: "2026-03-01",
      inspectionDeadline: "2026-03-11",
      financingDeadline: "2026-04-01",
      appraisalDeadline: "2026-04-10",
      pipelineStage: "earnest_money",
      status: "active",
      propertyEmail: "tx_221bbaker@birdhouse.app",
      lastActivityDescription: "Contract intake - awaiting confirmation",
      lastActivityAt: now,
    },
  ];

  await db.insert(properties).values(sampleProperties);
  console.log(`🌱 Seeded ${sampleProperties.length} sample properties`);
}
