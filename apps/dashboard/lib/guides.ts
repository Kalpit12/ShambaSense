import type { SupabaseClient } from '@supabase/supabase-js';

import type { Org, Role } from './coop';

// Knowledge base (architecture.md §5.4). Guides are written and changed only through the database
// functions in the guides_editor migration, which check the role, keep one live version per guide,
// and refuse to let the author approve their own guide.

export type GuideStatus = 'draft' | 'in_review' | 'published' | 'retired';
export type Language = 'en' | 'sw';

export type Guide = {
  id: string;
  /** Null for ShambaSense's own guides, which a co-op can read but not change. */
  orgId: string | null;
  causeId: string;
  language: Language;
  version: number;
  title: string;
  steps: string[];
  warning: string | null;
  status: GuideStatus;
  containsChemical: boolean;
  authorId: string | null;
  authorName: string | null;
  reviewerName: string | null;
  reviewedOn: string | null;
  reviewNote: string | null;
  updatedAt: string;
};

export const STATUS_WORD: Record<GuideStatus, string> = {
  draft: 'Draft',
  in_review: 'Waiting for review',
  published: 'On farmers’ phones',
  retired: 'Retired',
};
export const LANGUAGE_WORD: Record<Language, string> = { en: 'English', sw: 'Kiswahili' };

export const canWrite = (role: Role | undefined) => role === 'owner' || role === 'admin' || role === 'agronomist';
export const MAX_STEPS = 8;

/** Plain words for the errors the guide functions raise. */
export function guideError(message: string) {
  if (/own_guide/.test(message)) return 'Someone else on the team has to review a guide you wrote.';
  if (/draft_exists/.test(message)) return 'There is already a draft of this guide in this language. Open it from the list.';
  if (/only agronomists/.test(message)) return 'Only agronomists and admins write and review guides.';
  return message;
}

// Connected mode ------------------------------------------------------------------------------

export async function loadGuides(client: SupabaseClient): Promise<Guide[]> {
  const { data, error } = await client
    .from('guides')
    .select('id, org_id, cause_id, language, version, title, steps, warning, status, contains_chemical, author_id, author_name, reviewer_name, reviewed_on, review_note, updated_at')
    .order('updated_at', { ascending: false })
    .limit(500);
  if (error) throw new Error(error.message);
  return (data ?? []).map((g) => ({
    id: g.id,
    orgId: g.org_id,
    causeId: g.cause_id,
    language: g.language,
    version: g.version,
    title: g.title,
    steps: g.steps ?? [],
    warning: g.warning,
    status: g.status,
    containsChemical: g.contains_chemical,
    authorId: g.author_id,
    authorName: g.author_name,
    reviewerName: g.reviewer_name,
    reviewedOn: g.reviewed_on,
    reviewNote: g.review_note,
    updatedAt: g.updated_at,
  }));
}

export type Draft = { causeId: string; language: Language; title: string; steps: string[]; warning: string };

/** The calls the page makes, for Supabase or for the in-browser sample. Each returns an error or null. */
export type GuideApi = {
  save: (id: string | null, d: Draft) => Promise<{ id?: string; error?: string }>;
  newVersion: (id: string) => Promise<{ id?: string; error?: string }>;
  submit: (id: string) => Promise<string | null>;
  review: (id: string, approve: boolean, note: string) => Promise<string | null>;
  retire: (id: string) => Promise<string | null>;
};

export function remoteApi(client: SupabaseClient, org: Org): GuideApi {
  const call = async (fn: string, args: Record<string, unknown>) => {
    const { data, error } = await client.rpc(fn, args);
    return { data, error: error ? guideError(error.message) : undefined };
  };
  return {
    save: async (id, d) => {
      const r = await call('save_guide', { p_id: id, p_org: org.id, p_cause: d.causeId, p_language: d.language, p_title: d.title, p_steps: d.steps, p_warning: d.warning });
      return { id: r.data as string, error: r.error };
    },
    newVersion: async (id) => {
      const r = await call('new_guide_version', { p_id: id });
      return { id: r.data as string, error: r.error };
    },
    submit: async (id) => (await call('submit_guide', { p_id: id })).error ?? null,
    review: async (id, approve, note) => (await call('review_guide', { p_id: id, p_approve: approve, p_note: note })).error ?? null,
    retire: async (id) => (await call('retire_guide', { p_id: id })).error ?? null,
  };
}

// Sample data ---------------------------------------------------------------------------------

const ago = (days: number) => new Date(Date.now() - days * 86400_000).toISOString();
const g = (x: Partial<Guide> & Pick<Guide, 'id' | 'causeId' | 'language' | 'title' | 'steps'>): Guide => ({
  orgId: 'org-sample',
  version: 1,
  warning: null,
  status: 'in_review',
  containsChemical: false,
  authorId: null,
  authorName: 'ShambaSense',
  reviewerName: null,
  reviewedOn: null,
  reviewNote: null,
  updatedAt: ago(1),
  ...x,
});

export function sampleGuides(): Guide[] {
  return [
    g({
      id: 'g-lb-en', causeId: 'late_blight', language: 'en', title: 'Late blight on tomatoes', status: 'published', version: 2,
      steps: ['Act today. Late blight can spread across a plot in a few days.', 'Pull out plants with many dark patches. Bury or burn them away from the field. Do not compost them.', 'Do not work among the plants while they are wet.', 'Ask an agronomist how to protect the plants that are still healthy.'],
      warning: 'Ask an agronomist today if more than a few plants have dark patches.',
      authorId: 'u-otieno', authorName: 'Otieno M.', reviewerName: 'Wanjiru K.', reviewedOn: ago(12).slice(0, 10), updatedAt: ago(12),
    }),
    g({
      id: 'g-lb-sw', causeId: 'late_blight', language: 'sw', title: 'Ukungu wa nyanya', status: 'published', version: 2,
      steps: ['Chukua hatua leo. Ugonjwa huu unaweza kuenea shamba lote kwa siku chache.', 'Ng’oa mimea yenye mabaka mengi meusi. Ifukie au ichome mbali na shamba. Usiiweke kwenye mboji.', 'Usifanye kazi katikati ya mimea ikiwa bado imelowa.', 'Uliza mtaalamu jinsi ya kulinda mimea ambayo bado ni mizima.'],
      warning: 'Uliza mtaalamu leo kama mimea mingi ina mabaka meusi.',
      authorId: 'u-otieno', authorName: 'Otieno M.', reviewerName: 'Wanjiru K.', reviewedOn: ago(12).slice(0, 10), updatedAt: ago(12),
    }),
    g({
      id: 'g-faw-en', causeId: 'fall_armyworm', language: 'en', title: 'Fall armyworm in maize', status: 'published',
      steps: ['Check 20 plants across the field twice a week, looking into the funnel.', 'Crush egg masses and young caterpillars by hand when there are few.', 'Put a pinch of dry soil or ash into the funnel of damaged plants.', 'Plant desmodium between maize rows next season (push-pull).'],
      warning: 'Ask an agronomist if more than 1 in 5 plants have fresh damage.',
      authorId: 'u-otieno', authorName: 'Otieno M.', reviewerName: 'Akinyi Odhiambo', reviewedOn: ago(30).slice(0, 10), updatedAt: ago(30),
    }),
    g({
      id: 'g-eb-en', causeId: 'early_blight', language: 'en', title: 'Early blight on tomatoes',
      steps: ['Pick off the lowest leaves with spots and carry them out of the field.', 'Water at the base of the plant in the morning. Keep the leaves dry.', 'Put dry grass or mulch under the plants so soil does not splash onto the leaves.', 'Next season, plant tomatoes and potatoes in a different place.'],
      warning: 'Ask an agronomist if it keeps spreading after a week, or reaches the fruit.',
    }),
    g({
      id: 'g-eb-sw', causeId: 'early_blight', language: 'sw', title: 'Kuoza kwa majani kwenye nyanya',
      steps: ['Ondoa majani ya chini yenye madoa na uyapeleke nje ya shamba.', 'Mwagilia kwenye shina asubuhi. Usiloweshe majani.', 'Weka nyasi kavu au matandazo chini ya mimea ili udongo usirukie majani.', 'Msimu ujao, panda nyanya na viazi mahali tofauti.'],
      warning: 'Uliza mtaalamu kama unaendelea kuenea baada ya wiki moja, au ukifika kwenye matunda.',
    }),
    g({
      id: 'g-tuta-en', causeId: 'tuta', language: 'en', title: 'Tomato leaf miner (Tuta)',
      steps: ['Pick the leaves and fruit with mines and destroy them. Do not leave them in the field.', 'Hang sticky or pheromone traps to see how many moths there are.', 'After harvest, pull out and destroy the old tomato plants.', 'Ask an agronomist if the damage keeps spreading.'],
    }),
    g({
      id: 'g-br-en', causeId: 'bean_rust', language: 'en', title: 'Bean rust', status: 'draft', authorId: 'u-wanjiru', authorName: 'Wanjiru K.',
      steps: ['Remove the worst leaves and carry them out of the field.', 'Do not work among the beans while the leaves are wet.', 'Next season, plant a rust-tolerant variety and space the rows wider.'],
      reviewNote: 'Add when to ask for help, please.',
    }),
  ];
}

export function sampleApi(set: (fn: (all: Guide[]) => Guide[]) => void, get: () => Guide[], org: Org): GuideApi {
  const now = () => new Date().toISOString();
  const keyOf = (x: Guide) => `${x.causeId}:${x.language}`;
  return {
    save: async (id, d) => {
      const clean = { ...d, title: d.title.trim(), steps: d.steps.map((s) => s.trim()).filter(Boolean), warning: d.warning.trim() || null };
      if (!clean.title) return { error: 'A title is required.' };
      if (!clean.steps.length) return { error: 'Add at least one step.' };
      if (id) {
        set((all) => all.map((x) => (x.id === id ? { ...x, ...clean, status: 'draft', updatedAt: now() } : x)));
        return { id };
      }
      const all = get();
      if (all.some((x) => keyOf(x) === `${d.causeId}:${d.language}` && (x.status === 'draft' || x.status === 'in_review'))) return { error: guideError('draft_exists') };
      const version = Math.max(0, ...all.filter((x) => keyOf(x) === `${d.causeId}:${d.language}`).map((x) => x.version)) + 1;
      const fresh: Guide = { ...g({ id: `g-${Date.now()}`, ...clean, causeId: d.causeId, language: d.language }), version, status: 'draft', authorId: org.myId, authorName: org.myName, updatedAt: now() };
      set((xs) => [fresh, ...xs]);
      return { id: fresh.id };
    },
    newVersion: async (id) => {
      const all = get();
      const live = all.find((x) => x.id === id)!;
      const open = all.find((x) => keyOf(x) === keyOf(live) && (x.status === 'draft' || x.status === 'in_review'));
      if (open) return { id: open.id };
      const fresh: Guide = { ...live, id: `g-${Date.now()}`, version: live.version + 1, status: 'draft', authorId: org.myId, authorName: org.myName, reviewerName: null, reviewedOn: null, reviewNote: null, updatedAt: now() };
      set((xs) => [fresh, ...xs]);
      return { id: fresh.id };
    },
    submit: async (id) => {
      set((all) => all.map((x) => (x.id === id ? { ...x, status: 'in_review', reviewNote: null, updatedAt: now() } : x)));
      return null;
    },
    review: async (id, approve, note) => {
      const x = get().find((y) => y.id === id)!;
      if (x.authorId === org.myId) return guideError('own_guide');
      if (!approve && !note.trim()) return 'Say what to change.';
      set((all) =>
        all.map((y) => {
          if (y.id === id)
            return approve
              ? { ...y, status: 'published', reviewerName: org.myName, reviewedOn: now().slice(0, 10), reviewNote: note.trim() || null, updatedAt: now() }
              : { ...y, status: 'draft', reviewNote: note.trim(), updatedAt: now() };
          if (approve && keyOf(y) === keyOf(x) && y.status === 'published') return { ...y, status: 'retired', updatedAt: now() };
          return y;
        }),
      );
      return null;
    },
    retire: async (id) => {
      set((all) => all.flatMap((x) => (x.id !== id ? [x] : x.status === 'published' ? [{ ...x, status: 'retired' as const, updatedAt: now() }] : [])));
      return null;
    },
  };
}
