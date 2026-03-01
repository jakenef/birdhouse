import { useEffect, useState } from "react";

import { PropertyCard } from "../components/PropertyCard";
import { TopBar } from "../components/TopBar";
import { fetchDeals } from "../services/deals";
import type { Deal } from "../types/deal";

interface HomeProps {
  onOpenDeal: (dealId: string) => void;
}

export function Home({ onOpenDeal }: HomeProps) {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const loadDeals = async () => {
      setLoading(true);
      setErrorMessage(null);

      try {
        const response = await fetchDeals();
        setDeals(response);
      } catch {
        setErrorMessage("Unable to load deals.");
      } finally {
        setLoading(false);
      }
    };

    void loadDeals();
  }, []);

  return (
    <section className="home-page" aria-label="Home page">
      <TopBar
        title="Birdhouse"
        subtitle={`${deals.length} active · sorted by recent`}
        leftIcon={<BirdhouseIcon />}
        leftIconStyle="standalone"
      />

      {errorMessage && <p className="inline-alert">{errorMessage}</p>}

      {loading ? (
        <div className="state-card state-card--loading" role="status" aria-live="polite">
          Loading deals...
        </div>
      ) : deals.length === 0 ? (
        <div className="state-card" role="status" aria-live="polite">
          <h2>No deals yet</h2>
          <p>Add your first property to start execution tracking.</p>
        </div>
      ) : (
        <div className="deal-list">
          {deals.map((deal) => (
            <PropertyCard key={deal.id} deal={deal} onOpenDeal={onOpenDeal} />
          ))}
        </div>
      )}
    </section>
  );
}

function BirdhouseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none">
      <path
        d="M3.9 9.4 12 3.5l8.1 5.9"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M6.4 9.2v8.2c0 .8.6 1.4 1.4 1.4h8.4c.8 0 1.4-.6 1.4-1.4V9.2"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12.2" r="2.2" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="11.45" cy="11.8" r="0.34" fill="currentColor" />
      <path
        d="M13 12.15 13.9 11.85 13 11.45"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M9.2 19.9h5.6" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}
