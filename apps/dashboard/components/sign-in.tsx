'use client';

import { useState } from 'react';

import { DEMO_ADMIN_EMAIL, DEMO_AUTH, DEMO_CODE, DEMO_EMAIL, DEMO_PASSWORD, supabase } from '@/lib/remote';
import { Lockup } from './brand';

// Org members sign in with an email code (architecture.md §3.3). A first sign-in makes the account;
// an invite from an admin then puts it on the team, or the person sets up a new co-op.
export function SignIn() {
  const [email, setEmail] = useState(DEMO_AUTH ? DEMO_EMAIL : '');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    if (!supabase) return;
    if (DEMO_AUTH) return setSent(true);
    setBusy(true);
    setError(null);
    const { error: e } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: true } });
    setBusy(false);
    if (e) setError(e.message);
    else setSent(true);
  };

  const verify = async () => {
    if (!supabase) return;
    setBusy(true);
    setError(null);
    if (DEMO_AUTH) {
      if (code.trim() !== DEMO_CODE) {
        setBusy(false);
        return setError('That code did not work. Demo accounts use 123456.');
      }
      const { error: e } = await supabase.auth.signInWithPassword({ email: email.trim(), password: DEMO_PASSWORD });
      setBusy(false);
      if (e) setError('No demo account uses this email. Ask an admin to add you on the Team page.');
      return;
    }
    const { error: e } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' });
    setBusy(false);
    if (e) setError('That code did not work. Check it, or send a new one.');
  };

  return (
    <main className="signin">
      <div className="signin-card">
        <Lockup height={30} />
        <h1>Sign in to the dashboard</h1>
        {!sent ? (
          <form onSubmit={(e) => (e.preventDefault(), send())}>
            <label className="field">
              <span className="field-label">Work email</span>
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
            </label>
            <button className="btn btn-primary" disabled={busy || !email}>
              Send code
            </button>
            {DEMO_AUTH ? (
              <p className="muted meta">
                Demo accounts: {DEMO_EMAIL} (agronomist) or {DEMO_ADMIN_EMAIL} (co-op owner, can add people). People an admin adds sign in with their own email.
              </p>
            ) : null}
          </form>
        ) : (
          <form onSubmit={(e) => (e.preventDefault(), verify())}>
            <p className="muted">{DEMO_AUTH ? 'Demo sign-in: no email is sent. The code is 123456.' : `We sent a code to ${email}.`}</p>
            <label className="field">
              <span className="field-label">Code</span>
              <input inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} />
            </label>
            <button className="btn btn-primary" disabled={busy || code.length < 6}>
              Sign in
            </button>
            <button type="button" className="link" onClick={() => setSent(false)}>
              Use a different email
            </button>
          </form>
        )}
        {error ? <p className="flag">{error}</p> : null}
      </div>
    </main>
  );
}
