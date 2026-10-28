import type { CropCheck, FollowUp } from './farm-store';

// Where a check stands on its follow-up photo, for the result screen and Home's "Today" list.
export type FollowUpState =
  | { kind: 'none' }
  | { kind: 'requested' | 'due' | 'overdue' | 'upcoming'; due?: string }
  | { kind: 'sent'; latest: FollowUp }
  | { kind: 'closed' };

/** Follow-ups for one check, newest first. */
export const followUpsOf = (followUps: FollowUp[], checkId: string) =>
  followUps.filter((f) => f.parentId === checkId).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

export function followUpState(check: CropCheck, followUps: FollowUp[], today: string): FollowUpState {
  if (check.caseClosed) return { kind: 'closed' };
  const reply = check.reply;
  if (!reply) return { kind: 'none' };
  // A follow-up newer than the answer is the farmer's move; the next move is the agronomist's.
  const latest = followUpsOf(followUps, check.id)[0];
  if (latest && latest.createdAt > reply.at) return { kind: 'sent', latest };
  if (reply.kind === 'request_photos') return { kind: 'requested', due: reply.followUpDue };
  const due = reply.followUpDue;
  if (!due) return { kind: 'none' };
  return { kind: due < today ? 'overdue' : due === today ? 'due' : 'upcoming', due };
}

/** True when Home should ask for the photo today. */
export const followUpNeeded = (s: FollowUpState) => s.kind === 'requested' || s.kind === 'due' || s.kind === 'overdue';
