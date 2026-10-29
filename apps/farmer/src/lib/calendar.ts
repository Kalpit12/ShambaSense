import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useSyncExternalStore } from 'react';

import { shiftDays } from './dates';
import type { Plot } from './farm-store';
import type { Crop } from './onboarding';

// Crop calendar: the main jobs of a season, counted in days from the planting date the farmer gave
// (for tomatoes, kale and cabbage that is the day of transplanting). Typical timings for Kenyan
// mid-altitude farms from general extension guidance; the co-op's agronomist should check them
// before the pilot. Steps show on Home when due, in full on the plot, and as a phone alert.

export type StepKind = 'weed' | 'topdress' | 'scout' | 'hill' | 'stake' | 'harvest';
export type CalendarStep = { key: string; kind: StepKind; day: number; pests?: string[] };

export const CALENDAR: Partial<Record<Crop, CalendarStep[]>> = {
  maize: [
    { key: 'weed1', kind: 'weed', day: 14 },
    { key: 'scout1', kind: 'scout', day: 21, pests: ['fall_armyworm'] },
    { key: 'topdress', kind: 'topdress', day: 35 },
    { key: 'weed2', kind: 'weed', day: 42 },
    { key: 'scout2', kind: 'scout', day: 56, pests: ['fall_armyworm', 'mln'] },
    { key: 'harvest', kind: 'harvest', day: 110 },
  ],
  beans: [
    { key: 'weed1', kind: 'weed', day: 14 },
    { key: 'scout1', kind: 'scout', day: 21, pests: ['aphids', 'bean_rust'] },
    { key: 'weed2', kind: 'weed', day: 30 },
    { key: 'scout2', kind: 'scout', day: 45, pests: ['angular_leaf_spot', 'bean_rust'] },
    { key: 'harvest', kind: 'harvest', day: 80 },
  ],
  potatoes: [
    { key: 'weed1', kind: 'weed', day: 21 },
    { key: 'hill1', kind: 'hill', day: 28 },
    { key: 'scout1', kind: 'scout', day: 35, pests: ['potato_blight'] },
    { key: 'hill2', kind: 'hill', day: 45 },
    { key: 'scout2', kind: 'scout', day: 55, pests: ['potato_blight', 'potato_wilt'] },
    { key: 'harvest', kind: 'harvest', day: 95 },
  ],
  tomatoes: [
    { key: 'stake', kind: 'stake', day: 14 },
    { key: 'scout1', kind: 'scout', day: 14, pests: ['late_blight', 'tuta'] },
    { key: 'topdress', kind: 'topdress', day: 30 },
    { key: 'scout2', kind: 'scout', day: 35, pests: ['early_blight', 'tuta'] },
    { key: 'scout3', kind: 'scout', day: 56, pests: ['late_blight', 'septoria'] },
    { key: 'harvest', kind: 'harvest', day: 70 },
  ],
  kale: [
    { key: 'weed1', kind: 'weed', day: 14 },
    { key: 'topdress', kind: 'topdress', day: 21 },
    { key: 'scout1', kind: 'scout', day: 21, pests: ['aphids', 'black_rot'] },
    { key: 'harvest', kind: 'harvest', day: 42 },
  ],
  cabbage: [
    { key: 'weed1', kind: 'weed', day: 14 },
    { key: 'topdress', kind: 'topdress', day: 21 },
    { key: 'scout1', kind: 'scout', day: 21, pests: ['diamondback', 'aphids'] },
    { key: 'scout2', kind: 'scout', day: 45, pests: ['diamondback', 'black_rot'] },
    { key: 'harvest', kind: 'harvest', day: 85 },
  ],
};

/** A step is shown as due from the day before until 6 days after; later than that it counts as missed. */
const EARLY = 1;
const LATE = 6;

export type StepState = 'done' | 'due' | 'upcoming' | 'missed';
export type PlotStep = CalendarStep & { plot: Plot; date: string; state: StepState; id: string };

/** The id changes when the planting date does, so a new season starts with nothing ticked. */
export const stepId = (plot: Plot, key: string) => `${plot.id}:${plot.plantedOn}:${key}`;

export function plotSteps(plot: Plot, today: string, done: Set<string>): PlotStep[] {
  const steps = plot.plantedOn ? CALENDAR[plot.crop] : undefined;
  if (!steps) return [];
  return steps.map((s) => {
    const date = shiftDays(plot.plantedOn!, s.day);
    const id = stepId(plot, s.key);
    const state: StepState = done.has(id)
      ? 'done'
      : today > shiftDays(date, LATE)
        ? 'missed'
        : today >= shiftDays(date, -EARLY)
          ? 'due'
          : 'upcoming';
    return { ...s, plot, date, state, id };
  });
}

// Ticked steps, kept on this phone per account. One shared copy so Home, the plot screen and the
// alerts all see a tick at once.
let doneCache: { owner: string; ids: Set<string> } = { owner: '', ids: new Set() };
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => (listeners.add(l), () => listeners.delete(l));
const keyOf = (owner: string) => `shambasense.calendar.v1.${owner}`;

export function useCalendarDone(owner: string | undefined) {
  const ids = useSyncExternalStore(subscribe, () => (doneCache.owner === owner ? doneCache.ids : EMPTY), () => EMPTY);
  useEffect(() => {
    if (!owner || doneCache.owner === owner) return;
    AsyncStorage.getItem(keyOf(owner))
      .then((raw) => {
        doneCache = { owner, ids: new Set(raw ? (JSON.parse(raw) as string[]) : []) };
      })
      .catch(() => {
        doneCache = { owner, ids: new Set() };
      })
      .finally(() => listeners.forEach((l) => l()));
  }, [owner]);
  const markDone = useCallback(
    (id: string) => {
      if (!owner || doneCache.owner !== owner) return;
      doneCache = { owner, ids: new Set([...doneCache.ids, id]) };
      listeners.forEach((l) => l());
      AsyncStorage.setItem(keyOf(owner), JSON.stringify([...doneCache.ids])).catch(() => {});
    },
    [owner],
  );
  return { done: ids, markDone };
}
const EMPTY = new Set<string>();
