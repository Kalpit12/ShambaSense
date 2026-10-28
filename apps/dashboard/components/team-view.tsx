'use client';

import { useCallback, useEffect, useState } from 'react';

import { coopError, isAdmin, loadTeam, ROLE_HINT, ROLE_LABEL, ROLES, sampleTeam, type Invite, type Member, type Role } from '@/lib/coop';
import { ago, dateLabel } from '@/lib/format';
import { DEMO_AUTH, supabase } from '@/lib/remote';
import { useStore } from '@/lib/store';

const TONE: Record<Role, string> = { owner: 'tone-forest', admin: 'tone-forest', agronomist: 'tone-sky', field_officer: 'tone-sky', viewer: 'tone-quiet' };

/** Team (design.md §10): the join code, who is on the team, invites, and what each role can do. */
export function TeamView() {
  const { org, mode, reloadOrg } = useStore();
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [code, setCode] = useState(org?.joinCode ?? '');
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const admin = isAdmin(org?.role);
  const owner = org?.role === 'owner';

  const load = useCallback(async () => {
    if (!org) return;
    if (!supabase) {
      const t = sampleTeam();
      setMembers(t.members);
      setInvites(t.invites);
      return;
    }
    try {
      const t = await loadTeam(supabase, org);
      setMembers(t.members);
      setInvites(t.invites);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the team');
    }
  }, [org]);

  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => setCode(org?.joinCode ?? ''), [org]);

  // Runs an admin function, then reloads. Sample mode changes the list in place instead.
  const run = async (fn: string, args: Record<string, unknown>, sample: () => void, done?: string) => {
    setError(null);
    setNote(null);
    if (!supabase) {
      sample();
      if (done) setNote(done.replace('was added', 'was invited'));
      return true;
    }
    const { data, error: e } = await supabase.rpc(fn, args);
    if (e) {
      setError(coopError(e.message));
      return false;
    }
    if (done) setNote(typeof data === 'string' && data === 'invited' ? done.replace('was added', 'was invited') : done);
    await load();
    return true;
  };

  if (!org) return null;
  const canEdit = (m: Member) => admin && m.userId !== org.myId && (owner || (m.role !== 'owner' && m.role !== 'admin'));
  const roleChoices = ROLES.filter((r) => owner || (r !== 'owner' && r !== 'admin'));

  return (
    <div className="page">
      <div className="page-head">
        <h1>Team</h1>
        <p className="muted">Who works on {org.name}&apos;s dashboard, and how farmers join the co-op.</p>
      </div>
      {error ? <p className="flag">{error}</p> : null}
      {note ? <p className="sent">{note}</p> : null}

      <section className="panel join">
        <div>
          <span className="w-label">Join code for farmers</span>
          <p className="code mono">{code}</p>
          <p className="muted">
            Farmers open ShambaSense, go to Profile, tap <strong>Join a co-op</strong> and type this code. They agree to share their farm and crop checks
            with {org.name}, and can leave at any time.
          </p>
        </div>
        <div className="join-actions">
          <button
            className="btn btn-secondary"
            onClick={() => {
              navigator.clipboard?.writeText(code).then(() => setNote('Join code copied.'), () => setNote(`The code is ${code}.`));
            }}>
            Copy code
          </button>
          {admin ? (
            <button
              className="btn btn-secondary"
              onClick={async () => {
                if (!confirm(`Make a new join code? ${code} will stop working. Farmers already in the co-op stay in.`)) return;
                if (!supabase) {
                  const next = `${code.slice(0, 3)}-${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`;
                  setCode(next);
                  setNote(`New join code: ${next}. The old one no longer works.`);
                  return;
                }
                const { data, error: e } = await supabase.rpc('regenerate_join_code', { p_org: org.id });
                if (e) return setError(coopError(e.message));
                setCode(data as string);
                setNote(`New join code: ${data}. The old one no longer works.`);
                reloadOrg();
              }}>
              New code
            </button>
          ) : null}
        </div>
      </section>

      <section className="panel">
        <h2>
          Team <span className="tab-count num">{members.length}</span>
        </h2>
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Role</th>
                <th className="c-seen">Last signed in</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.userId} className="static">
                  <td>
                    <div className="row-title">
                      {m.name}
                      {m.userId === org.myId ? <span className="muted"> (you)</span> : null}
                    </div>
                    <div className="row-sub">{m.email}</div>
                  </td>
                  <td>
                    {canEdit(m) ? (
                      <label className="select">
                        <span className="sr-only">Role for {m.name}</span>
                        <select
                          value={m.role}
                          onChange={(e) => {
                            const role = e.target.value as Role;
                            run('set_member_role', { p_org: org.id, p_user: m.userId, p_role: role }, () =>
                              setMembers((all) => all.map((x) => (x.userId === m.userId ? { ...x, role } : x))),
                              `${m.name} is now ${ROLE_LABEL[role].toLowerCase()}.`,
                            );
                          }}>
                          {roleChoices.map((r) => (
                            <option key={r} value={r}>
                              {ROLE_LABEL[r]}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : (
                      <span className={`tag ${TONE[m.role]}`}>{ROLE_LABEL[m.role]}</span>
                    )}
                  </td>
                  <td className="c-seen meta num">{m.lastSignInAt ? ago(m.lastSignInAt) : 'Not yet'}</td>
                  <td className="r">
                    {canEdit(m) ? (
                      <button
                        className="btn btn-small"
                        onClick={() => {
                          if (!confirm(`Remove ${m.name} from the team? Cases assigned to them go back to the queue.`)) return;
                          run('remove_member', { p_org: org.id, p_user: m.userId }, () => setMembers((all) => all.filter((x) => x.userId !== m.userId)), `${m.name} was removed.`);
                        }}>
                        Remove
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {admin ? (
        <div className="two">
          <InviteForm
            roles={roleChoices.filter((r) => r !== 'owner')}
            onInvite={(name, email, role) =>
              run(
                'invite_member',
                { p_org: org.id, p_email: email, p_name: name, p_role: role },
                () => setInvites((all) => [...all, { id: `inv-${Date.now()}`, email: email.trim().toLowerCase(), role, name, createdAt: new Date().toISOString() }]),
                mode === 'connected' && DEMO_AUTH
                  ? `${name} was added. They sign in at this dashboard with ${email.trim().toLowerCase()} and the demo code 123456.`
                  : `${name} was added. They sign in with ${email.trim().toLowerCase()} and a code sent to that email.`,
              )
            }
          />
          <section className="panel">
            <h2>Waiting to sign in</h2>
            {invites.length ? (
              <table className="table">
                <tbody>
                  {invites.map((v) => (
                    <tr key={v.id} className="static">
                      <td>
                        <div className="row-title">{v.name}</div>
                        <div className="row-sub">
                          {v.email} · {ROLE_LABEL[v.role]} · invited {dateLabel(v.createdAt)}
                        </div>
                      </td>
                      <td className="r">
                        <button className="btn btn-small" onClick={() => run('cancel_invite', { p_invite: v.id }, () => setInvites((all) => all.filter((x) => x.id !== v.id)), `Invite for ${v.email} cancelled.`)}>
                          Cancel
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="empty">No one is waiting. People you invite show here until they first sign in.</p>
            )}
          </section>
        </div>
      ) : (
        <p className="muted">Only an admin can add or remove team members. Ask an owner or admin on this list.</p>
      )}

      <section className="panel">
        <h2>What each role can do</h2>
        <dl className="roles">
          {ROLES.map((r) => (
            <div key={r}>
              <dt>{ROLE_LABEL[r]}</dt>
              <dd className="muted">{ROLE_HINT[r]}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}

function InviteForm({ roles, onInvite }: { roles: Role[]; onInvite: (name: string, email: string, role: Role) => Promise<boolean> }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('agronomist');
  const [busy, setBusy] = useState(false);

  return (
    <section className="panel">
      <h2>Add someone</h2>
      <form
        className="invite"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const ok = await onInvite(name.trim(), email.trim(), role);
          setBusy(false);
          if (ok) {
            setName('');
            setEmail('');
          }
        }}>
        <label className="field">
          <span className="field-label">Name</span>
          <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="As farmers will see it, e.g. Otieno M." maxLength={80} />
        </label>
        <label className="field">
          <span className="field-label">Work email</span>
          <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
        </label>
        <label className="field">
          <span className="field-label">Role</span>
          <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {roles.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
        </label>
        <button className="btn btn-primary" disabled={busy || !name.trim() || !email.trim()}>
          Add to team
        </button>
      </form>
    </section>
  );
}
