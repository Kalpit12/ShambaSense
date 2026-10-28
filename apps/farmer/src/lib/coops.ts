import { useCallback, useEffect, useState } from 'react';

import { supabase } from './auth';

// Co-ops the farmer has joined (architecture.md §5.1). Joining takes the co-op's join code and the
// farmer's agreement to share their farm and crop checks; leaving ends the co-op's access at once.
// Both need a connection, since the co-op's access changes on the server.

/** contactPhone is the number the co-op set in the dashboard's Settings, if any (+2547...). */
export type Coop = { id: string; name: string; joinedAt: string; contactPhone?: string | null };
export type CoopError = 'not_found' | 'too_many' | 'staff' | 'offline' | 'unknown';

// Preview mode: two made-up co-ops and their codes, kept for the session only.
const PREVIEW_CODES: Record<string, Coop> = {
  NJR4821: { id: 'coop-njoro', name: 'Njoro Growers Co-op', joinedAt: '', contactPhone: '+254712000111' },
  DEMO2026: { id: 'coop-demo', name: 'ShambaSense demo co-op', joinedAt: '' },
};
let previewJoined: Coop[] = [{ ...PREVIEW_CODES.NJR4821, joinedAt: new Date(Date.now() - 150 * 86400_000).toISOString() }];

const norm = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, '');

function errorOf(message: string): CoopError {
  if (/too_many_tries/.test(message)) return 'too_many';
  if (/staff_account/.test(message)) return 'staff';
  if (/fetch|network|timed? ?out/i.test(message)) return 'offline';
  return 'unknown';
}

export function useCoops(signedIn: boolean) {
  const [coops, setCoops] = useState<Coop[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!supabase) {
      setCoops(previewJoined);
      setLoading(false);
      return;
    }
    if (!signedIn) return;
    const { data, error } = await supabase.rpc('my_coops');
    if (!error)
      setCoops(
        (data ?? []).map((c: { id: string; name: string; joined_at: string; contact_phone?: string | null }) => ({
          id: c.id,
          name: c.name,
          joinedAt: c.joined_at,
          contactPhone: c.contact_phone ?? null,
        })),
      );
    setLoading(false);
  }, [signedIn]);

  useEffect(() => {
    reload();
  }, [reload]);

  /** Looks the code up without joining, so the farmer sees the co-op's name before agreeing. */
  const find = useCallback(async (code: string): Promise<{ coop: Coop } | { error: CoopError }> => {
    if (!supabase) {
      const c = PREVIEW_CODES[norm(code)];
      return c ? { coop: c } : { error: 'not_found' };
    }
    const { data, error } = await supabase.rpc('find_org_by_code', { p_code: code });
    if (error) return { error: errorOf(error.message) };
    const row = (data ?? [])[0] as { id: string; name: string } | undefined;
    return row ? { coop: { id: row.id, name: row.name, joinedAt: '' } } : { error: 'not_found' };
  }, []);

  const join = useCallback(
    async (code: string): Promise<CoopError | null> => {
      if (!supabase) {
        const c = PREVIEW_CODES[norm(code)];
        if (!c) return 'not_found';
        previewJoined = [...previewJoined.filter((x) => x.id !== c.id), { ...c, joinedAt: new Date().toISOString() }];
        await reload();
        return null;
      }
      const { data, error } = await supabase.rpc('join_org', { p_code: code });
      if (error) return errorOf(error.message);
      if (!(data ?? []).length) return 'not_found';
      await reload();
      return null;
    },
    [reload],
  );

  const leave = useCallback(
    async (id: string): Promise<CoopError | null> => {
      if (!supabase) {
        previewJoined = previewJoined.filter((x) => x.id !== id);
        await reload();
        return null;
      }
      const { error } = await supabase.rpc('leave_org', { p_org: id });
      if (error) return errorOf(error.message);
      await reload();
      return null;
    },
    [reload],
  );

  return { coops, loading, find, join, leave, reload };
}
