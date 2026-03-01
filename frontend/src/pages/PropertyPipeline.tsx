import { useEffect, useState } from "react";

import { PipelinePage } from "../components/pipeline/PipelinePage";
import { PropertyHeader } from "../components/PropertyHeader";
import { PropertyHomeButton } from "../components/PropertyHomeButton";
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

  useEffect(() => {
    const loadDeal = async () => {
      const result = await fetchDealById(propertyId);
      setDeal(result);
    };

    void loadDeal();
  }, [propertyId]);

  return (
    <section className="property-page" aria-label="Property pipeline page">
      <PropertyHomeButton onClick={onBackToHome} />

      <PropertyHeader
        imageUrl={deal?.imageUrl ?? null}
        address={deal?.address ?? "Property"}
        location={propertyLocation(deal)}
      />

      <PipelinePage propertyId={propertyId} />
    </section>
  );
}
