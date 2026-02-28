export type DealStatus = "Under Contract" | "Closing" | "Due Diligence" | string;

export type UrgencyTone = "critical" | "warning" | "info";

export interface Deal {
  id: string;
  address: string;
  cityState: string;
  imageUrl: string;
  status: DealStatus;
  urgencyLabel: string;
  urgencyTone: UrgencyTone;
  offerPrice: number;
  closeDateIso: string;
  startedDateIso: string;
  updatedAtIso: string;
  nextAction: string;
}
