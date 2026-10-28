import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useSyncExternalStore } from 'react';

import { supabase, useAuth } from './auth';
import { todayIso } from './farm-store';

// Tasks and visits from the farmer's co-op (architecture.md §5). The phone keeps a copy so Home shows
// them without signal. Ticking a task off is saved on the phone at once and sent when there is
// signal, with the time it was really done.

export type CoopTask = {
  id: string;
  kind: 'farmer' | 'visit';
  coopName: string;
  plotId: string | null;
  title: string;
  /** What to do, for farmer tasks. Visits carry none. */
  note: string | null;
  /** YYYY-MM-DD */
  dueOn: string;
  status: 'open' | 'in_progress' | 'blocked' | 'done';
  /** Who follows up, or who is coming for a visit. */
  assigneeName: string | null;
  doneAt: string | null;
};

/** A tick or untick not yet sent. */
type Pending = { done: boolean; at: string };
type Cache = { owner: string; tasks: CoopTask[]; pending: Record<string, Pending>; loading: boolean };

const keyOf = (owner: string) => `shambasense.tasks.v1.${owner}`;
let cache: Cache = { owner: '', tasks: [], pending: {}, loading: false };
const listeners = new Set<() => void>();
const publish = (next: Partial<Cache>) => {
  cache = { ...cache, ...next };
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => (listeners.add(l), () => listeners.delete(l));
const save = () => {
  if (cache.owner) AsyncStorage.setItem(keyOf(cache.owner), JSON.stringify({ tasks: cache.tasks, pending: cache.pending })).catch(() => {});
};

// Preview mode: a task and a visit from a made-up co-op, kept for the session only.
const shift = (days: number) => {
  const d = new Date(`${todayIso()}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};
function previewTasks(): CoopTask[] {
  return [
    { id: 'preview-task-1', kind: 'farmer', coopName: 'Njoro Growers Co-op', plotId: 'seed-plot-tomato', title: 'Remove spotted lower leaves on the tomatoes', note: 'Carry them out of the field and burn or bury them. Then send a new photo.', dueOn: shift(1), status: 'open', assigneeName: 'Wanjiru K.', doneAt: null },
    { id: 'preview-task-2', kind: 'visit', coopName: 'Njoro Growers Co-op', plotId: null, title: 'Check tomatoes and maize', note: null, dueOn: shift(3), status: 'open', assigneeName: 'Wanjiru K.', doneAt: null },
    { id: 'preview-task-3', kind: 'farmer', coopName: 'Njoro Growers Co-op', plotId: null, title: 'Bring a soil sample to the co-op store', note: 'A cup of soil from 3 places in the field, mixed, in a clean bag.', dueOn: shift(-2), status: 'done', assigneeName: 'Otieno M.', doneAt: new Date(Date.now() - 3 * 86400_000).toISOString() },
  ];
}

type Row = { id: string; kind: CoopTask['kind']; coop_name: string; plot_id: string | null; title: string; note: string | null; due_on: string; status: CoopTask['status']; assignee_name: string | null; done_at: string | null };

/** Sends ticks made offline, then reads the co-op's current list. Keeps the phone's copy if there is no signal. */
async function sync(owner: string) {
  if (!supabase) return;
  publish({ loading: true });
  try {
    for (const [id, p] of Object.entries(cache.pending)) {
      const { error } = await supabase.rpc('farmer_set_task_done', { p_id: id, p_done: p.done, p_at: p.at });
      // A task the co-op has since removed cannot be sent; drop the tick.
      if (error && !/not found/.test(error.message)) throw new Error(error.message);
      if (cache.pending[id] !== p) continue; // ticked again while sending; the newer tick goes next time
      const { [id]: _, ...rest } = cache.pending;
      publish({ pending: rest });
      save();
    }
    const { data, error } = await supabase.rpc('my_tasks');
    if (error) throw new Error(error.message);
    if (cache.owner !== owner) return;
    publish({
      tasks: ((data ?? []) as Row[]).map((r) => ({
        id: r.id, kind: r.kind, coopName: r.coop_name, plotId: r.plot_id, title: r.title, note: r.note,
        dueOn: r.due_on, status: r.status, assigneeName: r.assignee_name, doneAt: r.done_at,
      })),
    });
    save();
  } catch {
    // No signal: try again next time.
  } finally {
    publish({ loading: false });
  }
}

export function useCoopTasks() {
  const { user } = useAuth();
  const owner = user?.id ?? user?.phone;
  const state = useSyncExternalStore(subscribe, () => cache);

  const refresh = useCallback(async () => {
    if (!owner) return;
    if (!supabase) {
      if (cache.owner !== owner || !cache.tasks.length) publish({ owner, tasks: previewTasks() });
      return;
    }
    await sync(owner);
  }, [owner]);

  useEffect(() => {
    if (!owner || cache.owner === owner) return;
    publish({ owner, tasks: [], pending: {} });
    AsyncStorage.getItem(keyOf(owner))
      .then((raw) => {
        if (!raw || cache.owner !== owner) return;
        const saved = JSON.parse(raw) as { tasks: CoopTask[]; pending: Record<string, Pending> };
        publish({ tasks: saved.tasks ?? [], pending: { ...saved.pending, ...cache.pending } });
      })
      .catch(() => {})
      .finally(refresh);
  }, [owner, refresh]);

  /** Ticks a farmer task off, or back on. Shows at once; sent now or when signal returns. */
  const setDone = useCallback(
    (id: string, done: boolean) => {
      const at = new Date().toISOString();
      publish({
        tasks: cache.tasks.map((x) => (x.id === id ? { ...x, status: done ? 'done' : 'open', doneAt: done ? at : null } : x)),
        pending: supabase ? { ...cache.pending, [id]: { done, at } } : cache.pending,
      });
      save();
      if (owner && supabase) sync(owner);
    },
    [owner],
  );

  const ready = state.owner === owner;
  return { tasks: ready ? state.tasks : [], waiting: ready ? Object.keys(state.pending).length : 0, loading: state.loading, refresh, setDone };
}

export async function forgetTasks(owner: string | undefined) {
  if (owner) await AsyncStorage.removeItem(keyOf(owner)).catch(() => {});
  publish({ owner: '', tasks: [], pending: {} });
}
