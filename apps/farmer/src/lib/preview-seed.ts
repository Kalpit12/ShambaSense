import { shiftDays } from './dates';
import type { CheckResult } from './check-results';
import type { CropCheck, FarmData, JournalRecord, Plot } from './farm-store';

/** The pretend existing account in preview mode. */
export const PREVIEW_PHONE = '+254712345678';

// A believable season so the Home charts have something to show in the preview. Marked as sent,
// so the sync chip only counts what the person adds while trying the app.
export function previewSeed(): FarmData {
  const t = todayLocal();
  const at = (days: number) => shiftDays(t, -days);
  const stamp = (days: number) => `${at(days)}T08:00:00.000Z`;
  const plot = (id: string, name: string, crop: Plot['crop'], planted: number, acres: number): Plot => ({
    id, name, crop, plantedOn: at(planted), areaAcres: acres, createdAt: stamp(planted), sent: true,
  });
  const plots = [
    plot('seed-plot-maize', 'Lower maize', 'maize', 58, 1),
    plot('seed-plot-kale', 'Kitchen garden', 'kale', 44, 0.25),
    plot('seed-plot-beans', 'Beans by the road', 'beans', 96, 0.5),
    plot('seed-plot-tomato', 'Tomatoes by the tank', 'tomatoes', 52, 0.25),
  ];
  let n = 0;
  const rec = (days: number, kind: JournalRecord['kind'], plotId: string | null, note: string, amountKes: number | null, quantity: number | null = null, unit: JournalRecord['unit'] = null): JournalRecord => ({
    id: `seed-rec-${String(++n).padStart(2, '0')}`, kind, plotId, occurredOn: at(days), quantity, unit, amountKes, note, createdAt: stamp(days), sent: true,
  });
  const records = [
    rec(56, 'input', 'seed-plot-maize', 'DAP at planting', 7000, 2, 'bags'),
    rec(55, 'expense', 'seed-plot-maize', 'Planting labour', 1500),
    rec(44, 'input', 'seed-plot-kale', 'Sukuma seedlings', 300, 100, 'pieces'),
    rec(42, 'work', 'seed-plot-maize', 'First weeding', null),
    rec(30, 'expense', 'seed-plot-maize', 'Weeding labour', 1200),
    rec(24, 'input', 'seed-plot-maize', 'CAN top dressing', 3800, 1, 'bags'),
    rec(20, 'sale', 'seed-plot-kale', 'Sukuma at Njoro market', 750, 15, 'kg'),
    rec(13, 'harvest', 'seed-plot-beans', 'Beans harvested', null, 4, 'bags'),
    rec(12, 'expense', 'seed-plot-beans', 'Threshing labour', 800),
    rec(9, 'sale', 'seed-plot-beans', 'Beans to the co-op', 14000, 4, 'bags'),
    rec(7, 'sale', 'seed-plot-kale', 'Sukuma at Njoro market', 1500, 30, 'kg'),
    rec(5, 'expense', null, 'Transport to market', 400),
    rec(3, 'work', 'seed-plot-maize', 'Sprayed for fall armyworm', null),
    rec(2, 'sale', 'seed-plot-kale', 'Sukuma to a neighbour', 1000, 20, 'kg'),
  ].reverse();
  // Answered checks so the result screen has something to open. Their photos are drawings (`sample:`).
  const result = (days: number, r: Omit<CheckResult, 'at' | 'library'>): CheckResult => ({ ...r, library: 'preview', at: `${at(days)}T09:00:00.000Z` });
  const check = (id: string, days: number, c: Pick<CropCheck, 'crop' | 'plotId' | 'symptoms' | 'photoUri' | 'result' | 'askedAt' | 'reply'>): CropCheck => ({
    id, createdAt: stamp(days), sent: true, status: 'done', ...c,
  });
  const checks = [
    check('seed-check-1', 1, {
      crop: 'tomatoes', plotId: 'seed-plot-tomato', symptoms: ['spots'], photoUri: 'sample:early_blight',
      result: result(1, { state: 'possible_match', causes: [{ id: 'early_blight', likelihood: 'more_likely' }], preview: true }),
    }),
    check('seed-check-2', 6, {
      crop: 'maize', plotId: 'seed-plot-maize', symptoms: ['holes', 'insects'], photoUri: 'sample:chewed',
      result: result(6, { state: 'unsupported_crop', causes: [], preview: true }), askedAt: `${at(6)}T09:30:00.000Z`,
      reply: {
        kind: 'review_adjust', by: 'Wanjiru K.', at: `${at(3)}T07:15:00.000Z`, causeIds: ['fall_armyworm'], followUpDue: t,
        body: 'This looks like fall armyworm. Check the funnels early in the morning and crush the caterpillars you find. Send a new photo in 3 days so I can see if it is getting better.',
      },
    }),
  ];
  return { plots, records, checks, lastSyncAt: `${at(0)}T05:40:00.000Z` };
}

function todayLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
