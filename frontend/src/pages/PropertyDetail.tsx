import { useEffect, useState } from "react";

import { fetchDealById } from "../services/deals";
import type { Deal } from "../types/deal";

interface PropertyDetailProps {
  dealId: string;
  onBack: () => void;
}

export function PropertyDetail({ dealId, onBack }: PropertyDetailProps) {
  const [deal, setDeal] = useState<Deal | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadDeal = async () => {
      setLoading(true);
      const result = await fetchDealById(dealId);
      setDeal(result);
      setLoading(false);
    };

    void loadDeal();
  }, [dealId]);

  return (
    <section className="placeholder-page" aria-label="Property detail page">
      <button type="button" className="back-link" onClick={onBack}>
        <ChevronLeftIcon />
        Back to deals
      </button>

      {loading ? (
        <div className="state-card" role="status">
          Loading property...
        </div>
      ) : !deal ? (
        <div className="state-card">
          <h2>Property not found</h2>
          <p>We could not find a deal for ID "{dealId}".</p>
        </div>
      ) : (
        <div className="state-card">
          <h2>{deal.address}</h2>
          <p>{deal.cityState}</p>
          <p>
            This is a placeholder detail page for <code>/property/:id</code>.
          </p>
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
