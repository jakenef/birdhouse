import { useEffect, useState } from "react";

import { PropertyCard } from "../components/PropertyCard";
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
      <header className="home-header">
        <div className="home-header__icon" aria-hidden>
          <BirdhouseIcon />
        </div>
        <div>
          <h1>Birdhouse</h1>
          <p>{deals.length} active · sorted by recent</p>
        </div>
      </header>

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
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 3.2 5.5 8v10.2a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V8L12 3.2Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12.2" r="1.7" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M12 19v1.8m-2.6 0h5.2M3.9 10.1h2.2m12 0h2.1"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="m8.2 16.2 1.7-1.2 1.3.9"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
