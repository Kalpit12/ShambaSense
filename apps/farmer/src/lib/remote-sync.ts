import type { SupabaseClient } from '@supabase/supabase-js';

import type { CauseId, CheckResult } from './check-results';
import type { AgronomistReply, CropCheck, FollowUp, JournalRecord, Plot } from './farm-store';

// Sends rows saved on the phone to Supabase and brings answers back. Every write is an upsert that
// ignores rows already there, so a retry after lost signal never makes a duplicate (ids are made on
// the phone). PowerSync's upload queue replaces this once it lands (architecture.md §3.2).

export type Row =
  | { table: 'plots'; row: Plot }
  | { table: 'records'; row: JournalRecord }
  | { table: 'checks'; row: CropCheck }
  | { table: 'followUps'; row: FollowUp; parent: CropCheck };

const ignoreDupes = { onConflict: 'id', ignoreDuplicates: true } as const;

/** The farm made during the first-time questions. */
export async function farmIdFor(client: SupabaseClient, userId: string): Promise<string | null> {
  const { data } = await client.from('farms').select('id').eq('owner_id', userId).order('created_at').limit(1).maybeSingle();
  return data?.id ?? null;
}

export async function sendRow(client: SupabaseClient, userId: string, farmId: string, item: Row): Promise<void> {
  if (item.table === 'plots') {
    const p = item.row;
    await must(client.from('plots').upsert({ id: p.id, farm_id: farmId, name: p.name, area: p.areaAcres, area_unit: 'acres' }, ignoreDupes));
    // One crop cycle per plot for now, sharing the plot's id.
    await must(client.from('crop_cycles').upsert({ id: p.id, plot_id: p.id, crop: p.crop, planted_on: p.plantedOn }, ignoreDupes));
    return;
  }
  if (item.table === 'records') {
    const r = item.row;
    await must(
      client.from('journal_events').upsert(
        { id: r.id, farm_id: farmId, plot_id: r.plotId, cycle_id: r.plotId, kind: r.kind, occurred_on: r.occurredOn, quantity: r.quantity, unit: r.unit, amount_kes: r.amountKes, note: r.note },
        ignoreDupes,
      ),
    );
    return;
  }
  if (item.table === 'followUps') {
    const f = item.row;
    const p = item.parent;
    const path = await uploadPhoto(client, userId, f.id, f.photoUri);
    await must(client.from('crop_checks').upsert(
      {
        id: f.id, farm_id: farmId, plot_id: p.plotId, cycle_id: p.plotId, crop_claimed: p.crop, captured_at: f.createdAt,
        status: 'uploaded', kind: 'follow_up', parent_check_id: p.id, outcome: f.outcome,
      },
      ignoreDupes,
    ));
    await must(client.from('media').upsert({ id: f.id, check_id: f.id, kind: 'photo', storage_path: path, upload_state: 'uploaded' }, ignoreDupes));
    return;
  }
  const c = item.row;
  const path = await uploadPhoto(client, userId, c.id, c.photoUri);
  await must(client.from('crop_checks').upsert(
    { id: c.id, farm_id: farmId, plot_id: c.plotId, cycle_id: c.plotId, crop_claimed: c.crop, symptoms: c.symptoms, captured_at: c.createdAt, status: 'uploaded' },
    ignoreDupes,
  ));
  await must(client.from('media').upsert({ id: c.id, check_id: c.id, kind: 'photo', storage_path: path, upload_state: 'uploaded' }, ignoreDupes));
}

async function uploadPhoto(client: SupabaseClient, userId: string, id: string, uri: string) {
  const path = `${userId}/${id}.jpg`;
  if (!uri.startsWith('sample:')) {
    const body = await (await fetch(uri)).arrayBuffer();
    const up = await client.storage.from('check-photos').upload(path, body, { contentType: 'image/jpeg', upsert: false });
    if (up.error && !/exists|duplicate/i.test(up.error.message)) throw new Error(up.error.message);
  }
  return path;
}

export async function askAgronomistRemote(client: SupabaseClient, checkId: string) {
  const { error } = await client.rpc('ask_agronomist', { p_check: checkId });
  if (error) throw new Error(error.message);
}

const tried = new Set<string>();

/**
 * Asks the photo reader for a first answer (supabase/functions/diagnose). Once per check per app run:
 * when it fails (no key yet, no signal, daily limit) the check still waits for the agronomist.
 */
export async function diagnoseRemote(client: SupabaseClient, checkId: string) {
  if (tried.has(checkId)) return;
  tried.add(checkId);
  await client.functions.invoke('diagnose', { body: { check_id: checkId } }).catch(() => {});
}

/** Hands an uploaded follow-up to the first check's case, which goes back to the agronomist. */
export async function sendFollowUpRemote(client: SupabaseClient, checkId: string) {
  const { error } = await client.rpc('send_follow_up', { p_check: checkId });
  if (error) throw new Error(error.message);
}

const REVIEW_KINDS = ['review_agree', 'review_adjust', 'review_reject', 'request_photos'];

/** Results and agronomist answers for these checks. Missing entries mean nothing new yet. */
export async function pullAnswers(client: SupabaseClient, checkIds: string[]) {
  const out = new Map<string, { result?: CheckResult; reply?: AgronomistReply; closed?: boolean }>();
  if (checkIds.length === 0) return out;
  const [results, issues] = await Promise.all([
    client.from('check_results').select('check_id, model_version, state, causes, created_at').in('check_id', checkIds),
    client.from('issues').select('id, origin_check_id, status, follow_up_due_on').in('origin_check_id', checkIds),
  ]);
  for (const r of results.data ?? []) {
    out.set(r.check_id, {
      result: {
        state: r.state,
        causes: ((r.causes ?? []) as { cause_id: CauseId; likelihood: 'more_likely' | 'possible' }[]).map((x) => ({ id: x.cause_id, likelihood: x.likelihood })),
        library: r.model_version,
        at: r.created_at,
      },
    });
  }
  const issueRows = issues.data ?? [];
  if (issueRows.length) {
    const events = await client
      .from('issue_events')
      .select('issue_id, kind, actor_name, body, cause_ids, created_at')
      .in('issue_id', issueRows.map((i) => i.id))
      .in('kind', REVIEW_KINDS)
      .order('created_at', { ascending: false });
    for (const issue of issueRows) {
      const latest = (events.data ?? []).find((e) => e.issue_id === issue.id);
      const entry = out.get(issue.origin_check_id) ?? {};
      if (issue.status === 'closed') {
        entry.closed = true;
        out.set(issue.origin_check_id, entry);
      }
      if (!latest) continue;
      entry.reply = {
        kind: latest.kind,
        by: latest.actor_name ?? '',
        at: latest.created_at,
        body: latest.body ?? '',
        causeIds: latest.cause_ids ?? [],
        followUpDue: issue.follow_up_due_on ?? undefined,
      };
      out.set(issue.origin_check_id, entry);
    }
  }
  return out;
}

async function must(q: PromiseLike<{ error: { message: string } | null }>) {
  const { error } = await q;
  if (error) throw new Error(error.message);
}
