import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type { CheckState, Crop, Issue, IssueEvent, Likelihood, Outcome } from './types';

const OUTCOMES: (string | null)[] = ['better', 'same', 'worse'];

// Connected mode. With NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY set, the dashboard
// signs in an org member by email code and reads through row-level security, so it only ever sees
// farmers linked to that member's org (architecture.md §5.6). Review actions call the database
// functions, which check the role and write the audit line.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
export const supabase: SupabaseClient | null = url && key ? createClient(url, key) : null;

// Demo sign-in (dev only): every demo account takes the code 123456 and no email is sent. The
// database side lives in the demo_sign_in migration; switch both off before real users arrive.
export const DEMO_AUTH = process.env.NEXT_PUBLIC_DEMO_AUTH === '1';
export const DEMO_CODE = '123456';
export const DEMO_PASSWORD = 'shamba-demo-123456';
export const DEMO_EMAIL = 'agronomist.demo@example.com';
export const DEMO_ADMIN_EMAIL = 'admin.demo@example.com';

const PHOTO_URL_SECONDS = 600;

export async function loadIssues(client: SupabaseClient): Promise<Issue[]> {
  const { data: rows, error } = await client
    .from('issues')
    .select('id, code, title, severity, status, assignee_id, follow_up_due_on, created_at, updated_at, farm_id, origin_check_id, farms(name, owner_id, county, ward), plots(name)')
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  const issues = rows ?? [];
  const checkIds = issues.map((i) => i.origin_check_id).filter(Boolean) as string[];
  const ownerIds = Array.from(new Set(issues.map((i) => one(i.farms)?.owner_id).filter(Boolean))) as string[];
  const assigneeIds = Array.from(new Set(issues.map((i) => i.assignee_id).filter(Boolean))) as string[];

  const [checks, results, media, events, profiles, team] = await Promise.all([
    client.from('crop_checks').select('id, crop_claimed, symptoms').in('id', checkIds),
    client.from('check_results').select('check_id, model_version, state, causes, observed').in('check_id', checkIds),
    client.from('media').select('check_id, storage_path').in('check_id', checkIds),
    client.from('issue_events').select('id, issue_id, kind, actor_kind, actor_name, body, cause_ids, status, flagged, check_id, created_at').in('issue_id', issues.map((i) => i.id)).order('created_at'),
    client.from('profiles').select('user_id, display_name, language, county, ward').in('user_id', ownerIds),
    client.from('org_members').select('user_id, display_name').in('user_id', assigneeIds),
  ]);

  // Follow-up photos hang off their own crop_checks rows, named by the follow_up_result events.
  const followIds = (events.data ?? []).map((e) => e.check_id).filter(Boolean) as string[];
  const followMedia = followIds.length ? await client.from('media').select('check_id, storage_path').in('check_id', followIds) : { data: [] };
  const allMedia = [...(media.data ?? []), ...(followMedia.data ?? [])];
  const paths = allMedia.map((m) => m.storage_path);
  const signed = paths.length ? await client.storage.from('check-photos').createSignedUrls(paths, PHOTO_URL_SECONDS) : { data: [] };
  const urlFor = new Map((signed.data ?? []).map((s) => [s.path, s.signedUrl]));

  return issues.map((i): Issue => {
    const farm = one(i.farms);
    const check = (checks.data ?? []).find((c) => c.id === i.origin_check_id);
    const result = (results.data ?? []).find((r) => r.check_id === i.origin_check_id);
    const profile = (profiles.data ?? []).find((p) => p.user_id === farm?.owner_id);
    const photos = (media.data ?? []).filter((m) => m.check_id === i.origin_check_id).map((m) => urlFor.get(m.storage_path)).filter(Boolean) as string[];
    const history: IssueEvent[] = (events.data ?? [])
      .filter((e) => e.issue_id === i.id)
      .map((e) => ({
        id: e.id,
        kind: e.kind,
        actorKind: e.actor_kind,
        actor: e.actor_name ?? (e.actor_kind === 'farmer' ? (profile?.display_name ?? 'Farmer') : 'ShambaSense'),
        at: e.created_at,
        body: e.body ?? undefined,
        causeIds: e.cause_ids?.length ? e.cause_ids : undefined,
        status: e.status ?? undefined,
        flagged: e.flagged,
        ...(e.kind === 'follow_up_result'
          ? {
              body: undefined,
              outcome: OUTCOMES.includes(e.body) ? (e.body as Outcome) : undefined,
              photoUrl: urlFor.get(allMedia.find((m) => m.check_id === e.check_id)?.storage_path ?? '') ?? undefined,
            }
          : null),
      }));
    return {
      id: i.id,
      farmerId: farm?.owner_id ?? undefined,
      code: i.code,
      title: i.title,
      farmer: { name: profile?.display_name ?? 'Farmer', phone: '', language: profile?.language === 'en' ? 'en' : 'sw', county: profile?.county ?? farm?.county ?? '', ward: profile?.ward ?? farm?.ward ?? '' },
      farm: farm?.name ?? '',
      plot: one(i.plots)?.name ?? '',
      crop: (check?.crop_claimed ?? 'tomatoes') as Crop,
      symptoms: check?.symptoms ?? [],
      photos: ['healthy'],
      photoUrls: photos,
      severity: i.severity,
      status: i.status,
      assignee: (team.data ?? []).find((m) => m.user_id === i.assignee_id)?.display_name ?? null,
      createdAt: i.created_at,
      updatedAt: i.updated_at,
      followUpDue: i.follow_up_due_on,
      ai: result
        ? {
            state: result.state as CheckState,
            causes: ((result.causes ?? []) as { cause_id: string; likelihood: Likelihood }[]).map((c) => ({ id: c.cause_id, likelihood: c.likelihood })),
            library: result.model_version,
            observed: result.observed ?? [],
          }
        : null,
      events: history,
    };
  });
}

/** Supabase returns a to-one join as an object or a one-item array depending on the relation. */
function one<T>(v: T | T[] | null | undefined): T | undefined {
  return Array.isArray(v) ? v[0] : (v ?? undefined);
}
