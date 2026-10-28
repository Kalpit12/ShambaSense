import type { Issue, IssueEvent } from './types';

// Follow-up photos arrive as 'follow_up_result' events (architecture.md §10). A follow-up is "new"
// until an agronomist answers after it.

const REVIEWS = new Set(['review_agree', 'review_adjust', 'review_reject', 'request_photos']);

export const followUpsOf = (issue: Issue) => issue.events.filter((e) => e.kind === 'follow_up_result');

export function newFollowUp(issue: Issue): IssueEvent | null {
  if (issue.status === 'closed') return null;
  let latest: IssueEvent | null = null;
  for (const e of issue.events) {
    if (e.kind === 'follow_up_result') latest = e;
    else if (REVIEWS.has(e.kind)) latest = null;
  }
  return latest;
}
