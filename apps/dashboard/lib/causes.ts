import type { Crop } from './types';

// The closed cause list an agronomist can choose from (architecture.md §5.4 `causes`).
// Kiswahili names need review by a native speaker, like the farmer app.
/** `also`: other crops the same cause hits, so reviewers and scouts can pick it there too. */
export type Cause = { id: string; crop: Crop | 'any'; also?: Crop[]; latin?: string; en: string; sw: string };

export const CAUSES: Cause[] = [
  { id: 'early_blight', crop: 'tomatoes', latin: 'Alternaria solani', en: 'Early blight', sw: 'Kuoza kwa majani' },
  { id: 'late_blight', crop: 'tomatoes', latin: 'Phytophthora infestans', en: 'Late blight', sw: 'Ukungu wa nyanya' },
  { id: 'septoria', crop: 'tomatoes', latin: 'Septoria lycopersici', en: 'Septoria leaf spot', sw: 'Madoa madogo ya majani' },
  { id: 'tuta', crop: 'tomatoes', latin: 'Tuta absoluta', en: 'Tomato leaf miner (Tuta)', sw: 'Kipekecha majani ya nyanya (Tuta)' },
  { id: 'bacterial_wilt', crop: 'tomatoes', latin: 'Ralstonia solanacearum', en: 'Bacterial wilt', sw: 'Mnyauko bakteria' },
  { id: 'fall_armyworm', crop: 'maize', latin: 'Spodoptera frugiperda', en: 'Fall armyworm', sw: 'Viwavi jeshi vamizi' },
  { id: 'maize_streak', crop: 'maize', en: 'Maize streak virus', sw: 'Ugonjwa wa michirizi ya mahindi' },
  { id: 'mln', crop: 'maize', en: 'Maize lethal necrosis', sw: 'Ugonjwa hatari wa mahindi (MLN)' },
  { id: 'bean_rust', crop: 'beans', latin: 'Uromyces appendiculatus', en: 'Bean rust', sw: 'Kutu ya maharagwe' },
  { id: 'angular_leaf_spot', crop: 'beans', en: 'Angular leaf spot', sw: 'Madoa ya pembe kwenye majani' },
  { id: 'black_rot', crop: 'kale', also: ['cabbage'], latin: 'Xanthomonas campestris', en: 'Black rot', sw: 'Kuoza mweusi' },
  { id: 'potato_blight', crop: 'potatoes', latin: 'Phytophthora infestans', en: 'Potato late blight', sw: 'Ukungu wa viazi' },
  { id: 'potato_wilt', crop: 'potatoes', latin: 'Ralstonia solanacearum', en: 'Bacterial wilt of potato', sw: 'Mnyauko bakteria wa viazi' },
  { id: 'diamondback', crop: 'cabbage', latin: 'Plutella xylostella', en: 'Diamondback moth', sw: 'Nondo almasi (DBM)' },
  { id: 'aphids', crop: 'any', en: 'Aphids', sw: 'Vidukari' },
  { id: 'nitrogen', crop: 'any', en: 'Nitrogen shortage', sw: 'Upungufu wa naitrojeni' },
  { id: 'water_stress', crop: 'any', en: 'Water stress', sw: 'Ukosefu wa maji' },
];

export const causeById = (id: string) => CAUSES.find((c) => c.id === id);
export const causesFor = (crop: Crop) => CAUSES.filter((c) => c.crop === crop || c.crop === 'any' || c.also?.includes(crop));

export const CROP_NAME: Record<Crop, string> = {
  tomatoes: 'Tomatoes',
  maize: 'Maize',
  beans: 'Beans',
  kale: 'Sukuma wiki',
  potatoes: 'Potatoes',
  cabbage: 'Cabbage',
};
