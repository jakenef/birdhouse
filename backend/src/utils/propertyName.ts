type PropertyNameSource = {
  property: {
    address_full: string | null;
    city: string | null;
    state: string | null;
  };
};

export function derivePropertyName(source: PropertyNameSource): string {
  const address = source.property.address_full?.trim();
  if (address) {
    return address;
  }

  const city = source.property.city?.trim();
  const state = source.property.state?.trim();
  const cityState = [city, state].filter(Boolean).join(", ");

  return cityState || "Unnamed Property";
}
