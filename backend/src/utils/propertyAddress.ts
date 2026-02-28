type PropertyAddressSource = {
  address_full: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
};

function clean(value: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeSegment(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function includesSegment(base: string, segment: string): boolean {
  return normalizeSegment(base).includes(normalizeSegment(segment));
}

export function buildStreetViewLookupAddress(
  source: PropertyAddressSource,
): string | null {
  const addressFull = clean(source.address_full);
  const city = clean(source.city);
  const state = clean(source.state);
  const zip = clean(source.zip);

  if (!addressFull && !city && !state && !zip) {
    return null;
  }

  const segments: string[] = [];

  if (addressFull) {
    segments.push(addressFull);
  }

  if (city) {
    const current = segments.join(", ");
    if (!current || !includesSegment(current, city)) {
      segments.push(city);
    }
  }

  const stateZip = [state, zip].filter((value): value is string => Boolean(value)).join(" ");
  if (stateZip) {
    const current = segments.join(", ");
    if (!current || !includesSegment(current, stateZip)) {
      segments.push(stateZip);
    }
  }

  return segments.join(", ");
}
