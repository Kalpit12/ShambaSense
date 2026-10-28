'use client';

import { CROP_NAME } from '@/lib/causes';
import { ago, daysUntil, dateLabel } from '@/lib/format';
import { TEAM } from '@/lib/sample';
import { useStore } from '@/lib/store';
import type { Severity } from '@/lib/types';
import { SeverityMark, StatusTag } from './marks';

/** Overview (design.md §10): a row of counts, then tables. No doughnuts. */
export function Overview({ onOpen }: { onOpen: (id: string) => void }) {
  const { issues } = useStore();
  const active = issues.filter((i) => i.status !== 'closed');
  const needsReview = issues.filter((i) => i.status === 'open' || i.status === 'in_review');
  const bySeverity = (s: Severity) => needsReview.filter((i) => i.severity === s).length;
  const aiWaiting = issues.filter((i) => i.ai && i.status === 'open').length;
  const followUps = active.filter((i) => i.followUpDue);
  const overdue = followUps.filter((i) => daysUntil(i.followUpDue!) < 0);
  const dueSoon = followUps.filter((i) => {
    const d = daysUntil(i.followUpDue!);
    return d >= 0 && d <= 2;
  });
  const oldest = [...needsReview].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).slice(0, 5);

  return (
    <div className="page">
      <div className="page-head">
        <h1>Overview</h1>
        <p className="muted">What needs an agronomist today.</p>
      </div>

      <div className="widgets">
        <div className="widget">
          <span className="w-label">Cases needing review</span>
          <span className="w-value num">{needsReview.length}</span>
          <span className="w-sub">
            <SeverityMark severity="high" /> {bySeverity('high')} · <SeverityMark severity="medium" /> {bySeverity('medium')} · <SeverityMark severity="low" /> {bySeverity('low')}
          </span>
        </div>
        <div className="widget">
          <span className="w-label">AI cases waiting for review</span>
          <span className="w-value num">{aiWaiting}</span>
          <span className="w-sub">Not yet opened by anyone</span>
        </div>
        <div className={`widget ${overdue.length ? 'widget-warn' : ''}`}>
          <span className="w-label">Overdue follow-ups</span>
          <span className="w-value num">{overdue.length}</span>
          <span className="w-sub">Follow-up photo not received</span>
        </div>
        <div className="widget">
          <span className="w-label">Follow-ups due in 2 days</span>
          <span className="w-value num">{dueSoon.length}</span>
          <span className="w-sub">Farmers get a reminder SMS</span>
        </div>
        <div className="widget">
          <span className="w-label">Sync failures</span>
          <span className="w-value num">0</span>
          <span className="w-sub">Phones with uploads stuck</span>
        </div>
      </div>

      <section className="panel">
        <h2>Waiting longest</h2>
        <table className="table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Case</th>
              <th className="c-crop">Crop</th>
              <th>Severity</th>
              <th>Status</th>
              <th className="c-updated">Sent</th>
            </tr>
          </thead>
          <tbody>
            {oldest.map((i) => (
              <tr key={i.id} onClick={() => onOpen(i.id)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onOpen(i.id)}>
                <td className="mono">{i.code}</td>
                <td>
                  <div className="row-title">{i.title}</div>
                  <div className="row-sub">
                    {i.farmer.name} · {i.plot}
                  </div>
                </td>
                <td className="c-crop">{CROP_NAME[i.crop]}</td>
                <td>
                  <SeverityMark severity={i.severity} />
                </td>
                <td>
                  <StatusTag status={i.status} />
                </td>
                <td className="c-updated meta num">{ago(i.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {oldest.length === 0 ? <p className="empty">Nothing waiting.</p> : null}
      </section>

      <div className="two">
        <section className="panel">
          <h2>Follow-ups</h2>
          <table className="table">
            <thead>
              <tr>
                <th>Case</th>
                <th>Due</th>
              </tr>
            </thead>
            <tbody>
              {followUps.map((i) => {
                const d = daysUntil(i.followUpDue!);
                return (
                  <tr key={i.id} className={d < 0 ? 'overdue-row' : ''} onClick={() => onOpen(i.id)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onOpen(i.id)}>
                    <td>
                      <div className="row-title">{i.farmer.name}</div>
                      <div className="row-sub">
                        <span className="mono">{i.code}</span> · {i.plot}
                      </div>
                    </td>
                    <td className="num">{d < 0 ? `Overdue · ${dateLabel(i.followUpDue!)}` : dateLabel(i.followUpDue!)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {followUps.length === 0 ? <p className="empty">No follow-ups set.</p> : null}
        </section>
        <section className="panel">
          <h2>Team</h2>
          <table className="table">
            <thead>
              <tr>
                <th>Person</th>
                <th className="r">Open cases</th>
              </tr>
            </thead>
            <tbody>
              {[...TEAM, null].map((p) => (
                <tr key={p ?? 'none'} className="static">
                  <td>{p ?? <span className="muted">Unassigned</span>}</td>
                  <td className="r num">{active.filter((i) => i.assignee === p).length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}
