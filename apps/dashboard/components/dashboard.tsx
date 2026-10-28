'use client';

import { useCallback, useEffect, useState } from 'react';

import { StoreProvider, useStore } from '@/lib/store';
import { IssuesView } from './issues-view';
import { Overview } from './overview';
import { Shell, type View } from './shell';
import { SignIn } from './sign-in';

// Views switch on the client while the dashboard runs on sample data, so the export is one page.
// With Supabase they become App Router routes (/overview, /issues/[code]) read on the server.
export function Dashboard() {
  return (
    <StoreProvider>
      <Gate />
    </StoreProvider>
  );
}

/** Connected mode asks an org member to sign in first; sample mode opens straight away. */
function Gate() {
  const { mode, session, checking, error } = useStore();
  const [view, setView] = useState<View>('issues');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (hash === 'overview') setView('overview');
  }, []);

  const go = useCallback((v: View) => {
    setView(v);
    try {
      history.replaceState(null, '', v === 'overview' ? '#overview' : '#');
    } catch {
      // Sandboxed frames may refuse; the view still changes.
    }
  }, []);

  const open = useCallback(
    (id: string) => {
      setSelected(id);
      go('issues');
    },
    [go],
  );

  if (mode === 'connected' && checking) return null;
  if (mode === 'connected' && !session) return <SignIn />;

  return (
      <Shell
        view={view}
        onView={go}
        search={search}
        onSearch={(s) => {
          setSearch(s);
          if (s) go('issues');
        }}>
        {error ? <p className="flag load-error">{error}</p> : null}
        {view === 'overview' ? <Overview onOpen={open} /> : <IssuesView search={search} selectedId={selected} onSelect={setSelected} />}
      </Shell>
  );
}
