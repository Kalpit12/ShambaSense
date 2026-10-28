'use client';

import { useState } from 'react';

import { supabase } from '@/lib/remote';
import { useStore } from '@/lib/store';
import { Lockup } from './brand';

/** Signed in but on no team: ask an admin for an invite, or set up a new co-op as its owner. */
export function NoOrg() {
  const { session, reloadOrg } = useStore();
  const [setup, setSetup] = useState(false);
  const [name, setName] = useState('');
  const [kind, setKind] = useState('coop');
  const [myName, setMyName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <main className="signin">
      <div className="signin-card">
        <Lockup height={30} />
        <h1>{setup ? 'Set up your co-op' : 'You are not on a team yet'}</h1>
        {!setup ? (
          <>
            <p className="muted">
              Ask your co-op&apos;s admin to add <strong>{session?.user.email}</strong> on their Team page, then sign in again.
            </p>
            <button className="btn btn-secondary" onClick={() => reloadOrg()}>
              I was added, check again
            </button>
            <button className="btn btn-primary" onClick={() => setSetup(true)}>
              Set up a new co-op
            </button>
          </>
        ) : (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!supabase) return;
              setBusy(true);
              setError(null);
              const { error: err } = await supabase.rpc('create_org', { p_name: name, p_kind: kind, p_my_name: myName });
              setBusy(false);
              if (err) return setError(err.message);
              await reloadOrg();
            }}>
            <p className="muted">You become its owner. You can add agronomists next, and farmers join with the co-op&apos;s code.</p>
            <label className="field">
              <span className="field-label">Name of the co-op or organisation</span>
              <input required value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="e.g. Njoro Growers Co-op" />
            </label>
            <label className="field">
              <span className="field-label">Kind</span>
              <select value={kind} onChange={(e) => setKind(e.target.value)}>
                <option value="coop">Farmer co-op</option>
                <option value="ngo">NGO or programme</option>
                <option value="agribusiness">Agribusiness</option>
              </select>
            </label>
            <label className="field">
              <span className="field-label">Your name, as farmers will see it</span>
              <input required value={myName} onChange={(e) => setMyName(e.target.value)} maxLength={80} />
            </label>
            <button className="btn btn-primary" disabled={busy || !name.trim() || !myName.trim()}>
              Create co-op
            </button>
            <button type="button" className="link" onClick={() => setSetup(false)}>
              Back
            </button>
          </form>
        )}
        {error ? <p className="flag">{error}</p> : null}
        <button className="link" onClick={() => supabase?.auth.signOut()}>
          Sign out
        </button>
      </div>
    </main>
  );
}
