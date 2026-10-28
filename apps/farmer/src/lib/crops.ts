import type { Crop } from './onboarding';

// Typical days from planting to first harvest for common Kenyan varieties at mid altitude.
// Only used to draw season progress, labelled "typical"; long-lived crops have no season ring.
export const TYPICAL_DAYS: Partial<Record<Crop, number>> = {
  maize: 120,
  beans: 90,
  potatoes: 105,
  tomatoes: 100,
  kale: 60,
  cabbage: 90,
  onions: 120,
};
