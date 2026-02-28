import { ParsedPurchaseContract } from "../schemas/parsedPurchaseContract.schema";

export type StreetViewStatus = "available" | "unavailable" | "error";

export type StreetViewCacheEntry = {
  status: StreetViewStatus;
  last_checked_at_iso: string;
  source_address: string | null;
  resolved_address: string | null;
  latitude: number | null;
  longitude: number | null;
  target_latitude: number | null;
  target_longitude: number | null;
  heading: number | null;
  pano_id: string | null;
  error_message: string | null;
};

export type StoredPropertyRecord = {
  id: string;
  property_name: string;
  created_at_iso: string;
  updated_at_iso: string;
  parsed_contract: ParsedPurchaseContract;
  street_view?: StreetViewCacheEntry;
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
  street_view: {
    status: StreetViewStatus;
    image_url: string | null;
    last_checked_at_iso: string | null;
    source_address: string | null;
    resolved_address: string | null;
    latitude: number | null;
    longitude: number | null;
    target_latitude: number | null;
    target_longitude: number | null;
    heading: number | null;
    pano_id: string | null;
  };
};

export type MockPropertiesFile = {
  properties: StoredPropertyRecord[];
};
