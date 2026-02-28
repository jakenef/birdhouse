/**
 * Generate a URL-safe slug from an address for use in email local parts.
 *
 * Examples:
 *   "6119 W Montauk Ln" → "6119-w-montauk-ln"
 *   "742 Evergreen Terrace" → "742-evergreen-terrace"
 *   "123  Main   St." → "123-main-st"
 */
export function generateEmailSlug(address: string | null | undefined): string {
  if (!address || address.trim().length === 0) {
    return "unnamed";
  }

  return (
    address
      .toLowerCase()
      .trim()
      // Replace non-alphanumeric characters with hyphens
      .replace(/[^a-z0-9]+/g, "-")
      // Remove leading/trailing hyphens
      .replace(/^-+|-+$/g, "")
      // Collapse multiple hyphens
      .replace(/-+/g, "-") ||
    // Fallback if somehow empty after processing
    "unnamed"
  );
}

/**
 * Build a full property email address from an address and domain.
 *
 * Example:
 *   buildPropertyEmail("6119 W Montauk Ln", "bronaaelda.resend.app")
 *   → "6119-w-montauk-ln@bronaaelda.resend.app"
 */
export function buildPropertyEmail(
  address: string | null | undefined,
  domain: string,
): string {
  const slug = generateEmailSlug(address);
  return `${slug}@${domain}`;
}
