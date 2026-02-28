/**
 * Utility for grouping emails into conversation threads.
 *
 * Strategy (in order):
 *   1. If In-Reply-To or References headers point to an existing message,
 *      use that message's thread_id.
 *   2. Fall back to normalized subject + property_id to group loosely.
 *   3. If nothing matches, create a new thread (use the message's own ID).
 */

import { createHash } from "crypto";

// -------------------------------------------------------------------------
// Subject normalisation
// -------------------------------------------------------------------------

/** Prefixes commonly added by mail clients when replying / forwarding. */
const REPLY_PREFIX_RE = /^(re|fwd?|aw|sv|vs|ref)\s*:\s*/i;

/**
 * Strip all reply / forward prefixes and collapse whitespace so that
 * "Re: Re: Fwd: Hello World" becomes "hello world".
 */
export function normalizeSubject(subject: string): string {
  let s = subject.trim();
  // Strip prefixes iteratively (handles "Re: Fwd: Re: …")
  let prev = "";
  while (prev !== s) {
    prev = s;
    s = s.replace(REPLY_PREFIX_RE, "");
  }
  return s.trim().toLowerCase();
}

// -------------------------------------------------------------------------
// Deterministic thread ID from subject + property
// -------------------------------------------------------------------------

/**
 * Build a deterministic thread ID from normalised subject + property ID.
 * Returns a short hex string prefixed with "thr_".
 */
export function subjectThreadId(
  normalizedSubject: string,
  propertyId: string,
): string {
  const hash = createHash("sha256")
    .update(`${propertyId}::${normalizedSubject}`)
    .digest("hex")
    .slice(0, 16);
  return `thr_${hash}`;
}
