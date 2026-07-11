import { distanceMeters } from './geo';
import { isPlausible } from './plausibleRanges';

test('distanceMeters is ~0 for the same point and grows with separation', () => {
  expect(distanceMeters(43.73, -71.56, 43.73, -71.56)).toBeCloseTo(0, 3);
  // roughly one degree of latitude ~= 111km
  expect(distanceMeters(43.73, -71.56, 44.73, -71.56)).toBeGreaterThan(100000);
});

test('isPlausible flags obviously out-of-range values', () => {
  expect(isPlausible('ph', 7.2)).toBe(true);
  expect(isPlausible('ph', 20)).toBe(false);
  expect(isPlausible('specific_gravity', 0.999)).toBe(true);
  expect(isPlausible('specific_gravity', 5)).toBe(false);
});
