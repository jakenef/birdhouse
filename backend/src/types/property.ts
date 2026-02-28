import { ParsedPurchaseContract } from "../schemas/parsedPurchaseContract.schema";

export type StoredPropertyRecord = {
  id: string;
  property_name: string;
  created_at_iso: string;
  updated_at_iso: string;
  parsed_contract: ParsedPurchaseContract;
};

export type PropertyCardDto = {
  id: string;
  property_name: string;
  doc_hash: string;
  address_full: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  purchase_price: number | null;
  buyers: string[];
  sellers: string[];
  effective_date: string | null;
  settlement_deadline: string | null;
  created_at_iso: string;
  updated_at_iso: string;
};

export type MockPropertiesFile = {
  properties: StoredPropertyRecord[];
};
