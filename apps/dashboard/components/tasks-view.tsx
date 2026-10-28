'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { loadFarmers, loadTeam, sampleFarmers, sampleTeam, type CoopFarmer, type Member } from '@/lib/coop';
import { ago, dateLabel, daysUntil } from '@/lib/format';
import { supabase } from '@/lib/remote';
import { useStore } from '@/lib/store';
import {
  canPlan,
  isClosed,
  KIND_WORD,
  loadTasks,
  remoteApi,
  sampleApi,
  sampleTasks,
  STATUS_WORD,
  type Draft,
  type Plot,
  type Task,
  type TaskApi,
  type TaskKind,
  type TaskStatus,
} from '@/lib/tasks';

type Tab = 'open' | 'overdue' | 'visits' | 'farmer' | 'done';
const TABS: { key: Tab; label: string; test: (t: Task) => boolean }[] = [
  { key: 'open', label: 'Open', test: (t) => !isClosed(t.status) },
  { key: 'overdue', label: 'Overdue', test: (t) => !isClosed(t.status) && daysUntil(t.dueOn) < 0 },
  { key: 'visits', label: 'Field visits', test: (t) => !isClosed(t.status) && t.kind === 'visit' },
  { key: 'farmer', label: 'Farmer tasks', test: (t) => !isClosed(t.status) && t.kind === 'farmer' },
  { key: 'done', label: 'Done', test: (t) => isClosed(t.status) },
];
const TONE: Record<TaskStatus, string> = { open: 'tone-stone', in_progress: 'tone-sky', blocked: 'tone-amber', done: 'tone-forest', cancelled: 'tone-quiet' };

const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Africa/Nairobi' });
const plusDays = (n: number) => new Date(Date.now() + n * 86400_000).toLocaleDateString('sv-SE', { timeZone: 'Africa/Nairobi' });

function dueWord(t: Task) {
  const d = daysUntil(t.dueOn);
  if (isClosed(t.status)) return dateLabel(t.dueOn);
  if (d < 0) return d === -1 ? 'Yesterday' : `${-d} days overdue`;
  if (d === 0) return 'Today';
  if (d === 1) return 'Tomorrow';
  return dateLabel(t.dueOn);
}

/** What the page was asked to start with, from a link such as #tasks?new=farmer&farmer=…&issue=… */
function readPrefill(): Partial<Draft> | null {
  const q = window.location.hash.split('?')[1];
  if (!q) return null;
  const p = new URLSearchParams(q);
  if (!p.get('new')) return null;
  // Sample cases carry only the farmer's name.
  const farmerId = p.get('farmer') || (supabase ? '' : (sampleFarmers().find((f) => f.name === p.get('name'))?.id ?? ''));
  return { kind: p.get('new') === 'visit' ? 'visit' : 'farmer', farmerId, issueId: p.get('issue'), plotId: null, title: p.get('title') ?? '' };
}

/** Tasks (design.md §10): visits the team plans and tasks farmers do. Open → In progress → Blocked → Done. */
export function TasksView({ search, onOpenCase }: { search: string; onOpenCase: (id: string) => void }) {
  const { org, issues } = useStore();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [farmers, setFarmers] = useState<CoopFarmer[]>([]);
  const [team, setTeam] = useState<Member[]>([]);
  const [tab, setTab] = useState<Tab>('open');
  const [mine, setMine] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState<Partial<Draft> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!org) return;
    if (!supabase) return setTasks((x) => (x.length ? x : sampleTasks()));
    try {
      setTasks(await loadTasks(supabase, org));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load tasks');
    }
  }, [org]);

  useEffect(() => {
    load();
    if (!org) return;
    if (!supabase) {
      setFarmers(sampleFarmers());
      setTeam(sampleTeam().members);
      return;
    }
    loadFarmers(supabase, org).then(setFarmers).catch(() => {});
    loadTeam(supabase, org).then((t) => setTeam(t.members)).catch(() => {});
  }, [load, org]);

  // A case's "Give the farmer a task" link opens the form filled in.
  useEffect(() => {
    const read = () => {
      const pre = readPrefill();
      if (!pre) return;
      setSelectedId(null);
      setCreating(pre);
      try {
        history.replaceState(null, '', '#tasks');
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

  const api = useMemo<TaskApi | null>(() => (org ? (supabase ? remoteApi(supabase, org) : sampleApi(setTasks, org)) : null), [org]);

  const act = async <T,>(run: () => Promise<T>, done?: string) => {
    setError(null);
    setNote(null);
    const r = await run();
    const err = typeof r === 'string' ? r : (r as { error?: string } | null)?.error;
    if (err) setError(err);
    else if (done) setNote(done);
    await load();
    return err ? null : r;
  };

  const pick = (id: string | null) => (setNote(null), setError(null), setCreating(null), setSelectedId(id));
  const scoped = useMemo(() => (mine && org ? tasks.filter((t) => t.assigneeId === org.myId) : tasks), [tasks, mine, org]);
  const counts = Object.fromEntries(TABS.map((x) => [x.key, scoped.filter(x.test).length]));
  const rows = useMemo(() => {
    const test = TABS.find((x) => x.key === tab)!.test;
    const q = search.trim().toLowerCase();
    return scoped
      .filter(test)
      .filter((t) => !q || [t.title, t.farmerName, t.phone, t.ward, t.plotName ?? '', t.issueCode ?? '', t.assigneeName ?? ''].some((s) => s.toLowerCase().includes(q)))
      .sort((a, b) => (tab === 'done' ? (b.doneAt ?? b.updatedAt).localeCompare(a.doneAt ?? a.updatedAt) : a.dueOn.localeCompare(b.dueOn) || a.createdAt.localeCompare(b.createdAt)));
  }, [scoped, tab, search]);

  if (!org || !api) return null;
  const planner = canPlan(org.role);
  const selected = tasks.find((t) => t.id === selectedId) ?? null;
  const open = selected || creating;
  const overdue = counts.overdue;

  return (
    <div className={`issues ${open ? 'with-detail' : ''}`}>
      <section className="list-pane" aria-label="Tasks">
        <div className="page-head report-head">
          <div>
            <h1>Tasks</h1>
            <p className="muted">Farm visits the team plans, and tasks farmers see on their phones and tick off, even without signal.</p>
          </div>
          {planner ? (
            <div className="head-actions">
              <button className="btn btn-secondary" onClick={() => (pick(null), setCreating({ kind: 'visit' }))}>
                Plan a visit
              </button>
              <button className="btn btn-primary" onClick={() => (pick(null), setCreating({ kind: 'farmer' }))}>
                Give a farmer a task
              </button>
            </div>
          ) : null}
        </div>
        {error && !open ? <p className="flag">{error}</p> : null}
        {note && !open ? <p className="sent">{note}</p> : null}

        <div className="filterbar">
          <div className="tabs" role="tablist">
            {TABS.map((x) => (
              <button key={x.key} role="tab" aria-selected={tab === x.key} className={`tab ${tab === x.key ? 'on' : ''} ${x.key === 'overdue' && overdue ? 'tab-warn' : ''}`} onClick={() => setTab(x.key)}>
                {x.label} <span className="num tab-count">{counts[x.key]}</span>
              </button>
            ))}
          </div>
          <label className="check">
            <input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} /> Only mine
          </label>
        </div>

        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Task</th>
                <th>Farmer</th>
                <th>Due</th>
                <th className="c-crop">Assigned to</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => {
                const late = !isClosed(t.status) && daysUntil(t.dueOn) < 0;
                return (
                  <tr
                    key={t.id}
                    className={`${t.id === selectedId ? 'selected' : ''} ${late ? 'overdue' : ''}`}
                    tabIndex={0}
                    aria-selected={t.id === selectedId}
                    onClick={() => pick(t.id)}
                    onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), pick(t.id))}>
                    <td>
                      <div className="row-title">{t.title}</div>
                      <div className="row-sub">{[KIND_WORD[t.kind], t.plotName, t.issueCode].filter(Boolean).join(' · ')}</div>
                    </td>
                    <td>
                      <div>{t.farmerName}</div>
                      <div className="row-sub">{t.ward}</div>
                    </td>
                    <td className={`num ${late ? 'late' : ''}`}>{dueWord(t)}</td>
                    <td className="c-crop">{t.assigneeName ?? <span className="muted">Nobody</span>}</td>
                    <td>
                      <span className={`tag ${TONE[t.status]}`}>{t.status === 'done' && t.doneBy === 'farmer' ? 'Done by farmer' : STATUS_WORD[t.status]}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {rows.length === 0 ? <p className="empty">{tab === 'overdue' ? 'Nothing overdue.' : tab === 'done' ? 'Nothing done yet.' : 'No tasks here.'}</p> : null}
        </div>
      </section>

      {open ? (
        <>
          <div className="detail-scrim" onClick={() => pick(null)} />
          <aside className="detail" aria-label={selected ? selected.title : 'New task'}>
            <div className="detail-head">
              <span className="meta muted">{selected ? `${KIND_WORD[selected.kind]}${selected.createdByName ? ` · planned by ${selected.createdByName}` : ''}` : creating?.kind === 'visit' ? 'Plan a visit' : 'Give a farmer a task'}</span>
              <button className="icon-btn" aria-label="Close" onClick={() => pick(null)}>
                <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
                  <path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            {error ? <p className="flag">{error}</p> : null}
            {note ? <p className="sent">{note}</p> : null}
            {creating ? (
              <TaskForm
                key={JSON.stringify(creating)}
                initial={{
                  kind: creating.kind ?? 'farmer',
                  farmerId: creating.farmerId ?? '',
                  plotId: creating.plotId ?? null,
                  issueId: creating.issueId ?? null,
                  title: creating.title ?? '',
                  note: '',
                  dueOn: plusDays(creating.kind === 'visit' ? 2 : 3),
                  assigneeId: org.myId,
                }}
                isNew
                farmers={farmers}
                team={team}
                issues={issues}
                api={api}
                onSave={async (d) => {
                  const r = await act(() => api.save(null, d), d.kind === 'visit' ? 'Visit planned. The farmer gets an alert with the date.' : 'Task sent. It shows on the farmer’s phone at their next sync.');
                  if (r?.id) (setCreating(null), setSelectedId(r.id));
                }}
              />
            ) : selected ? (
              <TaskDetail
                key={selected.id + selected.updatedAt}
                task={selected}
                planner={planner}
                farmers={farmers}
                team={team}
                issues={issues}
                api={api}
                act={act}
                onOpenCase={onOpenCase}
              />
            ) : null}
          </aside>
        </>
      ) : null}
    </div>
  );
}

function TaskDetail({
  task: t,
  planner,
  farmers,
  team,
  issues,
  api,
  act,
  onOpenCase,
}: {
  task: Task;
  planner: boolean;
  farmers: CoopFarmer[];
  team: Member[];
  issues: ReturnType<typeof useStore>['issues'];
  api: TaskApi;
  act: <T>(run: () => Promise<T>, done?: string) => Promise<T | null>;
  onOpenCase: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [asking, setAsking] = useState<null | 'done' | 'blocked' | 'cancelled'>(null);
  const [text, setText] = useState('');
  const closed = isClosed(t.status);
  const late = !closed && daysUntil(t.dueOn) < 0;
  const move = (s: TaskStatus, outcome = '', done?: string) => act(() => api.setStatus(t.id, s, outcome), done);

  if (editing)
    return (
      <TaskForm
        initial={{ kind: t.kind, farmerId: t.farmerId, plotId: t.plotId, issueId: t.issueId, title: t.title, note: t.note ?? '', dueOn: t.dueOn, assigneeId: t.assigneeId }}
        farmers={farmers}
        team={team}
        issues={issues}
        api={api}
        onSave={async (d) => {
          const r = await act(() => api.save(t.id, d), 'Saved.');
          if (r?.id) setEditing(false);
        }}
        onCancel={() => setEditing(false)}
      />
    );

  const ask = {
    done: { label: t.kind === 'visit' ? 'What did you find?' : 'Anything to note? (optional)', button: 'Mark done', required: t.kind === 'visit' },
    blocked: { label: 'What is in the way?', button: 'Mark blocked', required: true },
    cancelled: { label: 'Why cancel it? (optional)', button: 'Cancel task', required: false },
  };

  return (
    <>
      <h2>{t.title}</h2>
      <div className="facts">
        <span className={`tag ${TONE[t.status]}`}>{STATUS_WORD[t.status]}</span>
        <span className={`meta ${late ? 'late' : 'muted'}`}>Due {dueWord(t).toLowerCase() === 'today' ? 'today' : dueWord(t)}</span>
      </div>

      <dl className="kv">
        <dt>Farmer</dt>
        <dd>
          {t.farmerName}
          <span className="muted"> · {[t.phone, t.ward].filter(Boolean).join(' · ')}</span>
        </dd>
        {t.plotName ? (
          <>
            <dt>Plot</dt>
            <dd>{t.plotName}</dd>
          </>
        ) : null}
        {t.issueId ? (
          <>
            <dt>Case</dt>
            <dd>
              <button className="link" onClick={() => onOpenCase(t.issueId!)}>
                {t.issueCode ?? 'Open the case'}
              </button>
            </dd>
          </>
        ) : null}
        <dt>Assigned to</dt>
        <dd>{t.assigneeName ?? 'Nobody'}</dd>
      </dl>

      {t.note ? (
        <section className="block">
          <h3>{t.kind === 'farmer' ? 'What the farmer sees' : 'Team note'}</h3>
          <p>{t.note}</p>
          {t.kind === 'visit' ? <p className="muted meta">The farmer sees the date and who is coming, not this note.</p> : null}
        </section>
      ) : t.kind === 'farmer' ? (
        <p className="muted meta">The farmer sees the title and due date.</p>
      ) : null}

      {t.status === 'done' ? (
        <p className="sent">{t.doneBy === 'farmer' ? `${t.farmerName.split(' ')[0]} ticked it off on the phone, ${ago(t.doneAt!)}.` : `Marked done ${ago(t.doneAt!)}.`}</p>
      ) : null}
      {t.outcome ? (
        <section className="block">
          <h3>{t.kind === 'visit' && t.status === 'done' ? 'Visit report' : t.status === 'blocked' ? 'Blocked because' : 'Note'}</h3>
          <p>{t.outcome}</p>
        </section>
      ) : null}

      {planner ? (
        asking ? (
          <section className="block">
            <label className="field">
              <span className="field-label">{ask[asking].label}</span>
              <textarea rows={4} value={text} maxLength={1000} onChange={(e) => setText(e.target.value)} autoFocus />
            </label>
            <div className="status-actions">
              <button
                className="btn btn-primary"
                disabled={ask[asking].required && !text.trim()}
                onClick={() => move(asking, text, asking === 'done' ? 'Marked done.' : asking === 'blocked' ? 'Marked blocked.' : 'Cancelled. The farmer no longer sees it.')}>
                {ask[asking].button}
              </button>
              <button className="btn btn-secondary" onClick={() => (setAsking(null), setText(''))}>
                Back
              </button>
            </div>
          </section>
        ) : closed ? (
          <div className="status-actions">
            <button className="btn btn-secondary" onClick={() => move('open', '', 'Reopened.')}>
              Reopen
            </button>
          </div>
        ) : (
          <div className="status-actions">
            {t.status !== 'in_progress' ? (
              <button className="btn btn-secondary" onClick={() => move('in_progress', '', 'Marked in progress.')}>
                {t.status === 'blocked' ? 'Unblock' : 'Start'}
              </button>
            ) : null}
            <button className="btn btn-primary" onClick={() => setAsking('done')}>
              Mark done
            </button>
            {t.status !== 'blocked' ? (
              <button className="btn btn-secondary" onClick={() => setAsking('blocked')}>
                Blocked
              </button>
            ) : null}
            <button className="btn btn-secondary" onClick={() => setEditing(true)}>
              Edit
            </button>
            <button className="link danger" onClick={() => setAsking('cancelled')}>
              Cancel task
            </button>
          </div>
        )
      ) : null}
    </>
  );
}

function TaskForm({
  initial,
  isNew,
  farmers,
  team,
  issues,
  api,
  onSave,
  onCancel,
}: {
  initial: Draft;
  isNew?: boolean;
  farmers: CoopFarmer[];
  team: Member[];
  issues: ReturnType<typeof useStore>['issues'];
  api: TaskApi;
  onSave: (d: Draft) => Promise<void>;
  onCancel?: () => void;
}) {
  const [d, setD] = useState<Draft>(initial);
  const [plots, setPlots] = useState<Plot[]>([]);
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }));
  const farmer = farmers.find((f) => f.id === d.farmerId);
  // Sample cases carry only the farmer's name.
  const cases = issues.filter((i) => (i.farmerId ? i.farmerId === d.farmerId : !!farmer && i.farmer.name === farmer.name)).filter((i) => i.status !== 'closed' || i.id === d.issueId);

  useEffect(() => {
    if (!d.farmerId) return setPlots([]);
    let live = true;
    api.plotsOf(d.farmerId).then((p) => live && setPlots(p));
    return () => {
      live = false;
    };
  }, [api, d.farmerId]);

  const visit = d.kind === 'visit';
  const ready = d.farmerId && d.title.trim() && d.dueOn;

  return (
    <form
      className="guide-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        await onSave(d);
        setBusy(false);
      }}>
      {isNew ? (
        <div className="tabs" role="radiogroup" aria-label="Kind">
          {(['farmer', 'visit'] as TaskKind[]).map((k) => (
            <button key={k} type="button" role="radio" aria-checked={d.kind === k} className={`tab ${d.kind === k ? 'on' : ''}`} onClick={() => set({ kind: k })}>
              {k === 'farmer' ? 'Task for the farmer' : 'Field visit'}
            </button>
          ))}
        </div>
      ) : (
        <h2>Edit {visit ? 'visit' : 'task'}</h2>
      )}
      <label className="field">
        <span className="field-label">Farmer</span>
        <select value={d.farmerId} disabled={!isNew} onChange={(e) => set({ farmerId: e.target.value, plotId: null, issueId: null })}>
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
            <option value="">Whole farm</option>
            {plots.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field-label">Case (optional)</span>
          <select value={d.issueId ?? ''} disabled={!d.farmerId} onChange={(e) => set({ issueId: e.target.value || null })}>
            <option value="">None</option>
            {cases.map((i) => (
              <option key={i.id} value={i.id}>
                {i.code} · {i.title}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="field">
        <span className="field-label">{visit ? 'What the visit is for' : 'What the farmer should do'}</span>
        <input value={d.title} maxLength={120} onChange={(e) => set({ title: e.target.value })} placeholder={visit ? 'e.g. Check tomatoes for blight spread' : 'e.g. Remove spotted lower leaves on the tomatoes'} />
        {!visit ? <span className="muted meta">Short and plain. It shows on the farmer’s Home screen.</span> : null}
      </label>
      <label className="field">
        <span className="field-label">{visit ? 'Team note (optional)' : 'More detail for the farmer (optional)'}</span>
        <textarea rows={3} value={d.note} maxLength={500} onChange={(e) => set({ note: e.target.value })} />
        {visit ? <span className="muted meta">Only the team sees this. The farmer sees the date and who is coming.</span> : null}
      </label>
      <div className="split">
        <label className="field">
          <span className="field-label">{visit ? 'Visit date' : 'Due by'}</span>
          <input type="date" value={d.dueOn} min={isNew ? today() : undefined} onChange={(e) => set({ dueOn: e.target.value })} />
        </label>
        <label className="field">
          <span className="field-label">{visit ? 'Who is going' : 'Who follows up'}</span>
          <select value={d.assigneeId ?? ''} onChange={(e) => set({ assigneeId: e.target.value || null })}>
            {team
              .filter((m) => m.role !== 'viewer')
              .map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.name}
                </option>
              ))}
          </select>
        </label>
      </div>
      <div className="status-actions">
        <button className="btn btn-primary" disabled={busy || !ready}>
          {isNew ? (visit ? 'Plan visit' : 'Send to farmer') : 'Save'}
        </button>
        {onCancel ? (
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            Back
          </button>
        ) : null}
      </div>
      {isNew && farmer ? <p className="muted meta">{farmer.name.split(' ')[0]} gets a phone alert {visit ? 'with the date' : 'with the task'}{farmer.language === 'sw' ? ', in Kiswahili' : ''}.</p> : null}
    </form>
  );
}
