import type { SupabaseClient } from '@supabase/supabase-js';

import { causeById } from './causes';
import type { Org } from './coop';
import { samplePlots } from './tasks';
import type { Crop, Severity } from './types';

// Scouting rounds (design.md §10). A round is one plot on one day: how many plants were checked and
// how many showed each problem. The outbreak watch adds rounds up by ward and problem, using each
// farm's latest round, so one bad plot does not look like an outbreak and an old round does not
// hide a new one.

export type Finding = { causeId: string; affected: number; severity: Severity };
export type Round = {
  id: string;
  farmerId: string;
  farmerName: string;
  ward: string;
  plotId: string | null;
  plotName: string | null;
  taskId: string | null;
  crop: Crop;
  /** YYYY-MM-DD */
  observedOn: string;
  checked: number;
  note: string | null;
  scoutId: string | null;
  scoutName: string | null;
  createdAt: string;
  findings: Finding[];
};

export type Draft = {
  farmerId: string;
  plotId: string | null;
  taskId: string | null;
  crop: Crop;
  observedOn: string;
  checked: number;
  note: string;
  findings: Finding[];
};

export type ScoutApi = {
  save: (d: Draft) => Promise<{ id?: string; error?: string }>;
  remove: (id: string) => Promise<string | null>;
};

export const PERIODS = [
  { days: 14, label: 'Last 14 days' },
  { days: 30, label: 'Last 30 days' },
  { days: 90, label: 'Last 90 days' },
] as const;

export function scoutError(message: string) {
  if (/more_affected_than_checked/.test(message)) return 'A count is higher than the number of plants checked.';
  if (/farmer_not_linked/.test(message)) return 'This farmer is no longer in the co-op.';
  if (/bad_date/.test(message)) return 'The date cannot be in the future.';
  if (/only the co-op team/.test(message)) return 'Viewers cannot log scouting.';
  if (/only the scout or an admin/.test(message)) return 'Only the person who logged it, or an admin, can remove it.';
  return message;
}

export const share = (f: Finding, r: Pick<Round, 'checked'>) => f.affected / r.checked;
export const pct = (x: number) => `${Math.round(x * 100)}%`;
const RANK: Record<Severity, number> = { low: 0, medium: 1, high: 2 };

export type Level = 'outbreak' | 'watch' | 'low';
export type WatchRow = {
  key: string;
  ward: string;
  causeId: string;
  crop: Crop;
  farmsAffected: number;
  farmsScouted: number;
  /** Average share of plants affected, over each affected farm's latest round. */
  avgShare: number;
  worst: Severity;
  /** Change in average share against each farm's round before, when there is one. */
  trend: number | null;
  level: Level;
  lastSeen: string;
};

/**
 * Outbreak watch. Per ward and problem: farms whose latest round of that crop found it, against all
 * farms scouted for that crop in the ward. Outbreak: two or more farms with at least 1 plant in 5,
 * or any farm at 1 in 3 with high severity. Watch: 1 plant in 10, or medium severity.
 */
export function watch(rounds: Round[]): WatchRow[] {
  // Latest and previous round for each farm, ward and crop.
  const byFarm = new Map<string, Round[]>();
  for (const r of rounds) {
    const k = `${r.ward}|${r.crop}|${r.farmerId}`;
    byFarm.set(k, [...(byFarm.get(k) ?? []), r]);
  }
  const scouted = new Map<string, number>();
  const groups = new Map<string, { ward: string; crop: Crop; causeId: string; shares: number[]; before: number[]; worst: Severity; lastSeen: string }>();
  for (const [k, list] of byFarm) {
    const [ward, crop] = k.split('|');
    scouted.set(`${ward}|${crop}`, (scouted.get(`${ward}|${crop}`) ?? 0) + 1);
    const sorted = [...list].sort((a, b) => b.observedOn.localeCompare(a.observedOn) || b.createdAt.localeCompare(a.createdAt));
    const [latest, previous] = sorted;
    for (const f of latest.findings) {
      const g = `${ward}|${crop}|${f.causeId}`;
      const row = groups.get(g) ?? { ward, crop: crop as Crop, causeId: f.causeId, shares: [], before: [], worst: 'low' as Severity, lastSeen: latest.observedOn };
      row.shares.push(share(f, latest));
      if (previous) {
        const p = previous.findings.find((x) => x.causeId === f.causeId);
        row.before.push(p ? share(p, previous) : 0);
      }
      if (RANK[f.severity] > RANK[row.worst]) row.worst = f.severity;
      if (latest.observedOn > row.lastSeen) row.lastSeen = latest.observedOn;
      groups.set(g, row);
    }
  }
  const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  return [...groups.entries()]
    .map(([key, g]) => {
      const avgShare = avg(g.shares);
      const high = g.shares.filter((s) => s >= 0.2).length;
      const level: Level =
        high >= 2 || (g.worst === 'high' && Math.max(...g.shares) >= 1 / 3) ? 'outbreak' : avgShare >= 0.1 || g.worst !== 'low' ? 'watch' : 'low';
      return {
        key,
        ward: g.ward,
        causeId: g.causeId,
        crop: g.crop,
        farmsAffected: g.shares.length,
        farmsScouted: scouted.get(`${g.ward}|${g.crop}`) ?? g.shares.length,
        avgShare,
        worst: g.worst,
        trend: g.before.length ? avgShare - avg(g.before) : null,
        level,
        lastSeen: g.lastSeen,
      };
    })
    .sort((a, b) => ({ outbreak: 0, watch: 1, low: 2 })[a.level] - ({ outbreak: 0, watch: 1, low: 2 })[b.level] || b.avgShare - a.avgShare);
}

export const causeName = (id: string) => causeById(id)?.en ?? id;

// Connected mode ------------------------------------------------------------------------------

const sinceDay = (days: number) => new Date(Date.now() - days * 86400_000).toLocaleDateString('sv-SE', { timeZone: 'Africa/Nairobi' });

export async function loadRounds(client: SupabaseClient, org: Org, days: number): Promise<Round[]> {
  const { data, error } = await client.rpc('org_scouting', { p_org: org.id, p_since: sinceDay(days) });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string,
    farmerId: r.farmer_id as string,
    farmerName: r.farmer_name as string,
    ward: r.ward as string,
    plotId: (r.plot_id as string) ?? null,
    plotName: (r.plot_name as string) ?? null,
    taskId: (r.task_id as string) ?? null,
    crop: r.crop as Crop,
    observedOn: r.observed_on as string,
    checked: Number(r.plants_checked),
    note: (r.note as string) ?? null,
    scoutId: (r.scout_id as string) ?? null,
    scoutName: (r.scout_name as string) ?? null,
    createdAt: r.created_at as string,
    findings: ((r.findings as { cause_id: string; plants_affected: number; severity: Severity }[]) ?? []).map((f) => ({
      causeId: f.cause_id,
      affected: f.plants_affected,
      severity: f.severity,
    })),
  }));
}

export function remoteApi(client: SupabaseClient, org: Org): ScoutApi {
  return {
    save: async (d) => {
      const { data, error } = await client.rpc('save_scouting', {
        p_org: org.id, p_farmer: d.farmerId, p_plot: d.plotId, p_crop: d.crop, p_observed_on: d.observedOn,
        p_plants_checked: d.checked, p_note: d.note, p_task: d.taskId,
        p_findings: d.findings.map((f) => ({ cause_id: f.causeId, plants_affected: f.affected, severity: f.severity })),
      });
      return { id: data as string, error: error ? scoutError(error.message) : undefined };
    },
    remove: async (id) => {
      const { error } = await client.rpc('delete_scouting', { p_id: id });
      return error ? scoutError(error.message) : null;
    },
  };
}

// Sample data ---------------------------------------------------------------------------------

const day = (ago: number) => sinceDay(ago);
const FARMERS: Record<string, [string, string]> = {
  'f-juma': ['Juma Kiprono', 'Njoro'],
  'f-grace': ['Grace Wambui', 'Mauche'],
  'f-peter': ['Peter Mwangi', 'Lare'],
  'f-faith': ['Faith Chepkoech', 'Njoro'],
  'f-samuel': ['Samuel Kiptoo', 'Kihingo'],
  'f-mary': ['Mary Njeri', 'Mauche'],
  'f-john': ['John Ouma', 'Njoro'],
  'f-esther': ['Esther Achieng', 'Lare'],
};

let n = 0;
const round = (farmerId: string, crop: Crop, ago: number, checked: number, findings: [string, number, Severity][], who: [string, string], note?: string, plotName?: string): Round => {
  const [farmerName, ward] = FARMERS[farmerId];
  return {
    id: `s-${++n}`, farmerId, farmerName, ward, plotId: null, plotName: plotName ?? null, taskId: null, crop, observedOn: day(ago), checked,
    note: note ?? null, scoutId: who[0], scoutName: who[1], createdAt: new Date(Date.now() - ago * 86400_000).toISOString(),
    findings: findings.map(([causeId, affected, severity]) => ({ causeId, affected, severity })),
  };
};
const W: [string, string] = ['u-wanjiru', 'Wanjiru K.'];
const C: [string, string] = ['u-chebet', 'Chebet R.'];
const O: [string, string] = ['u-otieno', 'Otieno M.'];

export function sampleRounds(): Round[] {
  n = 0;
  return [
    // Late blight taking hold in Mauche tomatoes after the rains.
    round('f-grace', 'tomatoes', 1, 20, [['late_blight', 7, 'high'], ['early_blight', 2, 'low']], C, 'Dark wet patches on many plants after two days of rain.', 'Front tomatoes'),
    round('f-mary', 'tomatoes', 2, 20, [['late_blight', 5, 'medium']], C, undefined, 'Tomatoes'),
    round('f-grace', 'tomatoes', 9, 20, [['late_blight', 1, 'low']], C, undefined, 'Front tomatoes'),
    round('f-mary', 'tomatoes', 10, 20, [], C, 'Clean.', 'Tomatoes'),
    // Fall armyworm in Lare maize.
    round('f-peter', 'maize', 3, 30, [['fall_armyworm', 8, 'medium']], O, 'Fresh window-pane damage in the funnels.', 'Top field'),
    round('f-esther', 'maize', 4, 30, [['fall_armyworm', 7, 'medium']], O),
    round('f-peter', 'maize', 12, 30, [['fall_armyworm', 3, 'low']], O, undefined, 'Top field'),
    // Njoro: early blight steady, Tuta starting.
    round('f-juma', 'tomatoes', 2, 20, [['early_blight', 6, 'medium'], ['tuta', 2, 'low']], W, 'Lower leaves mostly.', 'Tomatoes by the tank'),
    round('f-juma', 'tomatoes', 11, 20, [['early_blight', 4, 'low']], W, undefined, 'Tomatoes by the tank'),
    round('f-faith', 'beans', 3, 25, [['angular_leaf_spot', 4, 'low'], ['aphids', 3, 'low']], W),
    round('f-john', 'kale', 5, 20, [['aphids', 2, 'low']], C),
    round('f-juma', 'maize', 6, 30, [['fall_armyworm', 2, 'low']], W, undefined, 'Lower maize'),
    round('f-samuel', 'maize', 7, 30, [], O, 'No damage seen.'),
    round('f-samuel', 'potatoes', 7, 20, [['late_blight', 1, 'low']], O),
  ];
}

export function sampleApi(set: (fn: (all: Round[]) => Round[]) => void, org: Org): ScoutApi {
  return {
    save: async (d) => {
      if (d.findings.some((f) => f.affected > d.checked)) return { error: scoutError('more_affected_than_checked') };
      const who = FARMERS[d.farmerId];
      if (!who) return { error: 'Pick a farmer.' };
      const r: Round = {
        id: `s-${Date.now()}`, farmerId: d.farmerId, farmerName: who[0], ward: who[1], plotId: d.plotId, plotName: samplePlots(d.farmerId).find((p) => p.id === d.plotId)?.name ?? null, taskId: d.taskId,
        crop: d.crop, observedOn: d.observedOn, checked: d.checked, note: d.note.trim() || null, scoutId: org.myId, scoutName: org.myName,
        createdAt: new Date().toISOString(), findings: [...d.findings].sort((a, b) => b.affected - a.affected),
      };
      set((all) => [r, ...all]);
      return { id: r.id };
    },
    remove: async (id) => {
      set((all) => all.filter((r) => r.id !== id));
      return null;
    },
  };
}
