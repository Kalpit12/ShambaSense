import type { Issue } from '@/lib/types';
import { Leaf } from './leaf';

/** A case photo: the real one through its short-lived signed URL, or the sample drawing. */
export function CasePhoto({ issue, index = 0, label }: { issue: Issue; index?: number; label?: string }) {
  const url = issue.photoUrls?.[index];
  if (url)
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={label ?? 'Farmer photo'} style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' }} />;
  if (issue.photoUrls) return <div className="well-empty" style={{ height: '100%' }}>No photo yet</div>;
  return <Leaf photo={issue.photos[index] ?? issue.photos[0]} label={label} />;
}
