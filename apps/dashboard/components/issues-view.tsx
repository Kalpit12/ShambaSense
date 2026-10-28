'use client';

import { useEffect, useMemo, useState } from 'react';

import { CROP_NAME } from '@/lib/causes';
import { ago } from '@/lib/format';
import { newFollowUp } from '@/lib/follow-ups';
import { useStore } from '@/lib/store';
import type { Crop, Issue, IssueStatus, Severity } from '@/lib/types';
import { IssueDetail } from './issue-detail';
import { CasePhoto } from './photo';
import { SeverityMark, StatusTag } from './marks';

type Tab = 'review' | 'waiting' | 'follow' | 'closed' | 'all';
const TABS: { key: Tab; label: string; statuses: IssueStatus[] | null }[] = [
  { key: 'review', label: 'Needs review', statuses: ['open', 'in_review'] },
  { key: 'waiting', label: 'Waiting for farmer', statuses: ['waiting_farmer'] },
  { key: 'follow', label: 'Follow-up', statuses: ['action_given', 'monitoring'] },
  { key: 'closed', label: 'Closed', statuses: ['closed'] },
  { key: 'all', label: 'All', statuses: null },
];
const SEV_ORDER: Record<Severity, number> = { high: 0, medium: 1, low: 2 };

/** Crop issues: the agronomist's default page. List of cases, detail beside it (≥1280) or over it. */
export function IssuesView({ search, selectedId, onSelect }: { search: string; selectedId: string | null; onSelect: (id: string | null) => void }) {
  const { issues } = useStore();
  const [tab, setTab] = useState<Tab>('review');
  const [crop, setCrop] = useState<Crop | 'all'>('all');

  const rows = useMemo(() => {
    const statuses = TABS.find((t) => t.key === tab)!.statuses;
    const q = search.trim().toLowerCase();
    return issues
      .filter((i) => !statuses || statuses.includes(i.status))
      .filter((i) => crop === 'all' || i.crop === crop)
      .filter((i) => !q || [i.code, i.title, i.farmer.name, i.plot, i.farm, i.farmer.ward].some((s) => s.toLowerCase().includes(q)))
      .sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity] || a.createdAt.localeCompare(b.createdAt));
  }, [issues, tab, crop, search]);

  const counts = useMemo(() => Object.fromEntries(TABS.map((t) => [t.key, issues.filter((i) => !t.statuses || t.statuses.includes(i.status)).length])), [issues]);
  const crops = Array.from(new Set(issues.map((i) => i.crop)));
  const selected = issues.find((i) => i.id === selectedId) ?? null;

  // Escape closes the overlay detail.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onSelect(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onSelect]);

  return (
    <div className={`issues ${selected ? 'with-detail' : ''}`}>
      <section className="list-pane" aria-label="Crop issues">
        <div className="page-head">
          <h1>Crop issues</h1>
          <p className="muted">Checks farmers sent to an agronomist, and checks the library could not answer.</p>
        </div>
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

        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th className="c-photo"><span className="sr-only">Photo</span></th>
                <th>ID</th>
                <th>Case</th>
                <th className="c-crop">Crop</th>
                <th className="c-sev">Severity</th>
                <th>Status</th>
                <th className="c-assignee">Assignee</th>
                <th className="c-updated">Updated</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((i) => (
                <Row key={i.id} issue={i} selected={i.id === selectedId} onSelect={() => onSelect(i.id)} />
              ))}
            </tbody>
          </table>
          {rows.length === 0 ? <p className="empty">No cases here. {tab === 'review' ? 'The queue is clear.' : ''}</p> : null}
        </div>
      </section>

      {selected ? (
        <>
          <div className="detail-scrim" onClick={() => onSelect(null)} />
          <IssueDetail key={selected.id} issue={selected} onClose={() => onSelect(null)} />
        </>
      ) : null}
    </div>
  );
}

function Row({ issue: i, selected, onSelect }: { issue: Issue; selected: boolean; onSelect: () => void }) {
  return (
    <tr className={selected ? 'selected' : ''} onClick={onSelect} tabIndex={0} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onSelect())} aria-selected={selected}>
      <td className="c-photo">
        <span className="thumb">
          <CasePhoto issue={i} />
        </span>
      </td>
      <td className="mono">{i.code}</td>
      <td>
        <div className="row-title">{i.title}</div>
        {newFollowUp(i) ? <span className="new-photo">New follow-up photo</span> : null}
        <div className="row-sub">
          {i.farmer.name} · {i.plot}
        </div>
        <div className="row-sev">
          <SeverityMark severity={i.severity} />
        </div>
      </td>
      <td className="c-crop">{CROP_NAME[i.crop]}</td>
      <td className="c-sev">
        <SeverityMark severity={i.severity} />
      </td>
      <td>
        <StatusTag status={i.status} />
      </td>
      <td className="c-assignee">{i.assignee ?? <span className="muted">Unassigned</span>}</td>
      <td className="c-updated meta num">{ago(i.updatedAt)}</td>
    </tr>
  );
}
