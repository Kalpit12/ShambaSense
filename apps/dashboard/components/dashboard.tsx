'use client';

import { useCallback, useEffect, useState } from 'react';

import { StoreProvider, useStore } from '@/lib/store';
import { FarmersView } from './farmers-view';
import { IssuesView } from './issues-view';
import { NoOrg } from './no-org';
import { Overview } from './overview';
import { Shell, type View } from './shell';
import { SignIn } from './sign-in';
import { TeamView } from './team-view';

const HASH_VIEWS: View[] = ['overview', 'farmers', 'team'];

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
  const { mode, session, org, checking, error } = useStore();
  const [view, setView] = useState<View>('issues');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    const read = () => {
      const hash = window.location.hash.slice(1);
      setView((HASH_VIEWS as string[]).includes(hash) ? (hash as View) : 'issues');
    };
    read();
    window.addEventListener('hashchange', read);
    return () => window.removeEventListener('hashchange', read);
  }, []);

  const go = useCallback((v: View) => {
    setView(v);
    try {
      history.replaceState(null, '', v === 'issues' ? '#' : `#${v}`);
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
  if (mode === 'connected' && !org) return <NoOrg />;

  return (
      <Shell
        view={view}
        onView={go}
        search={search}
        onSearch={(s) => {
          setSearch(s);
          if (s && view !== 'farmers') go('issues');
        }}>
        {error ? <p className="flag load-error">{error}</p> : null}
        {view === 'overview' ? (
          <Overview onOpen={open} />
        ) : view === 'farmers' ? (
          <FarmersView search={search} onOpenCase={open} />
        ) : view === 'team' ? (
          <TeamView />
        ) : (
          <IssuesView search={search} selectedId={selected} onSelect={setSelected} />
        )}
      </Shell>
  );
}
