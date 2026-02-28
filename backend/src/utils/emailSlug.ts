/**
 * Common address words to skip when picking the meaningful slug word.
 */
const NOISE_WORDS = new Set([
  "st",
  "street",
  "ave",
  "avenue",
  "blvd",
  "boulevard",
  "dr",
  "drive",
  "ln",
  "lane",
  "rd",
  "road",
  "ct",
  "court",
  "pl",
  "place",
  "way",
  "cir",
  "circle",
  "trl",
  "trail",
  "pkwy",
  "parkway",
  "hwy",
  "highway",
  "apt",
  "suite",
  "ste",
  "unit",
  "bldg",
  "building",
  "fl",
  "floor",
  "n",
  "s",
  "e",
  "w",
  "ne",
  "nw",
  "se",
  "sw",
  "north",
  "south",
  "east",
  "west",
  "city",
  "park",
  "ut",
  "ca",
  "tx",
  "ny",
  "co",
  "az",
  "nv",
  "id",
  "wy",
]);

/**
 * Generate a short slug from an address: street number + first meaningful word.
 *
 * Examples:
 *   "6119 W Montauk Ln"       → "6119montauk"
 *   "742 Evergreen Terrace"   → "742evergre"
 *   "123 Oak St"              → "123oak"
 *   "  "                      → "property"
 */
export function generateEmailSlug(address: string | null | undefined): string {
  if (!address || address.trim().length === 0) {
    return "property";
  }

  const trimmed = address.trim().toLowerCase();

  // Extract leading street number (e.g. "6119" from "6119 W Montauk Ln")
  const numberMatch = trimmed.match(/^(\d+)/);
  const streetNumber = numberMatch ? numberMatch[1] : "";

  // Extract letter-only words, filter out noise
  const words = trimmed
    .split(/[^a-z]+/)
    .filter((w) => w.length > 0 && !NOISE_WORDS.has(w));

  const word = words.length > 0 ? words[0] : "";

  if (!streetNumber && !word) {
    return "property";
  }

  // Combine number + word, cap total at 12 chars
  const maxWordLen = Math.max(3, 12 - streetNumber.length);
  return `${streetNumber}${word.slice(0, maxWordLen)}` || "property";
}

/**
 * Build a full property email address from an address and domain.
 *
 * Example:
 *   buildPropertyEmail("6119 W Montauk Ln", "birdhouse.jakenef.click")
 *   → "6119montauk@birdhouse.jakenef.click"
 */
export function buildPropertyEmail(
  address: string | null | undefined,
  domain: string,
): string {
  const slug = generateEmailSlug(address);
  return `${slug}@${domain}`;
}
