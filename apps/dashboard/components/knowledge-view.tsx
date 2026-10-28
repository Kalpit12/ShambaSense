'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { causeById, CAUSES, CROP_NAME } from '@/lib/causes';
import { ago, dateLabel } from '@/lib/format';
import { canWrite, LANGUAGE_WORD, loadGuides, MAX_STEPS, remoteApi, sampleApi, sampleGuides, STATUS_WORD, type Draft, type Guide, type GuideApi, type GuideStatus, type Language } from '@/lib/guides';
import { supabase } from '@/lib/remote';
import { safetyFlags } from '@/lib/safety';
import { useStore } from '@/lib/store';
import type { Crop } from '@/lib/types';

type Tab = 'review' | 'published' | 'drafts' | 'all' | 'retired';
const TABS: { key: Tab; label: string; statuses: GuideStatus[] }[] = [
  { key: 'review', label: 'Waiting for review', statuses: ['in_review'] },
  { key: 'published', label: 'On farmers’ phones', statuses: ['published'] },
  { key: 'drafts', label: 'Drafts', statuses: ['draft'] },
  { key: 'all', label: 'All', statuses: ['draft', 'in_review', 'published'] },
  { key: 'retired', label: 'Retired', statuses: ['retired'] },
];
const TONE: Record<GuideStatus, string> = { draft: 'tone-stone', in_review: 'tone-amber', published: 'tone-forest', retired: 'tone-quiet' };

const causeName = (id: string) => causeById(id)?.en ?? id;
const cropOf = (id: string) => causeById(id)?.crop ?? 'any';
const cropWord = (c: Crop | 'any') => (c === 'any' ? 'Any crop' : CROP_NAME[c]);

/** Knowledge base (design.md §10): guides with crop, language, version, reviewer and date. */
export function KnowledgeView({ search }: { search: string }) {
  const { org } = useStore();
  const [guides, setGuides] = useState<Guide[]>([]);
  const ref = useRef(guides);
  ref.current = guides;
  const [tab, setTab] = useState<Tab>('review');
  const [crop, setCrop] = useState<Crop | 'any' | 'all'>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState<Pick<Draft, 'causeId' | 'language'> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase) return setGuides((g) => (g.length ? g : sampleGuides()));
    try {
      setGuides(await loadGuides(supabase));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load guides');
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const api = useMemo<GuideApi | null>(() => {
    if (!org) return null;
    return supabase ? remoteApi(supabase, org) : sampleApi(setGuides, () => ref.current, org);
  }, [org]);

  // Every change: run it, show the outcome, reload.
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

  const counts = useMemo(() => Object.fromEntries(TABS.map((t) => [t.key, guides.filter((g) => t.statuses.includes(g.status)).length])), [guides]);
  const rows = useMemo(() => {
    const statuses = TABS.find((t) => t.key === tab)!.statuses;
    const q = search.trim().toLowerCase();
    return guides
      .filter((g) => statuses.includes(g.status))
      .filter((g) => crop === 'all' || cropOf(g.causeId) === crop)
      .filter((g) => !q || [g.title, causeName(g.causeId), g.authorName ?? '', g.reviewerName ?? ''].some((s) => s.toLowerCase().includes(q)))
      .sort((a, b) => causeName(a.causeId).localeCompare(causeName(b.causeId)) || a.language.localeCompare(b.language) || b.version - a.version);
  }, [guides, tab, crop, search]);
  const crops = Array.from(new Set(guides.map((g) => cropOf(g.causeId))));
  const selected = guides.find((g) => g.id === selectedId) ?? null;
  const writer = canWrite(org?.role);
  const pick = (id: string | null) => (setNote(null), setError(null), setCreating(null), setSelectedId(id));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && (setSelectedId(null), setCreating(null));
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!org || !api) return null;
  const open = selected || creating;

  return (
    <div className={`issues ${open ? 'with-detail' : ''}`}>
      <section className="list-pane" aria-label="Knowledge base">
        <div className="page-head report-head">
          <div>
            <h1>Knowledge base</h1>
            <p className="muted">Short guides farmers read on their phones, even without signal. A guide reaches farmers only after a second person on the team reviews it.</p>
          </div>
          {writer ? (
            <button className="btn btn-primary" onClick={() => (pick(null), setCreating({ causeId: 'early_blight', language: 'en' }))}>
              New guide
            </button>
          ) : null}
        </div>
        {error && !open ? <p className="flag">{error}</p> : null}
        {note && !open ? <p className="sent">{note}</p> : null}

        <div className="filterbar">
          <div className="tabs" role="tablist">
            {TABS.map((t) => (
              <button key={t.key} role="tab" aria-selected={tab === t.key} className={`tab ${tab === t.key ? 'on' : ''}`} onClick={() => setTab(t.key)}>
                {t.label} <span className="num tab-count">{counts[t.key]}</span>
              </button>
            ))}
          </div>
          <label className="select">
            <span className="sr-only">Crop</span>
            <select value={crop} onChange={(e) => setCrop(e.target.value as Crop | 'any' | 'all')}>
              <option value="all">All crops</option>
              {crops.map((c) => (
                <option key={c} value={c}>
                  {cropWord(c)}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Guide</th>
                <th>Language</th>
                <th>Status</th>
                <th className="c-crop">Reviewed</th>
                <th className="c-updated">Updated</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((g) => (
                <tr
                  key={g.id}
                  className={g.id === selectedId ? 'selected' : ''}
                  tabIndex={0}
                  aria-selected={g.id === selectedId}
                  onClick={() => pick(g.id)}
                  onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), pick(g.id))}>
                  <td>
                    <div className="row-title">{g.title}</div>
                    <div className="row-sub">
                      {causeName(g.causeId)} · {cropWord(cropOf(g.causeId))} · v{g.version}
                      {g.orgId == null ? ' · ShambaSense' : ''}
                    </div>
                  </td>
                  <td>{LANGUAGE_WORD[g.language]}</td>
                  <td>
                    <span className={`tag ${TONE[g.status]}`}>{STATUS_WORD[g.status]}</span>
                    {g.containsChemical ? <span className="chem">Chemical</span> : null}
                  </td>
                  <td className="c-crop">{g.reviewerName ? `${g.reviewerName}, ${dateLabel(g.reviewedOn!)}` : <span className="muted">Not yet</span>}</td>
                  <td className="c-updated meta num">{ago(g.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 ? (
            <p className="empty">{tab === 'review' ? 'No guides are waiting for review.' : 'No guides here.'}</p>
          ) : null}
        </div>
      </section>

      {open ? (
        <>
          <div className="detail-scrim" onClick={() => (setSelectedId(null), setCreating(null))} />
          <aside className="detail" aria-label={selected ? selected.title : 'New guide'}>
            <div className="detail-head">
              <span className="meta muted">{selected ? `${causeName(selected.causeId)} · ${LANGUAGE_WORD[selected.language]} · version ${selected.version}` : 'New guide'}</span>
              <button className="icon-btn" aria-label="Close" onClick={() => (setSelectedId(null), setCreating(null))}>
                <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
                  <path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            {error ? <p className="flag">{error}</p> : null}
            {note ? <p className="sent">{note}</p> : null}
            {creating ? (
              <GuideForm
                key={`${creating.causeId}-${creating.language}`}
                initial={{ ...creating, title: '', steps: ['', '', ''], warning: '' }}
                isNew
                onSave={async (d, send) => {
                  const r = await act(() => api.save(null, d));
                  if (!r?.id) return;
                  if (send) await act(() => api.submit(r.id!), 'Sent for review. Someone else on the team approves it before farmers see it.');
                  else setNote('Draft saved. Farmers do not see drafts.');
                  setCreating(null);
                  setSelectedId(r.id);
                }}
              />
            ) : selected ? (
              <GuideDetail
                key={selected.id + selected.status + selected.updatedAt}
                guide={selected}
                all={guides}
                writer={writer}
                isAuthor={selected.authorId === org.myId}
                api={api}
                act={act}
                onSelect={pick}
                onCreate={(c) => (pick(null), setCreating(c))}
              />
            ) : null}
          </aside>
        </>
      ) : null}
    </div>
  );
}

function GuideDetail({
  guide: g,
  all,
  writer,
  isAuthor,
  api,
  act,
  onSelect,
  onCreate,
}: {
  guide: Guide;
  all: Guide[];
  writer: boolean;
  isAuthor: boolean;
  api: GuideApi;
  act: <T>(run: () => Promise<T>, done?: string) => Promise<T | null>;
  onSelect: (id: string) => void;
  onCreate: (c: Pick<Draft, 'causeId' | 'language'>) => void;
}) {
  const [editing, setEditing] = useState(g.status === 'draft' && writer && g.orgId != null);
  const [sendBack, setSendBack] = useState('');
  const [backOpen, setBackOpen] = useState(false);
  const other: Language = g.language === 'en' ? 'sw' : 'en';
  const sibling = all.find((x) => x.causeId === g.causeId && x.language === other && x.status !== 'retired');
  const live = all.find((x) => x.causeId === g.causeId && x.language === g.language && x.status === 'published' && x.id !== g.id);
  const own = g.orgId != null;

  if (editing)
    return (
      <>
        {g.reviewNote && g.status === 'draft' ? (
          <p className="sent-back">
            <strong>Sent back:</strong> {g.reviewNote}
          </p>
        ) : null}
        <GuideForm
          initial={{ causeId: g.causeId, language: g.language, title: g.title, steps: g.steps, warning: g.warning ?? '' }}
          onSave={async (d, send) => {
            const r = await act(() => api.save(g.id, d), send ? undefined : 'Draft saved. Farmers do not see drafts.');
            if (!r?.id) return;
            if (send) await act(() => api.submit(g.id), 'Sent for review. Someone else on the team approves it before farmers see it.');
          }}
          onDelete={async () => {
            if (confirm('Delete this draft?')) await act(() => api.retire(g.id), 'Draft deleted.');
          }}
        />
      </>
    );

  return (
    <>
      <h2>{g.title}</h2>
      <div className="facts">
        <span className={`tag ${TONE[g.status]}`}>{STATUS_WORD[g.status]}</span>
        {g.containsChemical ? <span className="chem">Names a chemical or dose</span> : null}
      </div>
      <p className="muted">
        Written by {g.authorName ?? 'someone who left'}
        {g.reviewerName ? ` · reviewed by ${g.reviewerName} on ${dateLabel(g.reviewedOn!)}` : ''}
        {!own ? ' · from ShambaSense, read only' : ''}
      </p>
      {g.containsChemical ? (
        <p className="flag">This guide names a product or a dose, so farmers do not see it while chemical advice is switched off for ShambaSense.</p>
      ) : null}
      {g.status === 'in_review' && live ? (
        <p className="muted meta">
          Replaces version {live.version}, which farmers see now.{' '}
          <button className="link" onClick={() => onSelect(live.id)}>
            Open it
          </button>
        </p>
      ) : null}

      <GuidePreview title={g.title} steps={g.steps} warning={g.warning} language={g.language} />

      {g.status === 'in_review' && writer && own ? (
        isAuthor ? (
          <p className="muted">Waiting for someone else on the team to review it. If you change it, it goes back to draft.</p>
        ) : (
          <section className="block">
            <h3>Review</h3>
            <p className="muted">Check that every step is safe, clear and right for farmers here. Approving puts it on farmers’ phones at their next sync.</p>
            {backOpen ? (
              <label className="field">
                <span className="field-label">What should change?</span>
                <textarea rows={3} value={sendBack} onChange={(e) => setSendBack(e.target.value)} />
              </label>
            ) : null}
            <div className="status-actions">
              {!backOpen ? (
                <>
                  <button className="btn btn-primary" onClick={() => act(() => api.review(g.id, true, ''), 'Approved. Farmers get it at their next sync.')}>
                    Approve and publish
                  </button>
                  <button className="btn btn-secondary" onClick={() => setBackOpen(true)}>
                    Send back
                  </button>
                </>
              ) : (
                <>
                  <button className="btn btn-primary" disabled={!sendBack.trim()} onClick={() => act(() => api.review(g.id, false, sendBack), 'Sent back to the author with your note.')}>
                    Send back
                  </button>
                  <button className="btn btn-secondary" onClick={() => setBackOpen(false)}>
                    Cancel
                  </button>
                </>
              )}
            </div>
          </section>
        )
      ) : null}

      {writer && own ? (
        <div className="status-actions">
          {g.status === 'in_review' || (g.status === 'draft' && !editing) ? (
            <button className="btn btn-secondary" onClick={() => setEditing(true)}>
              Edit
            </button>
          ) : null}
          {g.status === 'published' ? (
            <>
              <button
                className="btn btn-secondary"
                onClick={async () => {
                  const r = await act(() => api.newVersion(g.id));
                  if (r?.id) onSelect(r.id);
                }}>
                Make changes
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => confirm('Take this guide off farmers’ phones? It stays here as retired.') && act(() => api.retire(g.id), 'Retired. It leaves farmers’ phones at their next sync.')}>
                Retire
              </button>
            </>
          ) : null}
        </div>
      ) : null}

      <section className="block">
        <h3>{LANGUAGE_WORD[other]} version</h3>
        {sibling ? (
          <button className="link" onClick={() => onSelect(sibling.id)}>
            {sibling.title} ({STATUS_WORD[sibling.status].toLowerCase()})
          </button>
        ) : writer && own ? (
          <p className="muted">
            None yet.{' '}
            <button className="link" onClick={() => onCreate({ causeId: g.causeId, language: other })}>
              Write the {LANGUAGE_WORD[other]} version
            </button>
            . Write it fresh rather than translating word for word.
          </p>
        ) : (
          <p className="muted">None yet.</p>
        )}
      </section>
    </>
  );
}

/** How the guide looks on a farmer's phone, roughly. */
function GuidePreview({ title, steps, warning, language }: { title: string; steps: string[]; warning: string | null; language: Language }) {
  return (
    <section className="block">
      <h3>What farmers see</h3>
      <div className="phone-card" lang={language}>
        <p className="phone-title">{title}</p>
        <ol className="phone-steps">
          {steps.map((s, i) => (
            <li key={i}>
              <span className="phone-num">{i + 1}</span>
              <span>{s}</span>
            </li>
          ))}
        </ol>
        {warning ? <p className="phone-warn">{warning}</p> : null}
      </div>
    </section>
  );
}

function GuideForm({
  initial,
  isNew,
  onSave,
  onDelete,
}: {
  initial: Draft;
  isNew?: boolean;
  onSave: (d: Draft, send: boolean) => Promise<void>;
  onDelete?: () => void;
}) {
  const [d, setD] = useState<Draft>(initial);
  const [busy, setBusy] = useState(false);
  const flags = safetyFlags([d.title, ...d.steps, d.warning].join(' '));
  const filled = d.steps.filter((s) => s.trim()).length;
  const set = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }));
  const save = async (send: boolean) => {
    setBusy(true);
    await onSave(d, send);
    setBusy(false);
  };

  return (
    <form className="guide-form" onSubmit={(e) => (e.preventDefault(), save(false))}>
      {isNew ? (
        <div className="split">
          <label className="field">
            <span className="field-label">Problem</span>
            <select value={d.causeId} onChange={(e) => set({ causeId: e.target.value })}>
              {CAUSES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.en} ({cropWord(c.crop)})
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field-label">Language</span>
            <select value={d.language} onChange={(e) => set({ language: e.target.value as Language })}>
              <option value="en">English</option>
              <option value="sw">Kiswahili</option>
            </select>
          </label>
        </div>
      ) : (
        <h2>{d.title || 'Untitled guide'}</h2>
      )}
      <label className="field">
        <span className="field-label">Title</span>
        <input value={d.title} onChange={(e) => set({ title: e.target.value })} maxLength={120} placeholder={d.language === 'sw' ? 'e.g. Ukungu wa nyanya' : 'e.g. Late blight on tomatoes'} />
      </label>
      <fieldset className="field">
        <legend className="field-label">Steps</legend>
        <p className="muted meta">One action per step, in the order the farmer does them. Plain words, no product names or doses.</p>
        {d.steps.map((s, i) => (
          <div key={i} className="step-row">
            <span className="phone-num">{i + 1}</span>
            <textarea rows={2} value={s} maxLength={300} aria-label={`Step ${i + 1}`} onChange={(e) => set({ steps: d.steps.map((x, j) => (j === i ? e.target.value : x)) })} />
            <button type="button" className="icon-btn" aria-label={`Remove step ${i + 1}`} disabled={d.steps.length === 1} onClick={() => set({ steps: d.steps.filter((_, j) => j !== i) })}>
              <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden>
                <path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        ))}
        {d.steps.length < MAX_STEPS ? (
          <button type="button" className="link" onClick={() => set({ steps: [...d.steps, ''] })}>
            Add a step
          </button>
        ) : null}
      </fieldset>
      <label className="field">
        <span className="field-label">When to ask an agronomist</span>
        <textarea rows={2} value={d.warning} maxLength={300} onChange={(e) => set({ warning: e.target.value })} />
      </label>
      {flags.length ? (
        <p className="flag">
          Mentions {flags.join(', ')}. Farmers will not see this guide while chemical advice is switched off.
        </p>
      ) : null}
      <div className="status-actions">
        <button type="button" className="btn btn-primary" disabled={busy || !d.title.trim() || !filled} onClick={() => save(true)}>
          Send for review
        </button>
        <button className="btn btn-secondary" disabled={busy || !d.title.trim() || !filled}>
          Save draft
        </button>
        {onDelete ? (
          <button type="button" className="link danger" onClick={onDelete}>
            Delete draft
          </button>
        ) : null}
      </div>
    </form>
  );
}
