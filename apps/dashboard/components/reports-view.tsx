'use client';

import { useMemo, useState } from 'react';

import { useStore } from '@/lib/store';
import {
  caseRows,
  casesCsv,
  causeOf,
  cropOf,
  download,
  groupBy,
  groupCsv,
  hoursLabel,
  inPeriod,
  PERIODS,
  summary,
  teamOf,
  wardOf,
  type GroupRow,
  type Period,
} from '@/lib/reports';

/** Reports (design.md §10): a period filter, a row of counts, then tables, each with its own CSV. */
export function ReportsView() {
  const { issues, org } = useStore();
  const [days, setDays] = useState<Period>(30);
  const all = useMemo(() => caseRows(issues), [issues]);
  const rows = useMemo(() => inPeriod(all, days), [all, days]);
  const s = summary(rows);
  const byCrop = groupBy(rows, cropOf);
  const byWard = groupBy(rows, wardOf);
  const byCause = groupBy(rows, causeOf);
  const byTeam = groupBy(rows, teamOf);
  const period = PERIODS.find((p) => p.days === days)!.label.toLowerCase();
  const stamp = new Date().toISOString().slice(0, 10);
  const file = (what: string) => `${(org?.name ?? 'shambasense').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${what}-${days ? `${days}d` : 'all'}-${stamp}.csv`;

  return (
    <div className="page">
      <div className="page-head report-head">
        <div>
          <h1>Reports</h1>
          <p className="muted">How quickly farmers get answers, and what is going wrong in the fields, for {period}.</p>
        </div>
        <button className="btn btn-primary" onClick={() => download(file('cases'), casesCsv(rows))} disabled={!rows.length}>
          Download cases (CSV)
        </button>
      </div>

      <div className="tabs" role="tablist" aria-label="Period">
        {PERIODS.map((p) => (
          <button key={p.days} role="tab" aria-selected={days === p.days} className={`tab ${days === p.days ? 'on' : ''}`} onClick={() => setDays(p.days)}>
            {p.label}
          </button>
        ))}
      </div>

      <div className="widgets">
        <div className="widget">
          <span className="w-label">Cases received</span>
          <span className="w-value num">{s.received}</span>
          <span className="w-sub">{s.open} still open</span>
        </div>
        <div className="widget">
          <span className="w-label">Median time to first reply</span>
          <span className="w-value num">{hoursLabel(s.medianReply)}</span>
          <span className="w-sub">Across {s.replied} answered cases</span>
        </div>
        <div className={`widget ${s.replied && s.within24 < 80 ? 'widget-warn' : ''}`}>
          <span className="w-label">Answered within 24 hours</span>
          <span className="w-value num">{s.replied ? `${s.within24}%` : '–'}</span>
          <span className="w-sub">{s.waiting ? `${s.waiting} waiting for a first reply` : 'None waiting for a first reply'}</span>
        </div>
        <div className="widget">
          <span className="w-label">Follow-ups: crop better</span>
          <span className="w-value num">{s.followUps ? `${Math.round((s.outcomes.better / s.followUps) * 100)}%` : '–'}</span>
          <span className="w-sub">
            {s.followUps ? `${s.outcomes.better} better · ${s.outcomes.same} same · ${s.outcomes.worse} worse` : 'No follow-up photos yet'}
          </span>
        </div>
      </div>

      {rows.length === 0 ? (
        <section className="panel">
          <p className="empty">No cases in this period. Try a longer one.</p>
        </section>
      ) : (
        <>
          <div className="two">
            <GroupTable title="By crop" label="Crop" rows={byCrop} onCsv={() => download(file('by-crop'), groupCsv('Crop', byCrop))} />
            <GroupTable title="By ward" label="Ward" rows={byWard} onCsv={() => download(file('by-ward'), groupCsv('Ward', byWard))} />
          </div>
          <div className="two">
            <GroupTable
              title="Causes agronomists confirmed"
              label="Cause"
              rows={byCause}
              note="Only cases where an agronomist named a cause."
              onCsv={() => download(file('by-cause'), groupCsv('Cause', byCause))}
            />
            <GroupTable
              title="Team"
              label="First reply by"
              rows={byTeam}
              note="Cases each person answered first."
              onCsv={() => download(file('by-team'), groupCsv('First reply by', byTeam))}
            />
          </div>
        </>
      )}
      {issues.length >= 200 ? <p className="muted meta">Reports use the latest 200 cases.</p> : null}
    </div>
  );
}

function GroupTable({ title, label, rows, note, onCsv }: { title: string; label: string; rows: GroupRow[]; note?: string; onCsv: () => void }) {
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>{title}</h2>
        <button className="btn btn-small" onClick={onCsv} disabled={!rows.length}>
          CSV
        </button>
      </div>
      {rows.length ? (
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th>{label}</th>
                <th className="r">Cases</th>
                <th className="r">Open</th>
                <th className="r">Median reply</th>
                <th className="r c-seen">Within 24 h</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((g) => (
                <tr key={g.key} className="static">
                  <td>{g.key}</td>
                  <td className="r num">{g.cases}</td>
                  <td className="r num">{g.open || <span className="muted">0</span>}</td>
                  <td className="r num">{hoursLabel(g.medianReply)}</td>
                  <td className="r num c-seen">{g.medianReply == null ? '–' : `${g.within24}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="empty">Nothing yet.</p>
      )}
      {note ? <p className="panel-note muted meta">{note}</p> : null}
    </section>
  );
}
