export interface Document {
  id: string;
  filename: string;
  mime_type: string;
  size_bytes: number | null;
  source: string | null;
  ai_summary: {
    title: string;
    summary: string;
    highlights: string[];
  } | null;
  created_at: string;
  download_url: string;
}

export interface PropertyDocumentsProperty {
  id: string;
  property_name: string;
  address_full: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  street_view: {
    status: string;
    image_url: string | null;
  };
  documents: Document[];
}

export interface PropertyDocumentsResponse {
  property: PropertyDocumentsProperty;
}
