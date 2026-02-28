export type ParsedPossessionTiming = {
  timing: string | null;
  hours_after_recording: number | null;
  days_after_recording: number | null;
};

export function parsePossessionTiming(
  input: string | null | undefined,
): ParsedPossessionTiming {
  const timing = input?.trim() || null;

  if (!timing) {
    return {
      timing: null,
      hours_after_recording: null,
      days_after_recording: null,
    };
  }

  const hoursMatch = timing.match(/(\d+)\s*hours?\s+after\s+recording/i);
  const daysMatch = timing.match(/(\d+)\s*days?\s+after\s+recording/i);

  return {
    timing,
    hours_after_recording: hoursMatch ? Number(hoursMatch[1]) : null,
    days_after_recording: daysMatch ? Number(daysMatch[1]) : null,
  };
}
