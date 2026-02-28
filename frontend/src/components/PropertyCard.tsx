import type { Deal } from "../types/deal";

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
  // Append noon time to date-only strings to avoid UTC→local timezone shift
  const normalized = isoDate.includes("T") ? isoDate : `${isoDate}T12:00:00`;
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    return "TBD";
  }

  return dateFormatter.format(parsed);
}

function statusToneClass(status: string): string {
  const normalized = status.toLowerCase();
  if (normalized.includes("due diligence")) {
    return "deal-pill deal-pill--status deal-pill--status-info";
  }

  if (normalized.includes("closing")) {
    return "deal-pill deal-pill--status deal-pill--status-purple";
  }

  return "deal-pill deal-pill--status deal-pill--status-warning";
}

function urgencyToneClass(tone: Deal["urgencyTone"]): string {
  if (tone === "critical") {
    return "deal-pill deal-pill--urgency deal-pill--urgency-critical";
  }

  if (tone === "info") {
    return "deal-pill deal-pill--urgency deal-pill--urgency-info";
  }

  return "deal-pill deal-pill--urgency deal-pill--urgency-warning";
}

export function PropertyCard({ deal, onOpenDeal }: PropertyCardProps) {
  return (
    <button
      type="button"
      className="deal-card"
      onClick={() => onOpenDeal(deal.id)}
      aria-label={`Open property deal for ${deal.address}`}
    >
      <div
        className="deal-card__media"
        style={{ backgroundImage: `url(${deal.imageUrl})` }}
      >
        <div className="deal-card__media-overlay" />
        <div className="deal-card__pill-row">
          <span className={statusToneClass(deal.status)}>{deal.status}</span>
          <span className={urgencyToneClass(deal.urgencyTone)}>
            <AlertCircleIcon />
            {deal.urgencyLabel}
          </span>
        </div>
        <div className="deal-card__location">
          <h2>{deal.address}</h2>
          <p>
            <LocationPinIcon />
            {deal.cityState}
          </p>
        </div>
      </div>

      <dl className="deal-card__summary">
        <div>
          <dt>Offer</dt>
          <dd className="deal-card__value deal-card__value--price">
            {formatPrice(deal.offerPrice)}
          </dd>
        </div>
        <div>
          <dt>Started</dt>
          <dd className="deal-card__value deal-card__value--date">
            {formatDate(deal.startedDateIso)}
          </dd>
        </div>
        <div>
          <dt>
            <CalendarIcon />
            Close
          </dt>
          <dd className="deal-card__value deal-card__value--date">
            {formatDate(deal.closeDateIso)}
          </dd>
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

function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M7 2a1 1 0 0 1 1 1v1h8V3a1 1 0 1 1 2 0v1h1a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3h1V3a1 1 0 0 1 1-1Zm12 8H5v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-9ZM6 6a1 1 0 0 0-1 1v1h14V7a1 1 0 0 0-1-1H6Z"
        fill="currentColor"
      />
    </svg>
  );
}

function AlertCircleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 5.25a1 1 0 0 1 1 1V12a1 1 0 1 1-2 0V8.25a1 1 0 0 1 1-1Zm0 9.5a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5Z"
        fill="currentColor"
      />
    </svg>
  );
}
