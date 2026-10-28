'use client';

import { useState } from 'react';

import { causeById, causesFor, CROP_NAME } from '@/lib/causes';
import { daysUntil, dateLabel, STATUS_LABEL, timeLabel } from '@/lib/format';
import { followUpsOf, newFollowUp } from '@/lib/follow-ups';
import { safetyFlags } from '@/lib/safety';
import { useStore, type ReviewKind } from '@/lib/store';
import type { Issue, IssueEvent, Photo } from '@/lib/types';
import { Leaf } from './leaf';
import { CasePhoto } from './photo';
import { AiState, LIKELIHOOD, OutcomeTag, SeverityMark, StatusTag } from './marks';

const ACTIONS: { kind: ReviewKind; label: string }[] = [
  { kind: 'review_agree', label: 'Agree' },
  { kind: 'review_adjust', label: 'Adjust' },
  { kind: 'review_reject', label: 'Reject' },
  { kind: 'request_photos', label: 'Request more photos' },
];

/**
 * Case detail (design.md §10): photos, evidence split, what the farmer said, the AI suggestion
 * (dashed sky, never copied into human fields), review actions and the case history.
 */
export function IssueDetail({ issue, onClose }: { issue: Issue; onClose: () => void }) {
  const { assignToMe, setStatus } = useStore();
  const [photo, setPhoto] = useState<Photo>(issue.photos[0]);
  const ai = issue.ai;
  const top = ai?.state === 'possible_match' ? ai.causes[0] : undefined;
  const due = issue.followUpDue ? daysUntil(issue.followUpDue) : null;
  const closed = issue.status === 'closed';
  const fresh = newFollowUp(issue);
  const followUps = followUpsOf(issue);

  return (
    <aside className="detail" aria-label={`Case ${issue.code}`}>
      <div className="detail-head">
        <span className="mono muted">{issue.code}</span>
        <button className="icon-btn" aria-label="Close case" onClick={onClose}>
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
            <path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      <h2>{issue.title}</h2>
      <p className="muted">
        {[issue.farmer.name, [issue.farmer.ward, issue.farmer.county].filter(Boolean).join(', '), issue.farmer.phone].filter(Boolean).join(' · ')} · reads {issue.farmer.language === 'sw' ? 'Kiswahili' : 'English'}
      </p>
      <p className="muted">
        {issue.farm} · {issue.plot} · {CROP_NAME[issue.crop]} · sent {timeLabel(issue.createdAt)}
      </p>

      <div className="facts">
        <StatusTag status={issue.status} />
        <SeverityMark severity={issue.severity} />
        <span className="meta">{issue.assignee ? `Assigned to ${issue.assignee}` : 'Unassigned'}</span>
        {!closed && issue.assignee == null ? (
          <button className="btn btn-small" onClick={() => assignToMe(issue.id)}>
            Assign to me
          </button>
        ) : null}
      </div>
      {fresh ? (
        <div className="fresh">
          <p>
            <strong>New follow-up photo</strong> from {issue.farmer.name}, {timeLabel(fresh.at)}. Compare it with the first photo and reply.
          </p>
          {fresh.outcome ? <OutcomeTag outcome={fresh.outcome} prefix="Farmer says" /> : null}
        </div>
      ) : null}
      {due != null && !closed ? (
        <p className={`due ${due < 0 ? 'overdue' : ''}`}>
          Follow-up photo {due < 0 ? `overdue since ${dateLabel(issue.followUpDue!)}` : due === 0 ? 'due today' : `due ${dateLabel(issue.followUpDue!)}`}
        </p>
      ) : null}

      {followUps.length ? <FollowUpCompare issue={issue} /> : null}

      <section className="block">
        <div className="split">
          <figure>
            <figcaption>Farmer’s photo</figcaption>
            <div className="well">
              <CasePhoto issue={issue} index={Math.max(0, issue.photos.indexOf(photo))} label="Farmer photo" />
            </div>
          </figure>
          <figure>
            <figcaption>Similar reviewed case</figcaption>
            {top ? (
              <div className="well">
                <Leaf photo={top.id as Photo} label="Reference (sample drawing)" />
              </div>
            ) : (
              <div className="well well-empty">No reference for this case</div>
            )}
          </figure>
        </div>
        {!issue.photoUrls && issue.photos.length > 1 ? (
          <div className="gallery" role="group" aria-label="Photos">
            {issue.photos.map((p, n) => (
              <button key={p + n} className={`gal ${p === photo ? 'on' : ''}`} onClick={() => setPhoto(p)} aria-label={`Photo ${n + 1}`} aria-pressed={p === photo}>
                <Leaf photo={p} />
              </button>
            ))}
          </div>
        ) : null}
        {issue.photoUrls ? null : <p className="meta muted">Sample drawings stand in for photos. Opening a real photo is written to the audit log.</p>}
      </section>

      <section className="block">
        <h3>Farmer said</h3>
        <div className="chips">
          {issue.symptoms.map((s) => (
            <span key={s} className="chip">
              {s}
            </span>
          ))}
        </div>
      </section>

      {ai ? (
        <section className="block ai" aria-label="AI suggestion">
          <div className="ai-head">
            <span className="ai-label">AI suggestion · not reviewed</span>
            <AiState state={ai.state} />
          </div>
          {ai.causes.length ? (
            <ul className="ai-causes">
              {ai.causes.map((c) => (
                <li key={c.id}>
                  <span>
                    {causeById(c.id)?.en} <i className="muted">{causeById(c.id)?.latin}</i>
                  </span>
                  <span className="likely">{LIKELIHOOD[c.likelihood]}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">No cause suggested.</p>
          )}
          <p className="meta muted">Library {ai.library}. Scores stay on the server and are not shown.</p>
        </section>
      ) : null}

      {!closed ? <ReviewComposer issue={issue} /> : null}

      <section className="block">
        <h3>History</h3>
        <ol className="timeline">
          {issue.events.map((e) => (
            <EventLine key={e.id} e={e} issue={issue} />
          ))}
        </ol>
        <p className="meta muted">Every review action is also written to the audit log.</p>
      </section>

      {!closed ? (
        <div className="status-actions">
          {issue.status !== 'monitoring' ? (
            <button className="btn btn-secondary" onClick={() => setStatus(issue.id, 'monitoring')}>
              Mark as monitoring
            </button>
          ) : null}
          <button className="btn btn-secondary" onClick={() => setStatus(issue.id, 'closed')}>
            Close case
          </button>
          <a className="btn btn-secondary" href={taskLink(issue, 'farmer')}>
            Give the farmer a task
          </a>
          <a className="btn btn-secondary" href={taskLink(issue, 'visit')}>
            Plan a visit
          </a>
        </div>
      ) : (
        <div className="status-actions">
          <button className="btn btn-secondary" onClick={() => setStatus(issue.id, 'open')}>
            Reopen
          </button>
        </div>
      )}
    </aside>
  );
}

/** Opens the Tasks page with a new task or visit for this case's farmer filled in. */
function taskLink(issue: Issue, kind: 'farmer' | 'visit') {
  const q = new URLSearchParams({ new: kind, issue: issue.id, farmer: issue.farmerId ?? '', name: issue.farmer.name });
  return `#tasks?${q}`;
}

/** Agree / Adjust / Reject / Request more photos, with the reply the farmer will read. */
function ReviewComposer({ issue }: { issue: Issue }) {
  const { review, mode } = useStore();
  const ai = issue.ai;
  const canAgree = ai?.state === 'possible_match' && ai.causes.length > 0;
  const [kind, setKind] = useState<ReviewKind | null>(null);
  const [causeIds, setCauseIds] = useState<string[]>([]);
  const [body, setBody] = useState('');
  const [followUp, setFollowUp] = useState<number | null>(3);
  const [sent, setSent] = useState<string | null>(null);
  const sw = issue.farmer.language === 'sw';

  const choose = (k: ReviewKind) => {
    setKind(k);
    setSent(null);
    setCauseIds(k === 'review_agree' && ai ? [ai.causes[0].id] : []);
    setFollowUp(k === 'request_photos' || k === 'review_reject' ? null : 3);
    setBody('');
  };

  const options = kind === 'review_agree' ? (ai?.causes.map((c) => c.id) ?? []) : causesFor(issue.crop).map((c) => c.id);
  const needsCause = kind === 'review_agree' || kind === 'review_adjust';
  const flags = safetyFlags(body);
  const ready = kind && body.trim().length > 0 && (!needsCause || causeIds.length > 0);

  const toggle = (id: string) => setCauseIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur.length >= 2 ? cur : [...cur, id]));

  const template = () => {
    const names = causeIds.map((id) => (sw ? causeById(id)?.sw : causeById(id)?.en)).filter(Boolean).join(sw ? ' au ' : ' or ');
    const days = followUp ?? 3;
    const text =
      kind === 'request_photos'
        ? sw
          ? 'Tafadhali piga picha nyingine mchana, karibu na jani moja lililoharibika, na uitume kupitia programu.'
          : 'Please take another photo in daylight, close to one damaged leaf, and send it from the app.'
        : kind === 'review_reject'
          ? sw
            ? 'Pendekezo la programu halikuwa sahihi kwa picha hii. '
            : 'The app’s suggestion was not right for this photo. '
          : sw
            ? `Hii inaonekana kuwa ${names || '…'}. Fuata hatua zilizo kwenye programu, na utume picha mpya baada ya siku ${days} ili tuone kama imepona.`
            : `This looks like ${names || '…'}. Follow the next steps in the app, and send a new photo in ${days} days so we can see if it is better.`;
    setBody(text);
  };

  const send = () => {
    if (!kind || !ready) return;
    review(issue.id, { kind, causeIds, body, followUpDays: followUp });
    setSent(
      mode === 'connected'
        ? `Sent. ${issue.farmer.name.split(' ')[0]} sees it in the app.`
        : `Saved to the case. Once the server is connected, ${issue.farmer.name.split(' ')[0]} gets an SMS and sees it in the app.`,
    );
    setKind(null);
    setBody('');
  };

  return (
    <section className="block review" aria-label="Review">
      <h3>Review</h3>
      <div className="actions" role="group" aria-label="Review action">
        {ACTIONS.map((a) => (
          <button
            key={a.kind}
            className={`seg ${kind === a.kind ? 'on' : ''}`}
            aria-pressed={kind === a.kind}
            disabled={a.kind === 'review_agree' && !canAgree}
            title={a.kind === 'review_agree' && !canAgree ? 'Nothing to agree with: the library gave no cause.' : undefined}
            onClick={() => choose(a.kind)}>
            {a.label}
          </button>
        ))}
      </div>
      {sent ? <p className="sent">{sent}</p> : null}

      {kind ? (
        <div className="composer">
          {needsCause ? (
            <fieldset>
              <legend>{kind === 'review_agree' ? 'Which suggested cause do you agree with?' : 'What is it? Pick up to 2.'}</legend>
              <div className="cause-grid">
                {options.map((id) => (
                  <label key={id} className={`cause-opt ${causeIds.includes(id) ? 'on' : ''}`}>
                    <input type="checkbox" checked={causeIds.includes(id)} onChange={() => toggle(id)} />
                    {causeById(id)?.en}
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}

          <label className="field">
            <span className="field-label">
              Message to {issue.farmer.name.split(' ')[0]} <span className="muted">· write in {sw ? 'Kiswahili' : 'English'}</span>
            </span>
            <textarea rows={4} value={body} onChange={(e) => setBody(e.target.value)} placeholder={sw ? 'Andika ujumbe kwa mkulima…' : 'Write to the farmer…'} />
          </label>
          <button className="link" onClick={template}>
            Start from a template
          </button>
          {flags.length ? (
            <p className="flag" role="status">
              Mentions {flags.join(', ')}. The reply will be flagged for a second look. Chemical advice to farmers is turned off.
            </p>
          ) : null}

          {kind !== 'request_photos' ? (
            <label className="field field-inline">
              <span className="field-label">Ask for a follow-up photo</span>
              <select value={followUp ?? ''} onChange={(e) => setFollowUp(e.target.value ? Number(e.target.value) : null)}>
                <option value="">No follow-up</option>
                <option value="3">In 3 days</option>
                <option value="7">In 7 days</option>
              </select>
            </label>
          ) : null}

          <div className="composer-foot">
            <span className="meta muted">Case moves to {kind === 'request_photos' ? STATUS_LABEL.waiting_farmer : STATUS_LABEL.action_given}.</span>
            <button className="btn btn-primary" disabled={!ready} onClick={send}>
              Send to farmer
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

/** First photo beside a follow-up (the latest unless another is picked), with the farmer's verdict. */
function FollowUpCompare({ issue }: { issue: Issue }) {
  const list = followUpsOf(issue);
  const [pick, setPick] = useState(list.length - 1);
  const f = list[Math.min(pick, list.length - 1)];
  return (
    <section className="block" aria-label="Follow-up photos">
      <h3>Before and after</h3>
      <div className="split">
        <figure>
          <figcaption>First photo · {dateLabel(issue.createdAt)}</figcaption>
          <div className="well">
            <CasePhoto issue={issue} label="First photo" />
          </div>
        </figure>
        <figure>
          <figcaption>
            Follow-up {list.length > 1 ? `${pick + 1} of ${list.length} ` : ''}· {dateLabel(f.at)}
          </figcaption>
          <div className="well">
            <FollowUpPhoto e={f} />
          </div>
        </figure>
      </div>
      <div className="facts">
        {f.outcome ? <OutcomeTag outcome={f.outcome} prefix="Farmer says" /> : <span className="meta muted">The farmer did not say how it looks.</span>}
      </div>
      {list.length > 1 ? (
        <div className="gallery" role="group" aria-label="Follow-up photos">
          {list.map((e, n) => (
            <button key={e.id} className={`gal ${n === pick ? 'on' : ''}`} onClick={() => setPick(n)} aria-label={`Follow-up ${n + 1}`} aria-pressed={n === pick}>
              <FollowUpPhoto e={e} />
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function FollowUpPhoto({ e }: { e: IssueEvent }) {
  if (e.photoUrl)
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={e.photoUrl} alt="Follow-up photo" style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' }} />;
  if (e.photo) return <Leaf photo={e.photo} label="Follow-up photo (sample drawing)" />;
  return <div className="well-empty" style={{ height: '100%' }}>Photo still uploading</div>;
}

const EVENT_LABEL: Record<IssueEvent['kind'], string> = {
  created: 'Case opened',
  ai_suggestion: 'AI suggestion',
  review_agree: 'Agreed',
  review_adjust: 'Adjusted',
  review_reject: 'Rejected the suggestion',
  request_photos: 'Asked for more photos',
  comment: 'Comment',
  status_change: 'Status',
  follow_up_result: 'Follow-up photo',
};

function EventLine({ e, issue }: { e: IssueEvent; issue: Issue }) {
  const causes = e.causeIds?.map((id) => causeById(id)?.en).filter(Boolean).join(', ');
  return (
    <li className={`ev ev-${e.actorKind}`}>
      <div className="ev-head">
        <strong>{EVENT_LABEL[e.kind]}</strong>
        {e.kind === 'status_change' && e.status ? <span> → {STATUS_LABEL[e.status]}</span> : null}
        {causes ? <span> · {causes}</span> : null}
      </div>
      <div className="meta muted">
        {e.actor} · {timeLabel(e.at)}
      </div>
      {e.kind === 'ai_suggestion' && issue.ai ? (
        <p className="ev-body">
          <AiState state={issue.ai.state} />
          {issue.ai.causes.length ? ` ${issue.ai.causes.map((c) => `${causeById(c.id)?.en} (${LIKELIHOOD[c.likelihood].toLowerCase()})`).join(', ')}` : ''}
        </p>
      ) : e.kind === 'follow_up_result' ? (
        e.outcome ? (
          <p className="ev-body">
            <OutcomeTag outcome={e.outcome} prefix="Farmer says" />
          </p>
        ) : null
      ) : e.body ? (
        <p className="ev-body">{e.body}</p>
      ) : null}
      {e.photo || e.photoUrl ? (
        <span className="thumb ev-photo">
          <FollowUpPhoto e={e} />
        </span>
      ) : null}
      {e.flagged ? <p className="flag">Flagged for a second look: mentions a product or dose.</p> : null}
    </li>
  );
}
