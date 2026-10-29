import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { previewResult, type CheckResult } from './check-results';

import type { Crop } from './onboarding';
import { isPreview, supabase } from './auth';
import { reportError } from './errors';
import { askAgronomistRemote, diagnoseRemote, farmIdFor, pullAnswers, sendFollowUpRemote, sendRow, type Row } from './remote-sync';
import { deletePhotos, keepPhoto } from './photos';
import { PREVIEW_PHONE, previewSeed } from './preview-seed';

// Farm data on the phone. Everything is written here first and counts as "waiting to send" until
// it reaches the server, so the app works the same with or without signal (architecture.md §7).
// PowerSync's local SQLite and upload queue replace this store once the backend is up; the shapes
// below follow the `plots`, `journal_events` and `crop_checks` tables.

export type Plot = {
  id: string;
  name: string;
  crop: Crop;
  plantedOn: string | null; // YYYY-MM-DD
  areaAcres: number | null;
  createdAt: string;
  /** True once the server has the row. Only rows without it count as waiting. */
  sent?: boolean;
};

export type RecordKind = 'work' | 'input' | 'expense' | 'harvest' | 'sale';
export const UNITS = ['kg', 'bags', 'crates', 'L', 'pieces'] as const;
export type Unit = (typeof UNITS)[number];

export type JournalRecord = {
  id: string;
  kind: RecordKind;
  plotId: string | null;
  occurredOn: string; // YYYY-MM-DD
  quantity: number | null;
  unit: Unit | null;
  amountKes: number | null;
  note: string;
  createdAt: string;
  sent?: boolean;
};

export const SYMPTOMS = ['yellowing', 'spots', 'holes', 'wilting', 'rot', 'insects', 'other'] as const;
export type Symptom = (typeof SYMPTOMS)[number];

export type CropCheck = {
  id: string;
  crop: Crop;
  plotId: string | null;
  photoUri: string;
  symptoms: Symptom[];
  createdAt: string;
  sent?: boolean;
  // 'waiting' until the photo reaches the server, 'checking' while the worker runs, 'done' once a
  // result streams back. The phone never makes a diagnosis of its own.
  status: 'waiting' | 'checking' | 'done';
  result?: CheckResult;
  /** When the farmer sent it to an agronomist. */
  askedAt?: string;
  /** The server has the request (connected mode). */
  askSent?: boolean;
  /** Id of the journal record made from this result. */
  journalId?: string;
  /** The agronomist's answer, streamed down from `issue_events` once they review the case. */
  reply?: AgronomistReply;
  /** The agronomist closed the case. */
  caseClosed?: boolean;
};

export const OUTCOMES = ['better', 'same', 'worse'] as const;
export type Outcome = (typeof OUTCOMES)[number];

/**
 * A new photo of the same problem, sent when the agronomist asks or the follow-up date comes
 * (architecture.md §10). Kept apart from `checks` so lists show one row per problem; on the server it
 * is a `crop_checks` row with kind 'follow_up' and parent_check_id = parentId.
 */
export type FollowUp = {
  id: string;
  parentId: string;
  photoUri: string;
  /** How the crop looks now compared with the first photo, in the farmer's words. */
  outcome: Outcome;
  createdAt: string;
  sent?: boolean;
};

export type AgronomistReply = {
  kind: 'review_agree' | 'review_adjust' | 'review_reject' | 'request_photos';
  by: string;
  at: string;
  body: string;
  causeIds: string[];
  /** YYYY-MM-DD when a follow-up photo is due. */
  followUpDue?: string;
};

export type FarmData = {
  plots: Plot[];
  records: JournalRecord[];
  checks: CropCheck[];
  followUps?: FollowUp[];
  lastSyncAt?: string;
  /** Preview only: pretend there is no signal, to see the queued states. */
  offline?: boolean;
};
const EMPTY: FarmData = { plots: [], records: [], checks: [], followUps: [] };

export type SyncProgress = { done: number; total: number } | null;
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

type FarmStore = Omit<FarmData, 'followUps'> & {
  followUps: FollowUp[];
  loaded: boolean;
  /** Rows and photos saved on this phone that have not reached the server. */
  waiting: number;
  addPlot: (p: Omit<Plot, 'id' | 'createdAt'>) => void;
  /** Changes a plot's details; it goes back in the queue so the server gets the change. */
  updatePlot: (id: string, patch: Partial<Pick<Plot, 'name' | 'plantedOn' | 'areaAcres'>>) => void;
  addRecord: (r: Omit<JournalRecord, 'id' | 'createdAt'>) => void;
  addCheck: (c: Omit<CropCheck, 'id' | 'createdAt' | 'status'>) => CropCheck;
  /** Rows and photos going up right now, for "Sending 2 of 3…". */
  progress: SyncProgress;
  /** True when the app can send: preview mode with signal, or signed in to the server. */
  canSend: boolean;
  /** Preview only: the check is answered while the farmer waits. With the server, checks go to an agronomist. */
  instantCheck: boolean;
  sendNow: () => void;
  setOffline: (offline: boolean) => void;
  askAgronomist: (id: string) => void;
  saveCheckToJournal: (id: string, note: string) => void;
  /** Saves a follow-up photo for a check; it goes to the same case as the first photo. */
  addFollowUp: (parentId: string, photoUri: string, outcome: Outcome) => FollowUp;
  clear: () => Promise<void>;
};

const Ctx = createContext<FarmStore | null>(null);

export function FarmStoreProvider({ owner, userId, children }: { owner: string; userId?: string; children: ReactNode }) {
  const key = `shambasense.farm.${owner}`;
  const [data, setData] = useState<FarmData>(EMPTY);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    setData(EMPTY);
    setLoaded(false);
    AsyncStorage.getItem(key)
      .then((raw) => {
        if (!alive) return;
        if (raw) setData({ ...EMPTY, ...JSON.parse(raw) });
        else if (isPreview && owner === PREVIEW_PHONE) setData(previewSeed());
      })
      .catch(() => {})
      .finally(() => alive && setLoaded(true));
    return () => {
      alive = false;
    };
  }, [key, owner]);

  const [progress, setProgress] = useState<SyncProgress>(null);
  const sending = useRef(false);
  const dataRef = useRef(data);
  dataRef.current = data;

  const update = useCallback(
    (fn: (d: FarmData) => FarmData) =>
      setData((d) => {
        const next = fn(d);
        AsyncStorage.setItem(key, JSON.stringify(next)).catch(() => {});
        return next;
      }),
    [key],
  );

  // Preview stand-in for the PowerSync upload queue and the diagnosis worker: sends waiting rows one
  // at a time so every sync state in design.md §12 shows, then answers each check a moment later.
  const sendNow = useCallback(async () => {
    if (!isPreview) return sendRemote();
    if (sending.current || dataRef.current.offline) return;
    const d = dataRef.current;
    const queue = [...d.plots, ...d.records, ...d.checks, ...(d.followUps ?? [])].filter((r) => !r.sent).map((r) => r.id);
    if (queue.length === 0) return;
    sending.current = true;
    setProgress({ done: 0, total: queue.length });
    for (let i = 0; i < queue.length; i++) {
      await pause(650);
      if (dataRef.current.offline) break;
      const id = queue[i];
      update((cur) => ({
        ...cur,
        plots: cur.plots.map((p) => (p.id === id ? { ...p, sent: true } : p)),
        records: cur.records.map((r) => (r.id === id ? { ...r, sent: true } : r)),
        checks: cur.checks.map((c) => (c.id === id ? { ...c, sent: true, status: 'checking' } : c)),
        followUps: (cur.followUps ?? []).map((f) => (f.id === id ? { ...f, sent: true } : f)),
      }));
      setProgress({ done: i + 1, total: queue.length });
    }
    if (!dataRef.current.offline) update((cur) => ({ ...cur, lastSyncAt: now() }));
    setProgress(null);
    sending.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [update, userId]);

  // Connected mode. Until the diagnosis worker exists every check goes to an agronomist
  // ("agronomist-only", architecture.md §13 Phase 2). Stops at the first failure and tries again later.
  const sendRemote = async () => {
    if (!supabase || !userId || sending.current) return;
    const client = supabase;
    const d = dataRef.current;
    const queue: Row[] = [
      ...d.plots.filter((r) => !r.sent).map((row) => ({ table: 'plots' as const, row })),
      ...d.records.filter((r) => !r.sent).map((row) => ({ table: 'records' as const, row })),
      ...d.checks.filter((r) => !r.sent).map((row) => ({ table: 'checks' as const, row })),
      // After the checks, so the first photo is always on the server before its follow-up.
      ...(d.followUps ?? [])
        .filter((r) => !r.sent)
        .flatMap((row) => {
          const parent = d.checks.find((c) => c.id === row.parentId);
          return parent ? [{ table: 'followUps' as const, row, parent }] : [];
        }),
    ];
    const asks = d.checks.filter((c) => c.sent && c.askedAt && !c.askSent);
    if (queue.length === 0 && asks.length === 0) return pull();
    sending.current = true;
    try {
      const farmId = await farmIdFor(client, userId);
      if (!farmId) return;
      setProgress({ done: 0, total: queue.length });
      for (let i = 0; i < queue.length; i++) {
        const item = queue[i];
        try {
          await sendRow(client, userId, farmId, item);
          if (item.table === 'checks') await askAgronomistRemote(client, item.row.id);
          if (item.table === 'checks') await diagnoseRemote(client, item.row.id);
          if (item.table === 'followUps') await sendFollowUpRemote(client, item.row.id);
        } catch (e) {
          // No signal: stop and try the whole queue later. Anything else is this row's problem, so it
          // stays queued and is logged, and the rows behind it still go.
          if (isNetworkError(e)) throw e;
          reportError(e, { kind: 'sync_row', table: item.table, id: item.row.id });
          continue;
        }
        const id = item.row.id;
        update((cur) => ({
          ...cur,
          plots: cur.plots.map((p) => (p.id === id ? { ...p, sent: true } : p)),
          records: cur.records.map((r) => (r.id === id ? { ...r, sent: true } : r)),
          checks: cur.checks.map((c) => (c.id === id ? { ...c, sent: true, status: 'checking', askedAt: c.askedAt ?? now(), askSent: true } : c)),
          followUps: (cur.followUps ?? []).map((f) => (f.id === id ? { ...f, sent: true } : f)),
        }));
        setProgress({ done: i + 1, total: queue.length });
      }
      for (const c of asks) {
        await askAgronomistRemote(client, c.id);
        update((cur) => ({ ...cur, checks: cur.checks.map((x) => (x.id === c.id ? { ...x, askSent: true } : x)) }));
      }
      update((cur) => ({ ...cur, lastSyncAt: now() }));
    } catch (e) {
      // No signal or the server said no; everything not marked sent stays queued.
      reportError(e, { kind: 'sync' });
    } finally {
      setProgress(null);
      sending.current = false;
    }
    await pull();
  };

  // Brings down results and agronomist answers for checks that are still open.
  const pull = async () => {
    if (!supabase) return;
    // Every case still open, since a follow-up photo can bring a new answer after the first one.
    const open = dataRef.current.checks.filter((c) => c.sent && (c.status !== 'done' || (c.askedAt && !c.caseClosed)));
    try {
      // Checks sent while the photo reader was down get one more try per app run.
      await Promise.all(open.filter((c) => !c.result).map((c) => diagnoseRemote(supabase!, c.id)));
      const answers = await pullAnswers(supabase, open.map((c) => c.id));
      if (answers.size === 0) return;
      update((cur) => ({
        ...cur,
        checks: cur.checks.map((c) => {
          const a = answers.get(c.id);
          if (!a) return c;
          return { ...c, ...(a.result ? { result: a.result, status: 'done' as const } : null), ...(a.reply ? { reply: a.reply } : null), caseClosed: a.closed };
        }),
      }));
    } catch {
      // Try again on the next round.
    }
  };

  // Connected mode: send what is waiting and look for answers every 30 s while the app is on screen,
  // and at once when the farmer comes back to it. Nothing runs in the background, to save data.
  useEffect(() => {
    if (isPreview || !loaded || !userId) return;
    sendNow();
    const id = setInterval(() => AppState.currentState === 'active' && sendNow(), 30000);
    const sub = AppState.addEventListener('change', (s) => s === 'active' && sendNow());
    return () => {
      clearInterval(id);
      sub.remove();
    };
  }, [loaded, userId, sendNow]);

  // The worker answers each sent check a moment later, also for checks left 'checking' when the app closed.
  const answering = useRef(new Set<string>());
  useEffect(() => {
    if (!isPreview) return;
    for (const c of data.checks) {
      if (c.status !== 'checking' || answering.current.has(c.id)) continue;
      answering.current.add(c.id);
      setTimeout(() => {
        answering.current.delete(c.id);
        update((cur) => ({
          ...cur,
          checks: cur.checks.map((x) => (x.id === c.id && x.status === 'checking' ? { ...x, status: 'done', result: previewResult(x.crop, x.symptoms) } : x)),
        }));
      }, 2600);
    }
  }, [data.checks, update]);

  // Preview stand-in for the agronomist looking at a follow-up: a short answer a few seconds after it
  // is sent. "Better" closes the case; otherwise she asks for another photo in 3 days.
  useEffect(() => {
    if (!isPreview) return;
    for (const f of data.followUps ?? []) {
      const parent = data.checks.find((c) => c.id === f.parentId);
      if (!f.sent || !parent?.reply || parent.reply.at > f.createdAt || answering.current.has(f.id)) continue;
      answering.current.add(f.id);
      setTimeout(() => {
        answering.current.delete(f.id);
        const by = parent.reply!.by;
        const reply: AgronomistReply =
          f.outcome === 'better'
            ? { kind: 'review_agree', by, at: now(), causeIds: parent.reply!.causeIds, body: PREVIEW_FOLLOW_UP_REPLY.better }
            : { kind: 'request_photos', by, at: now(), causeIds: parent.reply!.causeIds, body: PREVIEW_FOLLOW_UP_REPLY[f.outcome], followUpDue: shiftIso(todayIso(), 3) };
        update((cur) => ({
          ...cur,
          checks: cur.checks.map((c) => (c.id === parent.id ? { ...c, reply, caseClosed: f.outcome === 'better' } : c)),
        }));
      }, 4000);
    }
  }, [data.followUps, data.checks, update]);

  const waiting = useMemo(() => [...data.plots, ...data.records, ...data.checks, ...(data.followUps ?? [])].filter((r) => !r.sent).length, [data]);

  // With signal, anything new goes up shortly after it is saved.
  useEffect(() => {
    if (!isPreview || !loaded || data.offline || waiting === 0 || progress) return;
    const id = setTimeout(sendNow, 1200);
    return () => clearTimeout(id);
  }, [loaded, data.offline, waiting, progress, sendNow]);

  const value = useMemo<FarmStore>(
    () => ({
      ...data,
      followUps: data.followUps ?? [],
      loaded,
      waiting,
      progress,
      canSend: isPreview ? !data.offline : !!(supabase && userId),
      instantCheck: isPreview && !data.offline,
      sendNow,
      setOffline: (offline) => update((d) => ({ ...d, offline })),
      askAgronomist: (id) => {
        update((d) => ({ ...d, checks: d.checks.map((c) => (c.id === id ? { ...c, askedAt: now() } : c)) }));
        if (!isPreview) setTimeout(sendNow, 0);
      },
      saveCheckToJournal: (id, note) =>
        update((d) => {
          const check = d.checks.find((c) => c.id === id);
          if (!check || check.journalId) return d;
          const record: JournalRecord = { id: uid(), kind: 'work', plotId: check.plotId, occurredOn: todayIso(), quantity: null, unit: null, amountKes: null, note, createdAt: now() };
          return { ...d, records: [record, ...d.records], checks: d.checks.map((c) => (c.id === id ? { ...c, journalId: record.id } : c)) };
        }),
      addFollowUp: (parentId, photoUri, outcome) => {
        const id = uid();
        const followUp: FollowUp = { id, parentId, photoUri: keepPhoto(photoUri, id), outcome, createdAt: now() };
        update((d) => ({ ...d, followUps: [followUp, ...(d.followUps ?? [])] }));
        if (!isPreview) setTimeout(sendNow, 0);
        return followUp;
      },
      addPlot: (p) => update((d) => ({ ...d, plots: [...d.plots, { ...p, id: uid(), createdAt: now() }] })),
      updatePlot: (id, patch) => update((d) => ({ ...d, plots: d.plots.map((p) => (p.id === id ? { ...p, ...patch, sent: false } : p)) })),
      addRecord: (r) => update((d) => ({ ...d, records: [{ ...r, id: uid(), createdAt: now() }, ...d.records] })),
      addCheck: (c) => {
        const id = uid();
        const check: CropCheck = { ...c, id, photoUri: keepPhoto(c.photoUri, id), createdAt: now(), status: 'waiting' };
        update((d) => ({ ...d, checks: [check, ...d.checks] }));
        return check;
      },
      // Sign-out wipes farm data and photo references on this phone (design.md §7.10).
      clear: async () => {
        setData(EMPTY);
        setProgress(null);
        deletePhotos();
        await AsyncStorage.removeItem(key).catch(() => {});
      },
    }),
    [data, loaded, update, key, waiting, progress, sendNow],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useFarm() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useFarm must be used inside FarmStoreProvider');
  return ctx;
}

export const now = () => new Date().toISOString();

const PREVIEW_FOLLOW_UP_REPLY: Record<Outcome, string> = {
  better: 'Good, the new leaves look clean. Keep checking once a week. I am closing this case; start a new check if it comes back.',
  same: 'No big change yet. Keep doing the same and send one more photo in 3 days.',
  worse: 'It has spread. Remove the worst plants away from the field and send one more photo in 3 days. Call the co-op office if it keeps spreading.',
};

function shiftIso(day: string, days: number) {
  const d = new Date(`${day}T12:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Time-ordered id (UUIDv7 layout) so records sort by creation and keep their id while offline.
export function uid() {
  const ms = Date.now().toString(16).padStart(12, '0');
  const rand = Array.from({ length: 20 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  return `${ms.slice(0, 8)}-${ms.slice(8)}-7${rand.slice(0, 3)}-${'89ab'[Math.floor(Math.random() * 4)]}${rand.slice(3, 6)}-${rand.slice(6, 18)}`;
}

export function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Lost signal or a timeout, as opposed to the server refusing one row. */
function isNetworkError(e: unknown) {
  const m = e instanceof Error ? e.message : String(e);
  return /network|fetch|timed? ?out|abort|offline|connection/i.test(m);
}
