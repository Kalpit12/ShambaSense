import type { IssueStatus, Severity } from './types';

export const STATUS_LABEL: Record<IssueStatus, string> = {
  open: 'Needs review',
  in_review: 'In review',
  waiting_farmer: 'Waiting for farmer',
  action_given: 'Action given',
  monitoring: 'Monitoring',
  closed: 'Closed',
};

export const SEVERITY_LABEL: Record<Severity, string> = { high: 'High', medium: 'Medium', low: 'Low' };

/** "5 min ago", "3 h ago", "2 d ago", in Nairobi time for anything older. */
export function ago(iso: string) {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d} d ago`;
  return dateLabel(iso);
}

export function dateLabel(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Africa/Nairobi' });
}

export function timeLabel(iso: string) {
  return new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Nairobi' });
}

/** Days from today to a YYYY-MM-DD date; negative when it has passed. */
export function daysUntil(day: string) {
  const today = new Date();
  const t = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const [y, m, d] = day.split('-').map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - t) / 86400_000);
}
