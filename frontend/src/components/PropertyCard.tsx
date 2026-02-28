import {
  useEffect,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from "react";

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
  // Append noon time to date-only strings to avoid UTC→local timezone shift
  const normalized = isoDate.includes("T") ? isoDate : `${isoDate}T12:00:00`;
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    return "TBD";
  }

  return dateFormatter.format(parsed);
}

function formatCityState(value: string): string {
  return value.replace(/\s+\d{5}(?:-\d{4})?$/, "");
}

function formatInboxEmail(value: string): string {
  const email = value.trim();
  const atIndex = email.lastIndexOf("@");

  if (atIndex <= 0) {
    return email;
  }

  const localPart = email.slice(0, atIndex);
  const domain = email.slice(atIndex);

  if (localPart.length <= 18) {
    return email;
  }

  return `${localPart.slice(0, 18)}...${domain}`;
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
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) {
      return;
    }

    const timeoutId = window.setTimeout(() => setCopied(false), 1400);
    return () => window.clearTimeout(timeoutId);
  }, [copied]);

  const copyInbox = async (
    event: MouseEvent<HTMLSpanElement> | KeyboardEvent<HTMLSpanElement>,
  ) => {
    event.preventDefault();
    event.stopPropagation();

    if (!deal.propertyEmail) {
      return;
    }

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(deal.propertyEmail);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = deal.propertyEmail;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

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
          <dt>Close</dt>
          <dd className="deal-card__value deal-card__value--date">
            {formatDate(deal.closeDateIso)}
          </dd>
        </div>
      </dl>

      <p className="deal-card__inbox">
        <MailIcon />
        <span className="deal-card__inbox-label">Property inbox</span>
        <span className="deal-card__inbox-value" title={deal.propertyEmail || "Unavailable"}>
          {deal.propertyEmail ? formatInboxEmail(deal.propertyEmail) : "Unavailable"}
        </span>
        {deal.propertyEmail ? (
          <span
            className={`deal-card__inbox-copy${copied ? " is-copied" : ""}`}
            role="button"
            tabIndex={0}
            aria-label={copied ? "Copied inbox email" : "Copy inbox email"}
            title={copied ? "Copied" : "Copy inbox email"}
            onClick={(event) => void copyInbox(event)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                void copyInbox(event);
              }
            }}
          >
            {copied ? <CheckIcon /> : <CopyIcon />}
          </span>
        ) : null}
      </p>
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

function MailIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M4 7.5A1.5 1.5 0 0 1 5.5 6h13A1.5 1.5 0 0 1 20 7.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 16.5v-9Zm1.7.2 6.3 4.7 6.3-4.7"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect
        x="9"
        y="9"
        width="10"
        height="10"
        rx="1.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M14 9V7.2A1.2 1.2 0 0 0 12.8 6H6.2A1.2 1.2 0 0 0 5 7.2v6.6A1.2 1.2 0 0 0 6.2 15H9"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="m5.5 12.4 4.1 4.1 8.9-8.9"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
