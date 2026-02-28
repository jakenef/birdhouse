import type { Deal } from "../types/deal";
import { StatusPill, type StatusPillVariant } from "./StatusPill";

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

interface PropertyCardProps {
  deal: Deal;
  onOpenDeal: (dealId: string) => void;
}

function formatPrice(value: number): string {
  if (value <= 0) {
    return "TBD";
  }

  return currencyFormatter.format(value);
}

function formatDate(isoDate: string): string {
  const parsed = new Date(isoDate);
  if (Number.isNaN(parsed.getTime())) {
    return "TBD";
  }

  return dateFormatter.format(parsed);
}

function formatCityState(value: string): string {
  return value.replace(/\s+\d{5}(?:-\d{4})?$/, "");
}

function statusVariant(status: string): StatusPillVariant {
  const normalized = status.toLowerCase();
  if (normalized.includes("due diligence")) {
    return "blue";
  }

  if (normalized.includes("closing")) {
    return "purple";
  }

  if (normalized.includes("under contract")) {
    return "orange";
  }

  if (normalized.includes("due soon")) {
    return "orange";
  }

  if (normalized.includes("completed") || normalized.includes("closed")) {
    return "green";
  }

  if (normalized.includes("urgent")) {
    return "red";
  }

  return "gray";
}

function urgencyVariant(
  tone: Deal["urgencyTone"],
  label: string,
): StatusPillVariant {
  const normalizedLabel = label.toLowerCase();
  if (normalizedLabel.includes("completed")) {
    return "green";
  }

  if (normalizedLabel.includes("urgent")) {
    return "red";
  }

  if (normalizedLabel.includes("due soon")) {
    return "orange";
  }

  if (tone === "critical") {
    return "red";
  }

  if (tone === "info") {
    return "blue";
  }

  return "orange";
}

export function PropertyCard({ deal, onOpenDeal }: PropertyCardProps) {
  return (
    <button
      type="button"
      className="deal-card"
      onClick={() => onOpenDeal(deal.id)}
      aria-label={`Open property deal for ${deal.address}`}
    >
      <div className="deal-card__media" style={{ backgroundImage: `url(${deal.imageUrl})` }}>
        <div className="deal-card__media-overlay" />
        <div className="deal-card__pill-row">
          <StatusPill label={deal.status} variant={statusVariant(deal.status)} />
          <StatusPill
            label={deal.urgencyLabel}
            variant={urgencyVariant(deal.urgencyTone, deal.urgencyLabel)}
          />
        </div>
        <div className="deal-card__location">
          <h2>{deal.address}</h2>
          <p>
            <LocationPinIcon />
            {formatCityState(deal.cityState)}
          </p>
        </div>
      </div>

      <dl className="deal-card__summary">
        <div>
          <dt>Offer</dt>
          <dd className="deal-card__value deal-card__value--price">{formatPrice(deal.offerPrice)}</dd>
        </div>
        <div>
          <dt>Started</dt>
          <dd className="deal-card__value deal-card__value--date">{formatDate(deal.startedDateIso)}</dd>
        </div>
        <div>
          <dt>Close</dt>
          <dd className="deal-card__value deal-card__value--date">{formatDate(deal.closeDateIso)}</dd>
        </div>
      </dl>
    </button>
  );
}

function LocationPinIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 21s7-6.1 7-11a7 7 0 1 0-14 0c0 4.9 7 11 7 11Zm0-8.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5Z"
        fill="currentColor"
      />
    </svg>
  );
}
