import { STATUS_LABEL, SEVERITY_LABEL } from '@/lib/format';
import type { CheckState, IssueStatus, Likelihood, Outcome, Severity } from '@/lib/types';

// Status is shape + colour + word, never colour alone (design.md §5.5). Lime is never a status.

export function SeverityMark({ severity }: { severity: Severity }) {
  const c = severity === 'high' ? 'var(--red-700)' : severity === 'medium' ? 'var(--amber-800)' : 'var(--stone-600)';
  return (
    <span className="sev" style={{ color: c }}>
      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
        {severity === 'high' ? <path d="M5 0.5 L9.6 9.2 H0.4Z" fill={c} /> : severity === 'medium' ? <path d="M5 0.5 L9.5 5 L5 9.5 L0.5 5Z" fill={c} /> : <circle cx="5" cy="5" r="3.6" fill="none" stroke={c} strokeWidth="1.6" />}
      </svg>
      {SEVERITY_LABEL[severity]}
    </span>
  );
}

const STATUS_TONE: Record<IssueStatus, string> = {
  open: 'tone-red',
  in_review: 'tone-forest',
  waiting_farmer: 'tone-sky',
  action_given: 'tone-stone',
  monitoring: 'tone-amber',
  closed: 'tone-quiet',
};

export function StatusTag({ status }: { status: IssueStatus }) {
  return (
    <span className={`tag ${STATUS_TONE[status]}`}>
      <span className="tag-dot" aria-hidden />
      {STATUS_LABEL[status]}
    </span>
  );
}

const OUTCOME: Record<Outcome, { label: string; tone: string; d: string }> = {
  better: { label: 'Better', tone: 'tone-forest', d: 'M1 9 L5 5 L7 7 L11 2 M7.5 2 H11 V5.5' },
  same: { label: 'About the same', tone: 'tone-stone', d: 'M1.5 4 H10.5 M1.5 8 H10.5' },
  worse: { label: 'Worse', tone: 'tone-amber', d: 'M1 3 L5 7 L7 5 L11 10 M7.5 10 H11 V6.5' },
};

/** The farmer's own verdict on a follow-up photo, with an arrow so it never relies on colour. */
export function OutcomeTag({ outcome, prefix }: { outcome: Outcome; prefix?: string }) {
  const o = OUTCOME[outcome];
  return (
    <span className={`tag ${o.tone}`}>
      <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
        <path d={o.d} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {prefix ? `${prefix} ${o.label.toLowerCase()}` : o.label}
    </span>
  );
}

const AI_LABEL: Record<CheckState, string> = {
  possible_match: 'Possible match',
  needs_more_information: 'Needs another photo',
  expert_review_required: 'No answer, needs you',
  unsupported_crop: 'Crop not in library',
};

export function AiState({ state }: { state: CheckState }) {
  return <span className="ai-state">{AI_LABEL[state]}</span>;
}

export const LIKELIHOOD: Record<Likelihood, string> = { more_likely: 'More likely', possible: 'Possible' };
