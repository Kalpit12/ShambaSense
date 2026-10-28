import type { SupabaseClient } from '@supabase/supabase-js';

import { CROP_NAME } from './causes';
import type { Crop } from './types';

// The co-op itself: who is on the team, who is invited, and which farmers have joined. Connected mode
// reads these through the org_team / org_farmers functions and changes them through the admin
// functions in the coop_setup migration, which check the role and write the audit line.

export type Role = 'owner' | 'admin' | 'agronomist' | 'field_officer' | 'viewer';

export const ROLE_LABEL: Record<Role, string> = {
  owner: 'Owner',
  admin: 'Admin',
  agronomist: 'Agronomist',
  field_officer: 'Field officer',
  viewer: 'Viewer',
};

export const ROLE_HINT: Record<Role, string> = {
  owner: 'Everything an admin does, and can add or remove admins and owners.',
  admin: 'Adds and removes team members and farmers, and changes the join code.',
  agronomist: 'Reviews crop cases and replies to farmers.',
  field_officer: 'Reviews crop cases and replies to farmers, usually in the field.',
  viewer: 'Sees cases and farmers. Cannot reply or change anything.',
};

export const ROLES: Role[] = ['owner', 'admin', 'agronomist', 'field_officer', 'viewer'];

export type OrgKind = 'coop' | 'ngo' | 'agribusiness';
export const KIND_LABEL: Record<OrgKind, string> = { coop: 'Co-operative', ngo: 'NGO or programme', agribusiness: 'Agribusiness' };
export const ALL_CROPS = Object.keys(CROP_NAME) as Crop[];

export type Org = {
  id: string;
  name: string;
  joinCode: string;
  role: Role;
  myName: string;
  myId: string;
  kind: OrgKind;
  county: string | null;
  contactPhone: string | null;
  /** Crops the co-op works with; the dashboard's crop pickers show only these. */
  crops: Crop[];
};
export type Member = { userId: string; name: string; role: Role; email: string; joinedAt: string; lastSignInAt: string | null };
export type Invite = { id: string; email: string; role: Role; name: string; createdAt: string };
export type CoopFarmer = {
  id: string;
  name: string;
  phone: string;
  language: 'en' | 'sw';
  county: string;
  ward: string;
  farmName: string;
  sizeBand: string | null;
  waterSource: string | null;
  crops: string[];
  plots: number;
  checks: number;
  openCases: number;
  lastCheckAt: string | null;
  joinedAt: string;
};

export const isAdmin = (r: Role | undefined) => r === 'owner' || r === 'admin';

export const SIZE_LABEL: Record<string, string> = { under1: 'Under 1 acre', '1to2': '1–2 acres', '2to5': '2–5 acres', over5: 'Over 5 acres', notSure: 'Size not known' };
export const WATER_LABEL: Record<string, string> = { rain: 'Rain-fed', irrigation: 'Irrigated', both: 'Rain and irrigation' };

/** Plain words for the errors the admin functions raise. */
export function coopError(message: string) {
  if (/last_owner/.test(message)) return 'A co-op needs at least one owner. Make someone else owner first.';
  if (/already_member/.test(message)) return 'That person is already on the team.';
  if (/only an owner/.test(message)) return 'Only an owner can change admins and owners.';
  if (/only an org admin/.test(message)) return 'Only an admin can do this.';
  if (/invalid email/.test(message)) return 'Check the email address.';
  if (/bad_phone/.test(message)) return 'Use a Kenyan mobile number, like 0712 345 678.';
  if (/name_length/.test(message)) return 'Names need 2 to 80 characters.';
  if (/no_crops/.test(message)) return 'Choose at least one crop.';
  if (/update_org_settings|set_my_display_name/.test(message) && /function|schema cache/.test(message))
    return 'Settings need the latest database update (coop_settings.sql). Ask whoever runs the database to apply it.';
  return message;
}

// Connected mode ------------------------------------------------------------------------------

/** The signed-in member's org. Claims any invite for their email first, so a new member lands in. */
export async function loadOrg(client: SupabaseClient, userId: string): Promise<Org | null> {
  await client.rpc('claim_invites');
  const query = (cols: string) =>
    client.from('org_members').select(`org_id, role, display_name, created_at, orgs(${cols})`).eq('user_id', userId).order('created_at').limit(1);
  // Before the coop_settings migration the newer columns are missing; fall back so sign-in still works.
  let { data, error } = await query('name, join_code, kind, county, contact_phone, crops');
  if (error && /column/.test(error.message)) ({ data, error } = await query('name, join_code, kind'));
  if (error) throw new Error(error.message);
  const m = data?.[0] as { org_id: string; role: string; display_name: string; orgs: unknown } | undefined;
  if (!m) return null;
  const o = (Array.isArray(m.orgs) ? m.orgs[0] : m.orgs) as
    | { name?: string; join_code?: string; kind?: OrgKind; county?: string | null; contact_phone?: string | null; crops?: Crop[] }
    | null;
  return {
    id: m.org_id,
    name: o?.name ?? 'Co-op',
    joinCode: o?.join_code ?? '',
    role: m.role as Role,
    myName: m.display_name,
    myId: userId,
    kind: o?.kind ?? 'coop',
    county: o?.county ?? null,
    contactPhone: o?.contact_phone ?? null,
    crops: o?.crops?.length ? o.crops.filter((c) => ALL_CROPS.includes(c)) : ALL_CROPS,
  };
}

export async function loadTeam(client: SupabaseClient, org: Org): Promise<{ members: Member[]; invites: Invite[] }> {
  const [team, invites] = await Promise.all([
    client.rpc('org_team', { p_org: org.id }),
    isAdmin(org.role)
      ? client.from('org_invites').select('id, email, role, display_name, created_at').eq('org_id', org.id).is('accepted_at', null).order('created_at')
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (team.error) throw new Error(team.error.message);
  return {
    members: (team.data ?? []).map((m: Record<string, string | null>) => ({
      userId: m.user_id!,
      name: m.display_name!,
      role: m.role as Role,
      email: m.email ?? '',
      joinedAt: m.joined_at!,
      lastSignInAt: m.last_sign_in_at,
    })),
    invites: (invites.data ?? []).map((v) => ({ id: v.id, email: v.email, role: v.role as Role, name: v.display_name, createdAt: v.created_at })),
  };
}

export async function loadFarmers(client: SupabaseClient, org: Org): Promise<CoopFarmer[]> {
  const { data, error } = await client.rpc('org_farmers', { p_org: org.id });
  if (error) throw new Error(error.message);
  return (data ?? []).map((f: Record<string, unknown>) => ({
    id: f.farmer_id as string,
    name: (f.display_name as string) || 'Farmer',
    phone: f.phone ? `+${String(f.phone).replace(/^\+/, '')}` : '',
    language: f.language === 'en' ? 'en' : 'sw',
    county: (f.county as string) ?? '',
    ward: (f.ward as string) ?? '',
    farmName: (f.farm_name as string) ?? '',
    sizeBand: (f.size_band as string) ?? null,
    waterSource: (f.water_source as string) ?? null,
    crops: (f.main_crops as string[]) ?? [],
    plots: Number(f.plots ?? 0),
    checks: Number(f.checks ?? 0),
    openCases: Number(f.open_cases ?? 0),
    lastCheckAt: (f.last_check_at as string) ?? null,
    joinedAt: f.joined_at as string,
  }));
}

// Sample data ---------------------------------------------------------------------------------

const ago = (days: number) => new Date(Date.now() - days * 86400_000).toISOString();

export const SAMPLE_ORG: Org = {
  id: 'org-sample',
  name: 'Njoro Growers Co-op',
  joinCode: 'NJR-4821',
  role: 'admin',
  myName: 'Wanjiru K.',
  myId: 'u-wanjiru',
  kind: 'coop',
  county: 'Nakuru',
  contactPhone: '+254712000111',
  crops: ALL_CROPS,
};

export function sampleTeam(): { members: Member[]; invites: Invite[] } {
  return {
    members: [
      { userId: 'u-akinyi', name: 'Akinyi Odhiambo', role: 'owner', email: 'akinyi@njorogrowers.example', joinedAt: ago(210), lastSignInAt: ago(6) },
      { userId: 'u-wanjiru', name: 'Wanjiru K.', role: 'admin', email: 'wanjiru@njorogrowers.example', joinedAt: ago(180), lastSignInAt: ago(0) },
      { userId: 'u-otieno', name: 'Otieno M.', role: 'agronomist', email: 'otieno@njorogrowers.example', joinedAt: ago(95), lastSignInAt: ago(1) },
      { userId: 'u-chebet', name: 'Chebet R.', role: 'field_officer', email: 'chebet@njorogrowers.example', joinedAt: ago(40), lastSignInAt: ago(3) },
    ],
    invites: [{ id: 'inv-1', email: 'kamau@njorogrowers.example', role: 'field_officer', name: 'Kamau N.', createdAt: ago(2) }],
  };
}

type SampleFarmer = Omit<CoopFarmer, 'checks' | 'openCases' | 'lastCheckAt'> & { checks: number; lastCheck: number | null };
const f = (x: SampleFarmer): CoopFarmer => ({ ...x, openCases: 0, lastCheckAt: x.lastCheck == null ? null : ago(x.lastCheck) });

export function sampleFarmers(): CoopFarmer[] {
  return [
    f({ id: 'f-juma', name: 'Juma Kiprono', phone: '+254 712 345 678', language: 'sw', county: 'Nakuru', ward: 'Njoro', farmName: 'Shamba la Juma', sizeBand: '1to2', waterSource: 'rain', crops: ['tomatoes', 'maize', 'beans'], plots: 3, checks: 7, lastCheck: 0.1, joinedAt: ago(150) }),
    f({ id: 'f-grace', name: 'Grace Wambui', phone: '+254 722 118 904', language: 'sw', county: 'Nakuru', ward: 'Mauche', farmName: 'Wambui farm', sizeBand: 'under1', waterSource: 'both', crops: ['tomatoes', 'kale'], plots: 2, checks: 4, lastCheck: 0.2, joinedAt: ago(120) }),
    f({ id: 'f-peter', name: 'Peter Mwangi', phone: '+254 701 552 310', language: 'en', county: 'Nakuru', ward: 'Lare', farmName: 'Mwangi family farm', sizeBand: '2to5', waterSource: 'rain', crops: ['maize', 'beans', 'potatoes'], plots: 4, checks: 5, lastCheck: 1, joinedAt: ago(100) }),
    f({ id: 'f-faith', name: 'Faith Chepkoech', phone: '+254 733 870 441', language: 'sw', county: 'Nakuru', ward: 'Njoro', farmName: 'Chepkoech shamba', sizeBand: '1to2', waterSource: 'irrigation', crops: ['beans', 'cabbage'], plots: 2, checks: 3, lastCheck: 2, joinedAt: ago(64) }),
    f({ id: 'f-samuel', name: 'Samuel Kiptoo', phone: '+254 710 004 562', language: 'en', county: 'Nakuru', ward: 'Kihingo', farmName: 'Kiptoo farm', sizeBand: 'over5', waterSource: 'rain', crops: ['maize', 'potatoes'], plots: 5, checks: 2, lastCheck: 3, joinedAt: ago(41) }),
    f({ id: 'f-mary', name: 'Mary Njeri', phone: '+254 728 663 017', language: 'sw', county: 'Nakuru', ward: 'Mauche', farmName: 'Njeri farm', sizeBand: 'under1', waterSource: 'both', crops: ['tomatoes', 'kale'], plots: 2, checks: 6, lastCheck: 0.3, joinedAt: ago(33) }),
    f({ id: 'f-john', name: 'John Ouma', phone: '+254 715 290 338', language: 'en', county: 'Nakuru', ward: 'Njoro', farmName: 'Ouma shamba', sizeBand: '1to2', waterSource: 'rain', crops: ['kale', 'cabbage'], plots: 2, checks: 2, lastCheck: 6, joinedAt: ago(20) }),
    f({ id: 'f-esther', name: 'Esther Achieng', phone: '+254 745 310 772', language: 'sw', county: 'Nakuru', ward: 'Lare', farmName: 'Achieng garden', sizeBand: 'under1', waterSource: 'irrigation', crops: ['kale', 'tomatoes'], plots: 1, checks: 0, lastCheck: null, joinedAt: ago(1) }),
  ];
}

