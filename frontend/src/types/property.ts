export type PropertyStatus = "Under Contract" | "Purchased" | "Listed" | "Sold" | string;

export interface ApiProperty {
  id: string;
  property_name: string;
  address_full: string | null;
  purchase_price: number | null;
  effective_date: string | null;
  settlement_deadline: string | null;
  status?: PropertyStatus | null;
  next_deadline?: string | null;
}

export interface PropertiesResponse {
  properties: ApiProperty[];
}

export interface PropertyCardModel {
  id: string;
  address: string;
  status: PropertyStatus | null;
  offerPrice: number | null;
  closeDate: string | null;
  nextDeadline: string | null;
}
