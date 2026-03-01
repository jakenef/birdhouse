import type { Deal, UrgencyTone } from "../types/deal";

type ApiStreetView = {
  status: string;
  image_url: string | null;
};

type ApiProperty = {
  id: string;
  property_name: string;
  property_email?: string | null;
  propertyEmail?: string | null;
  address_full: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  purchase_price: number | null;
  effective_date: string | null;
  settlement_deadline: string | null;
  pipeline_stage: string;
  created_at_iso: string;
  updated_at_iso: string;
  street_view?: ApiStreetView;
};

type ApiPropertiesResponse = {
  properties: ApiProperty[];
};

const DEAL_IMAGES = [
  "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1400&q=80",
  "https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?auto=format&fit=crop&w=1400&q=80",
  "https://images.unsplash.com/photo-1600585154526-990dced4db0d?auto=format&fit=crop&w=1400&q=80",
  "https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?auto=format&fit=crop&w=1400&q=80",
  "https://images.unsplash.com/photo-1600607687644-c7f34b5b4dcd?auto=format&fit=crop&w=1400&q=80",
  "https://images.unsplash.com/photo-1572120360610-d971b9d7767c?auto=format&fit=crop&w=1400&q=80",
];

const MOCK_DEALS: Deal[] = [
  {
    id: "deal-maple-ridge",
    address: "4821 Maple Ridge Dr",
    cityState: "Austin, TX 78701",
    propertyEmail: "4821-maple-ridge-dr@bronaaelda.resend.app",
    imageUrl: DEAL_IMAGES[0],
    status: "Under Contract",
    urgencyLabel: "4d to close",
    urgencyTone: "critical",
    offerPrice: 485000,
    closeDateIso: "2026-03-14",
    startedDateIso: "2026-01-12",
    updatedAtIso: "2026-02-27T20:00:00.000Z",
    nextAction: "Review final walkthrough packet before close.",
  },
  {
    id: "deal-sycamore",
    address: "2204 Sycamore St",
    cityState: "Nashville, TN 37201",
    propertyEmail: "2204-sycamore-st@bronaaelda.resend.app",
    imageUrl: DEAL_IMAGES[1],
    status: "Closing",
    urgencyLabel: "1d to close",
    urgencyTone: "critical",
    offerPrice: 540000,
    closeDateIso: "2026-03-07",
    startedDateIso: "2025-12-20",
    updatedAtIso: "2026-02-27T19:00:00.000Z",
    nextAction: "Confirm wire instructions with title company.",
  },
  {
    id: "deal-westfield",
    address: "102 Westfield Ave",
    cityState: "Denver, CO 80203",
    propertyEmail: "102-westfield-ave@bronaaelda.resend.app",
    imageUrl: DEAL_IMAGES[2],
    status: "Due Diligence",
    urgencyLabel: "Due soon",
    urgencyTone: "warning",
    offerPrice: 620000,
    closeDateIso: "2026-03-28",
    startedDateIso: "2026-02-01",
    updatedAtIso: "2026-02-27T16:00:00.000Z",
    nextAction: "Collect HOA documents and upload disclosures.",
  },
  {
    id: "deal-pinecrest",
    address: "89 Pinecrest Ave",
    cityState: "Salt Lake City, UT 84103",
    propertyEmail: "89-pinecrest-ave@bronaaelda.resend.app",
    imageUrl: DEAL_IMAGES[3],
    status: "Under Contract",
    urgencyLabel: "6d to close",
    urgencyTone: "critical",
    offerPrice: 455000,
    closeDateIso: "2026-03-16",
    startedDateIso: "2026-01-30",
    updatedAtIso: "2026-02-27T14:00:00.000Z",
    nextAction: "Finalize inspection response addendum.",
  },
  {
    id: "deal-harbor",
    address: "14 Harbor View Pl",
    cityState: "Seattle, WA 98109",
    propertyEmail: "14-harbor-view-pl@bronaaelda.resend.app",
    imageUrl: DEAL_IMAGES[4],
    status: "Due Diligence",
    urgencyLabel: "Due soon",
    urgencyTone: "warning",
    offerPrice: 735000,
    closeDateIso: "2026-04-03",
    startedDateIso: "2026-02-04",
    updatedAtIso: "2026-02-27T12:00:00.000Z",
    nextAction: "Order sewer scope and schedule appraisal.",
  },
  {
    id: "deal-brighton",
    address: "301 Brighton Lane",
    cityState: "Scottsdale, AZ 85251",
    propertyEmail: "301-brighton-lane@bronaaelda.resend.app",
    imageUrl: DEAL_IMAGES[5],
    status: "Under Contract",
    urgencyLabel: "8d to close",
    urgencyTone: "warning",
    offerPrice: 510000,
    closeDateIso: "2026-03-18",
    startedDateIso: "2026-01-25",
    updatedAtIso: "2026-02-27T09:00:00.000Z",
    nextAction: "Confirm tenant estoppel and lease amendments.",
  },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isApiProperty(value: unknown): value is ApiProperty {
  if (!isRecord(value)) {
    return false;
  }

  const propertyEmailValue = value.property_email;
  const propertyEmailCamelValue = value.propertyEmail;
  const hasValidPropertyEmail =
    propertyEmailValue === undefined ||
    typeof propertyEmailValue === "string" ||
    propertyEmailValue === null;
  const hasValidPropertyEmailCamel =
    propertyEmailCamelValue === undefined ||
    typeof propertyEmailCamelValue === "string" ||
    propertyEmailCamelValue === null;

  return (
    typeof value.id === "string" &&
    typeof value.property_name === "string" &&
    hasValidPropertyEmail &&
    hasValidPropertyEmailCamel &&
    "purchase_price" in value &&
    "settlement_deadline" in value &&
    typeof value.created_at_iso === "string" &&
    typeof value.updated_at_iso === "string"
  );
}

function isApiPropertiesResponse(
  value: unknown,
): value is ApiPropertiesResponse {
  if (!isRecord(value) || !Array.isArray(value.properties)) {
    return false;
  }

  return value.properties.every((property) => isApiProperty(property));
}

function daysUntil(isoDate: string): number {
  const now = Date.now();
  const normalized = isoDate.includes("T") ? isoDate : `${isoDate}T12:00:00`;
  const target = new Date(normalized).getTime();
  if (Number.isNaN(target)) {
    return 10;
  }

  return Math.max(1, Math.ceil((target - now) / (1000 * 60 * 60 * 24)));
}

function addDaysIso(isoDate: string, days: number): string {
  const normalized = isoDate.includes("T") ? isoDate : `${isoDate}T12:00:00`;
  const base = new Date(normalized);
  if (Number.isNaN(base.getTime())) {
    return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
  }

  base.setDate(base.getDate() + days);
  return base.toISOString();
}

function urgencyFromDays(days: number): { label: string; tone: UrgencyTone } {
  if (days <= 2) {
    return { label: `${days}d to close`, tone: "critical" };
  }

  if (days <= 8) {
    return { label: `${days}d to close`, tone: "warning" };
  }

  return { label: "Due soon", tone: "warning" };
}

function mapPipelineStageToStatus(pipelineStage: string): string {
  switch (pipelineStage) {
    case "earnest_money":
      return "Earnest";
    case "closing":
      return "Closing";
    case "inspections":
    case "due_diligence_inspection":
      return "Due Diligence";
    case "financing":
      return "Financing";
    case "appraisal":
      return "Appraisal";
    case "title_escrow":
      return "Title & Escrow";
    default:
      return "Under Contract";
  }
}

function formatCityState(
  city: string | null,
  state: string | null,
  zip: string | null,
): string {
  const location = [city, state].filter((value): value is string =>
    Boolean(value?.trim()),
  );
  const cityState = location.join(", ");
  if (!cityState && !zip) {
    return "Location unavailable";
  }

  return [cityState, zip]
    .filter((value): value is string => Boolean(value))
    .join(" ");
}

function mapApiPropertyToDeal(property: ApiProperty, index: number): Deal {
  const imageUrl =
    property.street_view?.status === "available" &&
    property.street_view.image_url
      ? property.street_view.image_url
      : DEAL_IMAGES[index % DEAL_IMAGES.length];
  const closeDateIso =
    property.settlement_deadline &&
    property.settlement_deadline.trim().length > 0
      ? property.settlement_deadline
      : addDaysIso(property.created_at_iso, 30).slice(0, 10);
  const startedDateIso =
    property.effective_date && property.effective_date.trim().length > 0
      ? property.effective_date
      : property.created_at_iso.slice(0, 10);
  const daysToClose = daysUntil(closeDateIso);
  const urgency = urgencyFromDays(daysToClose);

  const rawPropertyEmail = property.property_email ?? property.propertyEmail;
  const propertyEmail =
    typeof rawPropertyEmail === "string" &&
    rawPropertyEmail.trim().includes("@")
      ? rawPropertyEmail.trim()
      : null;

  return {
    id: property.id,
    address: property.address_full || property.property_name,
    cityState: formatCityState(property.city, property.state, property.zip),
    propertyEmail,
    imageUrl,
    status: mapPipelineStageToStatus(property.pipeline_stage),
    urgencyLabel: urgency.label,
    urgencyTone: urgency.tone,
    offerPrice: property.purchase_price ?? 0,
    closeDateIso,
    startedDateIso,
    updatedAtIso: property.updated_at_iso,
    nextAction:
      daysToClose <= 3
        ? "Confirm title docs and closing disclosures."
        : "Review timeline and clear remaining contingencies.",
  };
}

export async function fetchDeals(): Promise<Deal[]> {
  try {
    const response = await fetch("/api/properties");
    if (!response.ok) {
      throw new Error(`Failed to load deals: ${response.status}`);
    }

    const payload: unknown = await response.json();
    if (!isApiPropertiesResponse(payload)) {
      throw new Error("Invalid properties response.");
    }

    return payload.properties
      .filter((property) => {
        // Blacklist properties with email starting with "property@" (failed parsing)
        const email = property.property_email ?? property.propertyEmail;
        return !email || !email.toLowerCase().startsWith("property@");
      })
      .map((property, index) => mapApiPropertyToDeal(property, index))
      .sort(
        (a, b) =>
          new Date(b.updatedAtIso).getTime() -
          new Date(a.updatedAtIso).getTime(),
      );
  } catch {
    return [...MOCK_DEALS];
  }
}

export async function fetchDealById(dealId: string): Promise<Deal | null> {
  const deals = await fetchDeals();
  return deals.find((deal) => deal.id === dealId) ?? null;
}
