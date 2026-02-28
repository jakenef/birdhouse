import { useEffect, useState } from "react";

import { PropertyHeader } from "../components/PropertyHeader";
import { fetchDealById } from "../services/deals";
import type { Deal } from "../types/deal";

interface PropertyPipelineProps {
  propertyId: string;
  onBackToHome: () => void;
}

function propertyLocation(deal: Deal | null): string {
  if (!deal || deal.cityState.trim().length === 0) {
    return "Location unavailable";
  }

  return deal.cityState;
}

export function PropertyPipeline({
  propertyId,
  onBackToHome,
}: PropertyPipelineProps) {
  const [deal, setDeal] = useState<Deal | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadDeal = async () => {
      setLoading(true);
      const result = await fetchDealById(propertyId);
      setDeal(result);
      setLoading(false);
    };

    void loadDeal();
  }, [propertyId]);

  return (
    <section className="property-page" aria-label="Property pipeline page">
      <PropertyHeader
        imageUrl={deal?.imageUrl ?? null}
        address={deal?.address ?? "Property"}
        location={propertyLocation(deal)}
      />

      <button type="button" className="back-link" onClick={onBackToHome}>
        <ChevronLeftIcon />
        Back to home
      </button>

      {loading ? (
        <div className="state-card state-card--loading" role="status" aria-live="polite">
          Loading property pipeline...
        </div>
      ) : (
        <div className="state-card">
          <h2>Pipeline</h2>
          <p>Pipeline timeline and tasks will appear here.</p>
        </div>
      )}
    </section>
  );
}

function ChevronLeftIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M14.72 5.22a1 1 0 0 1 .06 1.41L9.42 12l5.36 5.37a1 1 0 0 1-1.41 1.41l-6.07-6.07a1 1 0 0 1 0-1.42l6.07-6.07a1 1 0 0 1 1.35 0Z"
        fill="currentColor"
      />
    </svg>
  );
}
