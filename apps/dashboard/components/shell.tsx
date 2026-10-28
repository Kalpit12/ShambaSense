'use client';

import { useState, type ReactNode } from 'react';

import { ROLE_LABEL } from '@/lib/coop';
import { supabase } from '@/lib/remote';
import { useStore } from '@/lib/store';
import { Lockup } from './brand';

export type View = 'overview' | 'issues' | 'farmers' | 'team' | 'reports';

const NAV: { key: string; label: string; view?: View }[] = [
  { key: 'overview', label: 'Overview', view: 'overview' },
  { key: 'farmers', label: 'Farmers', view: 'farmers' },
  { key: 'scouting', label: 'Scouting' },
  { key: 'issues', label: 'Crop issues', view: 'issues' },
  { key: 'tasks', label: 'Tasks' },
  { key: 'reports', label: 'Reports', view: 'reports' },
  { key: 'team', label: 'Team', view: 'team' },
  { key: 'knowledge', label: 'Knowledge base' },
  { key: 'settings', label: 'Settings' },
];

/** Left nav 240 px and top bar (design.md §8.2). Pages not built yet stay visible but marked "Later". */
export function Shell({ view, onView, search, onSearch, children }: { view: View; onView: (v: View) => void; search: string; onSearch: (s: string) => void; children: ReactNode }) {
  const { issues, reset, mode, session, org } = useStore();
  const me = org?.myName ?? session?.user.email ?? '';
  const [drawer, setDrawer] = useState(false);
  const open = issues.filter((i) => i.status === 'open').length;

  return (
    <div className="shell">
      <nav className={`nav ${drawer ? 'nav-open' : ''}`} aria-label="Main">
        <div className="nav-brand">
          <Lockup height={26} />
        </div>
        <ul>
          {NAV.map((n) => (
            <li key={n.key}>
              {n.view ? (
                <button
                  className={`nav-item ${view === n.view ? 'active' : ''}`}
                  aria-current={view === n.view ? 'page' : undefined}
                  onClick={() => {
                    onView(n.view!);
                    setDrawer(false);
                  }}>
                  {n.label}
                  {n.view === 'issues' && open > 0 ? <span className="count num">{open}</span> : null}
                </button>
              ) : (
                <span className="nav-item disabled" aria-disabled>
                  {n.label}
                  <span className="later">Later</span>
                </span>
              )}
            </li>
          ))}
        </ul>
        <div className="nav-foot">
          {mode === 'sample' ? (
            <>
              <p>Sample data. Reviews are saved in this browser only.</p>
              <button className="link" onClick={reset}>
                Reset sample
              </button>
            </>
          ) : (
            <>
              <p>{session?.user.email}</p>
              <button className="link" onClick={() => supabase?.auth.signOut()}>
                Sign out
              </button>
            </>
          )}
        </div>
      </nav>
      {drawer ? <div className="scrim" onClick={() => setDrawer(false)} /> : null}

      <div className="main">
        <header className="topbar">
          <button className="icon-btn menu-btn" aria-label="Open menu" onClick={() => setDrawer(true)}>
            <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden>
              <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
          <div className="org">
            <span className="org-name">{org?.name ?? 'ShambaSense'}</span>
            <span className="org-sub">All farms</span>
          </div>
          <label className="search">
            <span className="sr-only">Search cases</span>
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
              <circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
              <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <input value={search} onChange={(e) => onSearch(e.target.value)} placeholder={view === 'farmers' ? 'Search farmer, phone or ward' : 'Search farmer, plot or ISS-0148'} />
          </label>
          <span className="health">
            <span className="health-dot" aria-hidden />
            {mode === 'sample' ? 'Sample data' : 'Live'}
          </span>
          <span className="avatar" title={org ? `${me} · ${ROLE_LABEL[org.role]}` : me}>
            {me.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()}
          </span>
        </header>
        {children}
      </div>
    </div>
  );
}
