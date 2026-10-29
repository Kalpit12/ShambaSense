import { TYPICAL_DAYS } from './crops';
import { parseIso, shiftDays, weeksSince } from './dates';
import type { JournalRecord, Plot } from './farm-store';
import type { FarmSize } from './onboarding';

/** How far a plot is into a typical season. Null when not planted or the crop has no season. */
export function seasonOf(plot: Plot, today: string) {
  const typical = TYPICAL_DAYS[plot.crop];
  if (!plot.plantedOn || !typical || plot.plantedOn > today) return null;
  const days = (parseIso(today).getTime() - parseIso(plot.plantedOn).getTime()) / 86400000;
  return {
    value: Math.min(1, Math.max(0, days / typical)),
    week: weeksSince(plot.plantedOn) + 1,
    totalWeeks: Math.round(typical / 7),
    weeksLeft: Math.ceil((typical - days) / 7),
  };
}

/** Sold and spent for one plot over the last 8 weeks. */
export function plotMoney(records: JournalRecord[], plotId: string, today: string) {
  const start = shiftDays(today, -55);
  let sold = 0;
  let spent = 0;
  for (const r of records) {
    if (r.plotId !== plotId || r.amountKes == null || r.occurredOn < start) continue;
    if (r.kind === 'sale') sold += r.amountKes;
    else if (r.kind === 'input' || r.kind === 'expense') spent += r.amountKes;
  }
  return { sold, spent };
}

/** Upper end of the farm-size answer, in acres, for "2.5 of about 5 acres". */
export function farmAcres(size: FarmSize | undefined) {
  return size ? ({ under1: 1, '1to2': 2, '2to5': 5 } as Partial<Record<FarmSize, number>>)[size] ?? null : null;
}

// One colour per plot: the bright one on the dark hero, the deep one on light cards.
export const PLOT_COLORS = ['#C4EF5A', '#E9E4CF', '#9CCBE6', '#F2B880'];
export const PLOT_TINTS = ['#0F3D26', '#7A6F4E', '#2A6F97', '#9A5B1E'];
