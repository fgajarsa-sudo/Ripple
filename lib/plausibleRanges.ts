import type { SensorParameterKey } from './readings';

// Generic plausibility bounds for soft (non-blocking) validation on the Data step — not to
// be confused with an org's `thresholds` rows, which drive urgency scoring server-side.
// These just catch obvious typos (e.g. a misplaced decimal) before submission.
export const PLAUSIBLE_RANGES: Record<SensorParameterKey, { min: number; max: number }> = {
  temp_f: { min: 32, max: 100 },
  ph: { min: 0, max: 14 },
  ec: { min: 0, max: 2000 },
  tds: { min: 0, max: 1000 },
  salinity: { min: 0, max: 500 },
  specific_gravity: { min: 0.9, max: 1.1 },
  orp: { min: -500, max: 500 },
};

export function isPlausible(key: SensorParameterKey, value: number): boolean {
  const range = PLAUSIBLE_RANGES[key];
  return value >= range.min && value <= range.max;
}
