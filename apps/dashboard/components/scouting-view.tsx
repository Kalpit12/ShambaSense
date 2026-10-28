'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { causesFor, CROP_NAME } from '@/lib/causes';
import { isAdmin, loadFarmers, sampleFarmers, type CoopFarmer } from '@/lib/coop';
import { downloadScouting } from '@/lib/exports';
import { dateLabel } from '@/lib/format';
import { supabase } from '@/lib/remote';
import {
  causeName,
  loadRounds,
  pct,
  PERIODS,
  remoteApi,
  sampleApi,
  sampleRounds,
  share,
  watch,
  type Draft,
  type Finding,
  type Level,
  type Round,
  type ScoutApi,
} from '@/lib/scouting';
import { useStore } from '@/lib/store';
import { canPlan, isClosed, loadTasks, remoteApi as taskApi, samplePlots, sampleTasks, type Plot, type Task } from '@/lib/tasks';
import type { Crop, Severity } from '@/lib/types';

const LEVEL: Record<Level, { word: string; tone: string }> = {
  outbreak: { word: 'Outbreak', tone: 'tone-red' },
  watch: { word: 'Watch', tone: 'tone-amber' },
  low: { word: 'Low', tone: 'tone-stone' },
};
const SEVERITY_WORD: Record<Severity, string> = { low: 'Low', medium: 'Medium', high: 'High' };
const CROPS = Object.keys(CROP_NAME) as Crop[];
const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Africa/Nairobi' });

function readPrefill(): Partial<Draft> | null {
  const q = window.location.hash.split('?')[1];
  if (!q) return null;
  const p = new URLSearchParams(q);
  if (!p.get('new')) return null;
  return { farmerId: p.get('farmer') ?? '', taskId: p.get('task'), plotId: p.get('plot') };
}

/** Scouting (design.md §10): rounds logged in the field, added up by ward to spot outbreaks early. */
export function ScoutingView({ search }: { search: string }) {
  const { org } = useStore();
  const crops = org?.crops.length ? org.crops : CROPS;
  const [days, setDays] = useState<number>(14);
  const [crop, setCrop] = useState<Crop | 'all'>('all');
  const [rounds, setRounds] = useState<Round[]>([]);
  const [farmers, setFarmers] = useState<CoopFarmer[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState<Partial<Draft> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!org) return;
    if (!supabase) return setRounds((x) => (x.length ? x : sampleRounds()));
    try {
      setRounds(await loadRounds(supabase, org, 90));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load scouting');
    }
  }, [org]);

  useEffect(() => {
    load();
    if (!org) return;
    if (!supabase) {
      setFarmers(sampleFarmers());
      setTasks(sampleTasks());
      return;
    }
    loadFarmers(supabase, org).then(setFarmers).catch(() => {});
    loadTasks(supabase, org).then(setTasks).catch(() => {});
  }, [load, org]);

  useEffect(() => {
    const read = () => {
      const pre = readPrefill();
      if (!pre) return;
      setSelectedId(null);
      setCreating(pre);
      try {
        history.replaceState(null, '', '#scouting');
      } catch {}
    };
    read();
    window.addEventListener('hashchange', read);
    return () => window.removeEventListener('hashchange', read);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && (setSelectedId(null), setCreating(null));
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const api = useMemo<ScoutApi | null>(() => (org ? (supabase ? remoteApi(supabase, org) : sampleApi(setRounds, org)) : null), [org]);
  const plotsOf = useMemo(() => (org && supabase ? taskApi(supabase, org).plotsOf : async (id: string) => samplePlots(id)), [org]);

  const since = new Date(Date.now() - days * 86400_000).toLocaleDateString('sv-SE', { timeZone: 'Africa/Nairobi' });
  const inView = useMemo(() => rounds.filter((r) => r.observedOn >= since && (crop === 'all' || r.crop === crop)), [rounds, since, crop]);
  const rows = useMemo(() => watch(inView), [inView]);
  const q = search.trim().toLowerCase();
  const list = inView.filter((r) => !q || [r.farmerName, r.ward, r.plotName ?? '', CROP_NAME[r.crop], ...r.findings.map((f) => causeName(f.causeId))].some((s) => s.toLowerCase().includes(q)));
  const outbreaks = rows.filter((r) => r.level === 'outbreak').length;
  const watching = rows.filter((r) => r.level === 'watch').length;

  if (!org || !api) return null;
  const planner = canPlan(org.role);
  const selected = rounds.find((r) => r.id === selectedId) ?? null;
  const open = selected || creating;
  const pick = (id: string | null) => (setNote(null), setError(null), setCreating(null), setSelectedId(id));

  return (
    <div className={`issues ${open ? 'with-detail' : ''}`}>
      <section className="list-pane" aria-label="Scouting">
        <div className="page-head report-head">
          <div>
            <h1>Scouting</h1>
            <p className="muted">Pest and disease counts from the field, added up by ward. Each farm counts once, from its latest round.</p>
          </div>
          <div className="head-actions">
            <button className="btn btn-secondary" onClick={() => downloadScouting(org.name, list)} disabled={!list.length}>
              Download (CSV)
            </button>
            {planner ? (
              <button className="btn btn-primary" onClick={() => (pick(null), setCreating({}))}>
                Log a round
              </button>
            ) : null}
          </div>
        </div>
        {error && !open ? <p className="flag">{error}</p> : null}
        {note && !open ? <p className="sent">{note}</p> : null}

        <div className="filterbar">
          <div className="tabs" role="tablist" aria-label="Period">
            {PERIODS.map((p) => (
              <button key={p.days} role="tab" aria-selected={days === p.days} className={`tab ${days === p.days ? 'on' : ''}`} onClick={() => setDays(p.days)}>
                {p.label}
              </button>
            ))}
          </div>
          <label className="select">
            <span className="sr-only">Crop</span>
            <select value={crop} onChange={(e) => setCrop(e.target.value as Crop | 'all')}>
              <option value="all">All crops</option>
              {crops.map((c) => (
                <option key={c} value={c}>
                  {CROP_NAME[c]}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="widgets">
          <div className={`widget ${outbreaks ? 'widget-alert' : ''}`}>
            <span className="w-label">Outbreaks</span>
            <span className="w-value num">{outbreaks}</span>
            <span className="w-sub">{watching ? `${watching} more to watch` : 'Nothing else to watch'}</span>
          </div>
          <div className="widget">
            <span className="w-label">Rounds logged</span>
            <span className="w-value num">{inView.length}</span>
            <span className="w-sub">{new Set(inView.map((r) => r.farmerId)).size} farms</span>
          </div>
          <div className="widget">
            <span className="w-label">Plants checked</span>
            <span className="w-value num">{inView.reduce((a, r) => a + r.checked, 0)}</span>
            <span className="w-sub">{inView.filter((r) => !r.findings.length).length} rounds found nothing</span>
          </div>
        </div>

        <section className="panel">
          <div className="panel-head">
            <h2>Outbreak watch, by ward</h2>
          </div>
          {rows.length ? (
            <div className="table-scroll">
              <table className="table">
                <thead>
                  <tr>
                    <th>Ward</th>
                    <th>Problem</th>
                    <th className="r">Farms</th>
                    <th className="r">Plants affected</th>
                    <th className="c-crop">Worst</th>
                    <th className="r c-seen">Change</th>
                    <th>Level</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((w) => (
                    <tr key={w.key} className={`static ${w.level === 'outbreak' ? 'outbreak' : ''}`}>
                      <td>{w.ward}</td>
                      <td>
                        <div className="row-title">{causeName(w.causeId)}</div>
                        <div className="row-sub">
                          {CROP_NAME[w.crop]} · last seen {dateLabel(w.lastSeen)}
                        </div>
                      </td>
                      <td className="r num">
                        {w.farmsAffected} of {w.farmsScouted}
                      </td>
                      <td className="r num">{pct(w.avgShare)}</td>
                      <td className="c-crop">{SEVERITY_WORD[w.worst]}</td>
                      <td className={`r num c-seen ${w.trend != null && w.trend > 0.05 ? 'late' : ''}`}>
                        {w.trend == null ? '–' : `${w.trend > 0 ? '+' : w.trend < 0 ? '−' : ''}${Math.abs(Math.round(w.trend * 100))} pts`}
                      </td>
                      <td>
                        <span className={`tag ${LEVEL[w.level].tone}`}>{LEVEL[w.level].word}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="empty">No pests or disease found in this period.</p>
          )}
          <p className="panel-note muted meta">
            Outbreak: 2 or more farms with at least 1 plant in 5 affected, or any farm with 1 in 3 and high severity. Watch: 1 plant in 10, or medium severity.
            Change compares each farm’s latest round with the one before.
          </p>
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2>Rounds</h2>
          </div>
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>Day</th>
                  <th>Farm</th>
                  <th className="c-crop">Crop</th>
                  <th>Found</th>
                  <th className="c-seen">Scout</th>
                </tr>
              </thead>
              <tbody>
                {list.map((r) => (
                  <tr
                    key={r.id}
                    className={r.id === selectedId ? 'selected' : ''}
                    tabIndex={0}
                    onClick={() => pick(r.id)}
                    onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), pick(r.id))}>
                    <td className="num">{dateLabel(r.observedOn)}</td>
                    <td>
                      <div className="row-title">{r.farmerName}</div>
                      <div className="row-sub">{[r.ward, r.plotName].filter(Boolean).join(' · ')}</div>
                    </td>
                    <td className="c-crop">{CROP_NAME[r.crop]}</td>
                    <td>
                      {r.findings.length ? (
                        <span className="found">
                          {r.findings.map((f) => (
                            <span key={f.causeId} className={`tag ${f.severity === 'high' ? 'tone-red' : f.severity === 'medium' ? 'tone-amber' : 'tone-stone'}`}>
                              {causeName(f.causeId)} {f.affected}/{r.checked}
                            </span>
                          ))}
                        </span>
                      ) : (
                        <span className="muted">Nothing found ({r.checked} plants)</span>
                      )}
                    </td>
                    <td className="c-seen">{r.scoutName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {list.length === 0 ? <p className="empty">No rounds in this period.</p> : null}
          </div>
        </section>
      </section>

      {open ? (
        <>
          <div className="detail-scrim" onClick={() => pick(null)} />
          <aside className="detail" aria-label={selected ? `Round on ${selected.farmerName}'s farm` : 'Log a round'}>
            <div className="detail-head">
              <span className="meta muted">{selected ? `Scouting round · ${dateLabel(selected.observedOn)}` : 'Log a scouting round'}</span>
              <button className="icon-btn" aria-label="Close" onClick={() => pick(null)}>
                <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
                  <path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            {error ? <p className="flag">{error}</p> : null}
            {note ? <p className="sent">{note}</p> : null}
            {creating ? (
              <RoundForm
                key={JSON.stringify(creating)}
                prefill={creating}
                farmers={farmers}
                tasks={tasks}
                plotsOf={plotsOf}
                onSave={async (d) => {
                  setError(null);
                  const r = await api.save(d);
                  if (r.error) return setError(r.error);
                  await load();
                  if (d.taskId && supabase) loadTasks(supabase, org).then(setTasks).catch(() => {});
                  setCreating(null);
                  setSelectedId(r.id ?? null);
                  setNote(d.taskId ? 'Round saved, and the visit is marked done with a summary.' : 'Round saved.');
                }}
              />
            ) : selected ? (
              <RoundDetail
                round={selected}
                canRemove={selected.scoutId === org.myId || isAdmin(org.role)}
                onRemove={async () => {
                  if (!confirm('Remove this round? It no longer counts in the outbreak watch.')) return;
                  const err = await api.remove(selected.id);
                  if (err) return setError(err);
                  await load();
                  pick(null);
                  setNote('Round removed.');
                }}
              />
            ) : null}
          </aside>
        </>
      ) : null}
    </div>
  );
}

function RoundDetail({ round: r, canRemove, onRemove }: { round: Round; canRemove: boolean; onRemove: () => void }) {
  return (
    <>
      <h2>{r.farmerName}</h2>
      <p className="muted">
        {[r.ward, r.plotName, CROP_NAME[r.crop]].filter(Boolean).join(' · ')} · {r.checked} plants checked by {r.scoutName ?? 'someone who left'}
      </p>
      <section className="block">
        <h3>Found</h3>
        {r.findings.length ? (
          <ul className="bars">
            {r.findings.map((f) => (
              <li key={f.causeId}>
                <div className="bar-head">
                  <span>{causeName(f.causeId)}</span>
                  <span className="num">
                    {f.affected} of {r.checked} · {pct(share(f, r))} · {SEVERITY_WORD[f.severity]}
                  </span>
                </div>
                <div className="bar">
                  <span className={`bar-fill sev-${f.severity}`} style={{ width: `${Math.max(2, share(f, r) * 100)}%` }} />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">Nothing found. The plants looked healthy.</p>
        )}
      </section>
      {r.note ? (
        <section className="block">
          <h3>Note</h3>
          <p>{r.note}</p>
        </section>
      ) : null}
      {r.taskId ? <p className="muted meta">Logged during a planned visit.</p> : null}
      {canRemove ? (
        <div className="status-actions">
          <button className="link danger" onClick={onRemove}>
            Remove round
          </button>
        </div>
      ) : null}
    </>
  );
}

function RoundForm({
  prefill,
  farmers,
  tasks,
  plotsOf,
  onSave,
}: {
  prefill: Partial<Draft>;
  farmers: CoopFarmer[];
  tasks: Task[];
  plotsOf: (farmerId: string) => Promise<Plot[]>;
  onSave: (d: Draft) => Promise<void>;
}) {
  const { org } = useStore();
  const crops = org?.crops.length ? org.crops : CROPS;
  const firstCrop = (id: string) => (farmers.find((f) => f.id === id)?.crops.find((c) => crops.includes(c as Crop)) as Crop | undefined) ?? crops[0];
  const [d, setD] = useState<Draft>(() => ({
    farmerId: prefill.farmerId ?? '',
    plotId: prefill.plotId ?? null,
    taskId: prefill.taskId ?? null,
    crop: prefill.farmerId ? firstCrop(prefill.farmerId) : crops[0],
    observedOn: today(),
    checked: 20,
    note: '',
    findings: [],
  }));
  const [counts, setCounts] = useState<Record<string, { n: string; sev: Severity }>>({});
  const [plots, setPlots] = useState<Plot[]>([]);
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }));

  useEffect(() => {
    if (!d.farmerId) return setPlots([]);
    let live = true;
    plotsOf(d.farmerId).then((p) => live && setPlots(p));
    return () => {
      live = false;
    };
  }, [plotsOf, d.farmerId]);

  // Farmers load after the form opens from a visit; pick their first crop then.
  useEffect(() => {
    if (prefill.farmerId && farmers.length) set({ crop: firstCrop(prefill.farmerId) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [farmers.length]);

  const visits = tasks.filter((t) => t.kind === 'visit' && t.farmerId === d.farmerId && (!isClosed(t.status) || t.id === d.taskId));
  const findings: Finding[] = Object.entries(counts)
    .map(([causeId, c]) => ({ causeId, affected: parseInt(c.n, 10) || 0, severity: c.sev }))
    .filter((f) => f.affected > 0 && causesFor(d.crop).some((c) => c.id === f.causeId));
  const tooMany = findings.some((f) => f.affected > d.checked);
  const ready = d.farmerId && d.checked >= 1 && d.observedOn && !tooMany;

  return (
    <form
      className="guide-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        await onSave({ ...d, findings });
        setBusy(false);
      }}>
      <label className="field">
        <span className="field-label">Farmer</span>
        <select value={d.farmerId} onChange={(e) => (set({ farmerId: e.target.value, plotId: null, taskId: null, crop: firstCrop(e.target.value) }), setCounts({}))}>
          <option value="">Pick a farmer</option>
          {farmers.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name} · {f.ward || f.county}
            </option>
          ))}
        </select>
      </label>
      <div className="split">
        <label className="field">
          <span className="field-label">Plot (optional)</span>
          <select value={d.plotId ?? ''} disabled={!d.farmerId} onChange={(e) => set({ plotId: e.target.value || null })}>
            <option value="">Not recorded</option>
            {plots.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field-label">Crop</span>
          <select value={d.crop} onChange={(e) => (set({ crop: e.target.value as Crop }), setCounts({}))}>
            {crops.map((c) => (
              <option key={c} value={c}>
                {CROP_NAME[c]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="split">
        <label className="field">
          <span className="field-label">Day</span>
          <input type="date" value={d.observedOn} max={today()} onChange={(e) => set({ observedOn: e.target.value })} />
        </label>
        <label className="field">
          <span className="field-label">Plants checked</span>
          <input type="number" inputMode="numeric" min={1} max={1000} value={d.checked || ''} onChange={(e) => set({ checked: parseInt(e.target.value, 10) || 0 })} />
        </label>
      </div>
      {visits.length ? (
        <label className="field">
          <span className="field-label">Part of a visit</span>
          <select value={d.taskId ?? ''} onChange={(e) => set({ taskId: e.target.value || null })}>
            <option value="">No</option>
            {visits.map((v) => (
              <option key={v.id} value={v.id}>
                {v.title} · {dateLabel(v.dueOn)}
              </option>
            ))}
          </select>
          {d.taskId ? <span className="muted meta">Saving marks the visit done, with a summary of these counts.</span> : null}
        </label>
      ) : null}

      <fieldset className="field">
        <legend className="field-label">Plants with each problem</legend>
        <p className="muted meta">Leave blank what you did not see. Out of {d.checked || '…'} plants.</p>
        <div className="count-grid">
          {causesFor(d.crop).map((c) => {
            const v = counts[c.id] ?? { n: '', sev: 'low' as Severity };
            const n = parseInt(v.n, 10) || 0;
            return (
              <div key={c.id} className={`count-row ${n > 0 ? 'on' : ''} ${n > d.checked ? 'bad' : ''}`}>
                <span className="count-name">{c.en}</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={d.checked}
                  aria-label={`${c.en}: plants affected`}
                  value={v.n}
                  onChange={(e) => setCounts((x) => ({ ...x, [c.id]: { ...v, n: e.target.value } }))}
                />
                <select aria-label={`${c.en}: severity`} value={v.sev} disabled={n === 0} onChange={(e) => setCounts((x) => ({ ...x, [c.id]: { ...v, sev: e.target.value as Severity } }))}>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>
            );
          })}
        </div>
        {tooMany ? <p className="flag">A count is higher than the number of plants checked.</p> : null}
      </fieldset>
      <label className="field">
        <span className="field-label">Note (optional)</span>
        <textarea rows={3} maxLength={1000} value={d.note} onChange={(e) => set({ note: e.target.value })} />
      </label>
      <div className="status-actions">
        <button className="btn btn-primary" disabled={busy || !ready}>
          {findings.length ? `Save round (${findings.length} found)` : 'Save round: nothing found'}
        </button>
      </div>
    </form>
  );
}
