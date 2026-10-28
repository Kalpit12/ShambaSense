import type { SupabaseClient } from '@supabase/supabase-js';

// First-time questions, asked once right after sign-up: four required, five skippable, about two minutes.
// Each answer feeds something the app does, see README "First-time questions".

export const CROPS = [
  'maize', 'beans', 'potatoes', 'tomatoes', 'kale', 'cabbage',
  'onions', 'bananas', 'avocado', 'tea', 'coffee', 'other',
] as const;
export type Crop = (typeof CROPS)[number];

export const FARM_SIZES = ['under1', '1to2', '2to5', 'over5', 'notSure'] as const;
export type FarmSize = (typeof FARM_SIZES)[number];

export const PLOTS = ['one', 'two', '3to5', 'over5'] as const;
export type Plots = (typeof PLOTS)[number];

export const LIVESTOCK = ['cows', 'goats', 'sheep', 'chickens', 'pigs', 'bees', 'none'] as const;
export type Livestock = (typeof LIVESTOCK)[number];

export const AGES = ['18to24', '25to34', '35to44', '45to54', '55plus', 'skip'] as const;
export type Age = (typeof AGES)[number];

export const GENDERS = ['woman', 'man', 'skip'] as const;
export type Gender = (typeof GENDERS)[number];

export const WATER = ['rain', 'irrigation', 'both'] as const;
export type Water = (typeof WATER)[number];

export const GOALS = ['checkCrops', 'records', 'agronomist', 'reminders'] as const;
export type Goal = (typeof GOALS)[number];

export type FarmAnswers = {
  crops: Crop[];
  size: FarmSize;
  plots: Plots;
  farmName: string;
  county: string;
  ward: string;
  water: Water;
  livestock: Livestock[];
  coop: boolean | null;
  coopName: string;
  goals: Goal[];
  age: Age;
  gender: Gender;
};

/**
 * Writes the answers: the farm row (name, county, ward, size band, water, main crops) and the
 * profile (ward, goals). Phones will write through PowerSync's upload queue once it lands;
 * until then this goes direct.
 */
export async function saveFarmAnswers(client: SupabaseClient, userId: string, a: FarmAnswers): Promise<string | null> {
  const farm = await client.from('farms').insert({
    owner_id: userId,
    name: a.farmName,
    county: a.county,
    ward: a.ward || null,
    size_band: a.size,
    water_source: a.water,
    main_crops: a.crops,
    plot_count: a.plots,
    livestock: a.livestock.filter((l) => l !== 'none'),
  });
  if (farm.error) return farm.error.message;

  // Age and gender are optional and only stored when given. Kenya's Data Protection Act lists sex as
  // sensitive personal data, so a gender answer is saved together with an explicit consent record.
  const profile = await client
    .from('profiles')
    .update({
      county: a.county,
      ward: a.ward || null,
      goals: a.goals,
      coop_member: a.coop,
      coop_name: a.coop ? a.coopName || null : null,
      age_band: a.age === 'skip' ? null : a.age,
      gender: a.gender === 'skip' ? null : a.gender,
    })
    .eq('user_id', userId);
  if (profile.error) return profile.error.message;

  if (a.gender !== 'skip') {
    const consent = await client.from('consents').insert({ user_id: userId, kind: 'sensitive_profile', version: '2026-10' });
    if (consent.error) return consent.error.message;
  }
  return null;
}

/** Marks the user onboarded so they never see the questions again. */
export async function markOnboarded(client: SupabaseClient): Promise<string | null> {
  const { error } = await client.auth.updateUser({ data: { onboarded_at: new Date().toISOString() } });
  return error?.message ?? null;
}

/** Reads the saved answers back after a sign-in on a new phone. Null when the farm row is missing. */
export async function loadFarmAnswers(client: SupabaseClient, userId: string): Promise<FarmAnswers | null> {
  const [farm, profile] = await Promise.all([
    client.from('farms').select('*').eq('owner_id', userId).order('created_at').limit(1).maybeSingle(),
    client.from('profiles').select('goals, coop_member, coop_name, age_band, gender').eq('user_id', userId).maybeSingle(),
  ]);
  const f = farm.data;
  if (!f) return null;
  const p: Record<string, any> = profile.data ?? {};
  return {
    crops: f.main_crops ?? [],
    size: f.size_band ?? 'notSure',
    plots: f.plot_count ?? 'one',
    farmName: f.name,
    county: f.county,
    ward: f.ward ?? '',
    water: f.water_source ?? 'rain',
    livestock: f.livestock?.length ? f.livestock : ['none'],
    coop: p.coop_member ?? null,
    coopName: p.coop_name ?? '',
    goals: p.goals ?? [],
    age: p.age_band ?? 'skip',
    gender: p.gender ?? 'skip',
  };
}

/** The pretend existing account in preview mode (+254 712 345 678). */
export const PREVIEW_FARM: FarmAnswers = {
  crops: ['maize', 'beans', 'kale'],
  size: '1to2',
  plots: '3to5',
  farmName: 'Shamba la Juma',
  county: 'Nakuru',
  ward: 'Njoro',
  water: 'rain',
  livestock: ['cows', 'chickens'],
  coop: true,
  coopName: 'Njoro Dairy Co-operative',
  goals: ['checkCrops', 'records'],
  age: 'skip',
  gender: 'skip',
};

/** Plot count the farmer gave, as a target for "2 of 3 plots added". */
export function expectedPlots(p: Plots | undefined) {
  return { one: 1, two: 2, '3to5': 3, over5: 6 }[p ?? 'one'];
}
