export interface Document {
  id: string;
  filename: string;
  mime_type: string;
  size_bytes: number | null;
  source: string | null;
  created_at: string;
  download_url: string;
}

export interface PropertyDocumentsProperty {
  id: string;
  property_name: string;
  property_email?: string | null;
  doc_hash?: string;
  address_full: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  purchase_price?: number | null;
  buyers?: string[];
  sellers?: string[];
  effective_date?: string | null;
  settlement_deadline?: string | null;
  created_at_iso?: string;
  updated_at_iso?: string;
  street_view: {
    status: string;
    image_url: string | null;
  };
  documents: Document[];
}

export interface PropertyDocumentsResponse {
  property: PropertyDocumentsProperty;
}
