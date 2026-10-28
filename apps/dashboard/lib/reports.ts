import { causeById, CROP_NAME } from './causes';
import { STATUS_LABEL } from './format';
import type { Issue, Outcome } from './types';

// Co-op reports (design.md §10: filters + table + CSV). Everything is worked out from the cases the
// dashboard already reads, so a report never shows a case the member could not open.

const REVIEWS = new Set(['review_agree', 'review_adjust', 'review_reject', 'request_photos']);
const ANSWERS = new Set(['review_agree', 'review_adjust']);

export type Period = 7 | 30 | 90 | 0;
export const PERIODS: { days: Period; label: string }[] = [
  { days: 7, label: 'Last 7 days' },
  { days: 30, label: 'Last 30 days' },
  { days: 90, label: 'Last 90 days' },
  { days: 0, label: 'All time' },
];

/** One case, with what a report needs about it. */
export type CaseRow = {
  issue: Issue;
  /** First agronomist reply or photo request. */
  firstReplyAt: string | null;
  replyHours: number | null;
  repliedBy: string | null;
  /** The cause the agronomist settled on last, if any. */
  causeId: string | null;
  /** The farmer's latest follow-up verdict. */
  outcome: Outcome | null;
};

export function caseRows(issues: Issue[]): CaseRow[] {
  return issues.map((issue) => {
    const first = issue.events.find((e) => e.actorKind === 'agronomist' && REVIEWS.has(e.kind));
    const answers = issue.events.filter((e) => ANSWERS.has(e.kind) && e.causeIds?.length);
    const follow = issue.events.filter((e) => e.kind === 'follow_up_result' && e.outcome);
    return {
      issue,
      firstReplyAt: first?.at ?? null,
      replyHours: first ? (new Date(first.at).getTime() - new Date(issue.createdAt).getTime()) / 3600_000 : null,
      repliedBy: first?.actor ?? null,
      causeId: answers.at(-1)?.causeIds?.[0] ?? null,
      outcome: follow.at(-1)?.outcome ?? null,
    };
  });
}

export const inPeriod = (rows: CaseRow[], days: Period) =>
  days === 0 ? rows : rows.filter((r) => Date.now() - new Date(r.issue.createdAt).getTime() <= days * 86400_000);

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** "45 min", "6 h", "1.5 d". */
export function hoursLabel(h: number | null) {
  if (h == null) return '–';
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min`;
  if (h < 48) return `${Math.round(h)} h`;
  return `${(h / 24).toFixed(1)} d`;
}

const pct = (n: number, of: number) => (of ? Math.round((n / of) * 100) : 0);

export function summary(rows: CaseRow[]) {
  const replied = rows.filter((r) => r.replyHours != null);
  const outcomes = { better: 0, same: 0, worse: 0 };
  for (const r of rows) if (r.outcome) outcomes[r.outcome]++;
  return {
    received: rows.length,
    open: rows.filter((r) => r.issue.status !== 'closed').length,
    waiting: rows.filter((r) => r.replyHours == null && r.issue.status !== 'closed').length,
    medianReply: median(replied.map((r) => r.replyHours!)),
    within24: pct(replied.filter((r) => r.replyHours! <= 24).length, replied.length),
    replied: replied.length,
    outcomes,
    followUps: outcomes.better + outcomes.same + outcomes.worse,
  };
}

export type GroupRow = { key: string; cases: number; open: number; medianReply: number | null; within24: number; better: number; followUps: number };

/** Cases grouped by crop, ward or anything else, most cases first. */
export function groupBy(rows: CaseRow[], keyOf: (r: CaseRow) => string | null): GroupRow[] {
  const groups = new Map<string, CaseRow[]>();
  for (const r of rows) {
    const k = keyOf(r);
    if (k == null) continue;
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  return [...groups.entries()]
    .map(([key, rs]) => {
      const s = summary(rs);
      return { key, cases: rs.length, open: s.open, medianReply: s.medianReply, within24: s.within24, better: s.outcomes.better, followUps: s.followUps };
    })
    .sort((a, b) => b.cases - a.cases || a.key.localeCompare(b.key));
}

export const cropOf = (r: CaseRow) => CROP_NAME[r.issue.crop] ?? r.issue.crop;
export const wardOf = (r: CaseRow) => [r.issue.farmer.ward, r.issue.farmer.county].filter(Boolean).join(', ') || 'Not set';
export const causeOf = (r: CaseRow) => (r.causeId ? (causeById(r.causeId)?.en ?? r.causeId) : null);
export const teamOf = (r: CaseRow) => r.repliedBy;

// CSV ------------------------------------------------------------------------------------------

function cell(v: string | number | null | undefined) {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(head: string[], rows: (string | number | null | undefined)[][]) {
  return [head, ...rows].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}

const day = (iso: string | null) => (iso ? new Date(iso).toLocaleString('sv-SE', { timeZone: 'Africa/Nairobi' }).slice(0, 16) : '');

export function casesCsv(rows: CaseRow[]) {
  return toCsv(
    ['Case', 'Sent (Nairobi)', 'Farmer', 'Ward', 'County', 'Crop', 'Title', 'Severity', 'Status', 'Assigned to', 'First reply (Nairobi)', 'Hours to first reply', 'Replied by', 'Cause', 'Latest follow-up'],
    rows.map((r) => [
      r.issue.code,
      day(r.issue.createdAt),
      r.issue.farmer.name,
      r.issue.farmer.ward,
      r.issue.farmer.county,
      cropOf(r),
      r.issue.title,
      r.issue.severity,
      STATUS_LABEL[r.issue.status],
      r.issue.assignee,
      day(r.firstReplyAt),
      r.replyHours == null ? '' : r.replyHours.toFixed(1),
      r.repliedBy,
      causeOf(r),
      r.outcome,
    ]),
  );
}

export function groupCsv(label: string, rows: GroupRow[]) {
  return toCsv(
    [label, 'Cases', 'Still open', 'Median hours to first reply', '% answered within 24 h', 'Follow-ups', 'Follow-ups better'],
    rows.map((g) => [g.key, g.cases, g.open, g.medianReply == null ? '' : g.medianReply.toFixed(1), g.within24, g.followUps, g.better]),
  );
}

/** Saves a CSV in the browser. The BOM makes Excel read Kiswahili names correctly. */
export function download(name: string, csv: string) {
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
