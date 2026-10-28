import type { Crop } from './onboarding';
import type { Symptom } from './farm-store';

// What the diagnosis worker sends back for a crop check (architecture.md §6.3). The shape has no
// field for a product, dose or mix, so a result can never carry chemical advice (§6.4).

export type CheckState = 'possible_match' | 'needs_more_information' | 'expert_review_required' | 'unsupported_crop';
export type Likelihood = 'more_likely' | 'possible';

/**
 * The closed cause set for the pilot crops. Names, signs and next steps live in i18n under `causes`.
 * Keep in step with LIBRARY_CAUSES in supabase/functions/diagnose and the `causes` table.
 */
export const CAUSES = [
  'early_blight', 'late_blight', 'septoria', 'tuta',
  'fall_armyworm', 'maize_streak', 'mln', 'nitrogen',
  'bean_rust', 'angular_leaf_spot', 'aphids',
  'black_rot',
] as const;
export type CauseId = (typeof CAUSES)[number];

/** Which crop's guides list a cause sits under. `any` causes show under every crop that uses them. */
export const CAUSE_CROP: Record<CauseId, Crop | 'any'> = {
  early_blight: 'tomatoes', late_blight: 'tomatoes', septoria: 'tomatoes', tuta: 'tomatoes',
  fall_armyworm: 'maize', maize_streak: 'maize', mln: 'maize', nitrogen: 'any',
  bean_rust: 'beans', angular_leaf_spot: 'beans', aphids: 'any',
  black_rot: 'kale',
};

/** Crops the reviewed library covers. Everything else is `unsupported_crop` and can go to an agronomist. */
export const SUPPORTED_CROPS: Crop[] = ['tomatoes', 'maize', 'beans', 'kale'];

export type CheckResult = {
  state: CheckState;
  causes: { id: CauseId; likelihood: Likelihood }[];
  /** Library version that made the result, shown under "Why this result?". */
  library: string;
  at: string;
  /** Made on the phone by the preview stand-in, not by the worker. */
  preview?: boolean;
};

/** Reviewed next steps for each cause. Only cultural steps: no products, doses or mixes. */
export const STEP_COUNT: Record<CauseId, number> = Object.fromEntries(CAUSES.map((id) => [id, 4])) as Record<CauseId, number>;

/**
 * Preview stand-in for the worker. It reads the signs the farmer picked, never the photo, and the
 * result screen says so. Deleted once the real worker answers.
 */
export function previewResult(crop: Crop, symptoms: Symptom[]): CheckResult {
  const base = { library: 'preview', at: new Date().toISOString(), preview: true };
  if (!SUPPORTED_CROPS.includes(crop)) return { ...base, state: 'unsupported_crop', causes: [] };
  const has = (s: Symptom) => symptoms.includes(s);
  if (has('wilting')) return { ...base, state: 'expert_review_required', causes: [] };
  const one = (id: CauseId, likelihood: Likelihood = 'possible'): CheckResult => ({ ...base, state: 'possible_match', causes: [{ id, likelihood }] });
  if (crop === 'maize') {
    if (has('holes') || has('insects')) return one('fall_armyworm', 'more_likely');
    if (has('yellowing')) return one('nitrogen');
    return { ...base, state: 'needs_more_information', causes: [] };
  }
  if (crop === 'beans' || crop === 'kale') {
    if (has('insects')) return one('aphids', 'more_likely');
    if (crop === 'kale' && (has('yellowing') || has('spots'))) return one('black_rot');
    if (crop === 'beans' && has('spots'))
      return { ...base, state: 'possible_match', causes: [{ id: 'bean_rust', likelihood: 'possible' }, { id: 'angular_leaf_spot', likelihood: 'possible' }] };
    return { ...base, state: 'needs_more_information', causes: [] };
  }
  if (has('holes') || has('insects')) return { ...base, state: 'possible_match', causes: [{ id: 'tuta', likelihood: 'more_likely' }] };
  if (has('spots') && has('rot'))
    return { ...base, state: 'possible_match', causes: [{ id: 'late_blight', likelihood: 'possible' }, { id: 'early_blight', likelihood: 'possible' }] };
  if (has('spots') && has('yellowing'))
    return { ...base, state: 'possible_match', causes: [{ id: 'early_blight', likelihood: 'possible' }, { id: 'septoria', likelihood: 'possible' }] };
  if (has('spots')) return { ...base, state: 'possible_match', causes: [{ id: 'early_blight', likelihood: 'more_likely' }] };
  return { ...base, state: 'needs_more_information', causes: [] };
}
