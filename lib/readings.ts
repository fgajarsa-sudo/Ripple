// Sensor field list resolved against the reference Lovable prototype (see CLAUDE.md /
// migration 001's header comment) — not the build spec's prose, which listed dissolved
// oxygen + turbidity and omitted specific gravity.
export const SENSOR_PARAMETERS = [
  { key: 'temp_f', label: 'Temperature', unit: '°F', hint: 'Water surface temp' },
  { key: 'ph', label: 'pH', unit: '', hint: 'Acidity (0–14)' },
  { key: 'ec', label: 'EC', unit: 'µS/cm', hint: 'Electrical conductivity' },
  { key: 'tds', label: 'TDS', unit: 'ppm', hint: 'Total dissolved solids' },
  { key: 'salinity', label: 'Salt', unit: 'ppm', hint: 'Salinity' },
  { key: 'specific_gravity', label: 'SG', unit: '', hint: 'Specific gravity' },
  { key: 'orp', label: 'ORP', unit: 'mV', hint: 'Oxidation reduction' },
] as const;

export type SensorParameterKey = (typeof SENSOR_PARAMETERS)[number]['key'];

export type SensorReadings = Partial<Record<SensorParameterKey, number>>;

// Three decimal places for every parameter, per admin/field-tester feedback — keeps precision
// consistent across the board and, critically, keeps specific_gravity meaningful (its whole
// useful range sits between roughly 0.99 and 1.03, so anything coarser than ~3 decimals
// collapses distinct values together).
export const DECIMAL_PLACES: Record<SensorParameterKey, number> = {
  temp_f: 3,
  ph: 3,
  ec: 3,
  tds: 3,
  salinity: 3,
  specific_gravity: 3,
  orp: 3,
};

export function roundToParameterPrecision(key: SensorParameterKey, value: number): number {
  const factor = 10 ** DECIMAL_PLACES[key];
  return Math.round(value * factor) / factor;
}
