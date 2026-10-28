'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import type { Session } from '@supabase/supabase-js';

import { loadOrg, SAMPLE_ORG, type Org } from './coop';
import { loadIssues, supabase } from './remote';
import { ME, sampleIssues } from './sample';
import { safetyFlags } from './safety';
import type { Issue, IssueEvent, IssueStatus } from './types';

// Sample-data store for the dashboard. Review actions append to the issue's history, the same way
// they will append `issue_events` rows through an RPC once Supabase is connected.

export type ReviewKind = 'review_agree' | 'review_adjust' | 'review_reject' | 'request_photos';
export type Review = { kind: ReviewKind; causeIds: string[]; body: string; followUpDays: number | null };

const NEXT_STATUS: Record<ReviewKind, IssueStatus> = {
  review_agree: 'action_given',
  review_adjust: 'action_given',
  review_reject: 'action_given',
  request_photos: 'waiting_farmer',
};

type Store = {
  issues: Issue[];
  /** 'sample' runs on sample data; 'connected' reads Supabase as the signed-in org member. */
  mode: 'sample' | 'connected';
  session: Session | null;
  /** The signed-in member's co-op and role. Null when they are on no team yet. */
  org: Org | null;
  /** Connected mode only: still finding out whether someone is signed in, and to which org. */
  checking: boolean;
  error: string | null;
  review: (id: string, r: Review) => void;
  assignToMe: (id: string) => void;
  setStatus: (id: string, status: IssueStatus) => void;
  reset: () => void;
  /** Reads the org again, after a rename, a new join code or setting one up. */
  reloadOrg: () => Promise<void>;
};

const KEY = 'shambasense.dashboard.v1';
const Ctx = createContext<Store | null>(null);

function load(): Issue[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as Issue[];
  } catch {
    // Storage blocked: start from the sample.
  }
  return sampleIssues();
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [session, setSession] = useState<Session | null>(null);
  const [org, setOrg] = useState<Org | null>(null);
  const [orgFor, setOrgFor] = useState<string | null>(null);
  const [checking, setChecking] = useState(!!supabase);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!supabase) return;
    try {
      setIssues(await loadIssues(supabase));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load cases');
    }
  }, []);

  useEffect(() => {
    if (!supabase) {
      setIssues(load());
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setChecking(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const reloadOrg = useCallback(async () => {
    if (!supabase || !session) return;
    try {
      setOrg(await loadOrg(supabase, session.user.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your co-op');
    }
    setOrgFor(session.user.id);
  }, [session]);

  useEffect(() => {
    if (session) reloadOrg();
    else {
      setOrg(null);
      setOrgFor(null);
    }
  }, [session, reloadOrg]);

  // Signed in: load, then look for new cases every 20 s. Rows never animate in (design.md §5.6).
  useEffect(() => {
    if (!session) return;
    refresh();
    const id = setInterval(refresh, 20000);
    return () => clearInterval(id);
  }, [session, refresh]);

  // Runs a database function, then reloads. Errors show in the page instead of failing silently.
  const call = useCallback(
    async (fn: string, args: Record<string, unknown>) => {
      if (!supabase) return;
      const { error: e } = await supabase.rpc(fn, args);
      if (e) setError(e.message);
      await refresh();
    },
    [refresh],
  );

  const change = useCallback((id: string, fn: (i: Issue) => Issue) => {
    setIssues((all) => {
      const next = all.map((i) => (i.id === id ? fn(i) : i));
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        // Not saved; the change still shows until reload.
      }
      return next;
    });
  }, []);

  const value = useMemo<Store>(() => {
    const event = (e: Omit<IssueEvent, 'id' | 'at' | 'actor' | 'actorKind'>): IssueEvent => ({
      id: `ev-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
      at: new Date().toISOString(),
      actor: ME,
      actorKind: 'agronomist',
      ...e,
    });
    if (supabase)
      return {
        issues,
        mode: 'connected',
        session,
        org,
        checking: checking || (!!session && orgFor !== session.user.id),
        error,
        reloadOrg,
        review: (id, r) => call('review_issue', { p_issue: id, p_kind: r.kind, p_cause_ids: r.causeIds, p_body: r.body, p_follow_up_days: r.followUpDays }),
        assignToMe: (id) => call('assign_issue_to_me', { p_issue: id }),
        setStatus: (id, status) => call('set_issue_status', { p_issue: id, p_status: status }),
        reset: () => refresh(),
      };
    return {
      issues,
      mode: 'sample',
      session: null,
      org: SAMPLE_ORG,
      checking: false,
      error: null,
      reloadOrg: async () => {},
      review: (id, r) =>
        change(id, (i) => {
          const at = new Date();
          const followUpDue =
            r.followUpDays != null ? new Date(at.getTime() + r.followUpDays * 86400_000).toISOString().slice(0, 10) : i.followUpDue;
          return {
            ...i,
            status: NEXT_STATUS[r.kind],
            assignee: i.assignee ?? ME,
            updatedAt: at.toISOString(),
            followUpDue,
            events: [...i.events, event({ kind: r.kind, body: r.body.trim(), causeIds: r.causeIds, flagged: safetyFlags(r.body).length > 0 })],
          };
        }),
      assignToMe: (id) =>
        change(id, (i) => ({
          ...i,
          assignee: ME,
          status: i.status === 'open' ? 'in_review' : i.status,
          updatedAt: new Date().toISOString(),
          events: i.status === 'open' ? [...i.events, event({ kind: 'status_change', status: 'in_review' })] : i.events,
        })),
      setStatus: (id, status) =>
        change(id, (i) => ({ ...i, status, updatedAt: new Date().toISOString(), events: [...i.events, event({ kind: 'status_change', status })] })),
      reset: () => {
        try {
          localStorage.removeItem(KEY);
        } catch {
          // Nothing stored.
        }
        setIssues(sampleIssues());
      },
    };
  }, [issues, change, session, org, orgFor, checking, error, call, refresh, reloadOrg]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useStore must be used inside StoreProvider');
  return ctx;
}
