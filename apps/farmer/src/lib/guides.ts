import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useSyncExternalStore } from 'react';

import i18n, { type Language } from '@/i18n';
import { supabase, useAuth } from './auth';
import { CAUSES, STEP_COUNT } from './check-results';

// Crop guides (architecture.md §5.4). The server only hands a farmer guides that a second person on
// their co-op's team reviewed, so everything here can be shown as is. They are kept on the phone and
// read without signal; the copy is refreshed whenever the app opens with a connection.

export type Guide = {
  id: string;
  causeId: string;
  crop: string;
  causeName: { en: string; sw: string };
  language: Language;
  version: number;
  title: string;
  steps: string[];
  warning: string | null;
  reviewerName: string | null;
  reviewedOn: string | null;
  coopName: string | null;
  /** Built on the phone from the preview steps, not reviewed. */
  preview?: boolean;
};

type Cache = { owner: string; guides: Guide[]; syncedAt: string | null; loading: boolean };

const keyOf = (owner: string) => `shambasense.guides.v1.${owner}`;
let cache: Cache = { owner: '', guides: [], syncedAt: null, loading: false };
const listeners = new Set<() => void>();
const publish = (next: Partial<Cache>) => {
  cache = { ...cache, ...next };
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => (listeners.add(l), () => listeners.delete(l));

/** Preview mode has no server: the four tomato causes, from the app's own (unreviewed) text. */
function previewGuides(): Guide[] {
  return CAUSES.flatMap((id) =>
    (['en', 'sw'] as const).map((language) => {
      const t = i18n.getFixedT(language);
      return {
        id: `preview-${id}-${language}`,
        causeId: id,
        crop: 'tomatoes',
        causeName: { en: i18n.getFixedT('en')(`causes.${id}.name`), sw: i18n.getFixedT('sw')(`causes.${id}.name`) },
        language,
        version: 1,
        title: t(`causes.${id}.name`),
        steps: Array.from({ length: STEP_COUNT[id] }, (_, i) => t(`causes.${id}.step${i + 1}`)),
        warning: null,
        reviewerName: null,
        reviewedOn: null,
        coopName: null,
        preview: true,
      };
    }),
  );
}

type Row = {
  id: string;
  cause_id: string;
  language: Language;
  version: number;
  title: string | null;
  steps: string[] | null;
  warning: string | null;
  reviewer_name: string | null;
  reviewed_on: string | null;
  causes: { crop: string; name_en: string; name_sw: string } | null;
  orgs: { name: string } | null;
};

async function fetchGuides(): Promise<Guide[]> {
  const { data, error } = await supabase!
    .from('guides')
    .select('id, cause_id, language, version, title, steps, warning, reviewer_name, reviewed_on, causes(crop, name_en, name_sw), orgs(name)')
    .eq('status', 'published')
    .limit(300);
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as Row[])
    .filter((r) => r.steps?.length)
    .map((r) => ({
      id: r.id,
      causeId: r.cause_id,
      crop: r.causes?.crop ?? 'any',
      causeName: { en: r.causes?.name_en ?? r.cause_id, sw: r.causes?.name_sw ?? r.cause_id },
      language: r.language,
      version: r.version,
      title: r.title || (r.language === 'sw' ? r.causes?.name_sw : r.causes?.name_en) || r.cause_id,
      steps: r.steps!,
      warning: r.warning,
      reviewerName: r.reviewer_name,
      reviewedOn: r.reviewed_on,
      coopName: r.orgs?.name ?? null,
    }));
}

/** Guides for this account: the copy on the phone at once, then a fresh one when there is signal. */
export function useGuides() {
  const { user } = useAuth();
  const owner = user?.id ?? user?.phone;
  const state = useSyncExternalStore(subscribe, () => cache);

  const refresh = useCallback(async () => {
    if (!owner) return;
    if (!supabase) return publish({ owner, guides: previewGuides(), syncedAt: new Date().toISOString() });
    publish({ loading: true });
    try {
      const guides = await fetchGuides();
      const syncedAt = new Date().toISOString();
      if (cache.owner === owner) publish({ guides, syncedAt });
      AsyncStorage.setItem(keyOf(owner), JSON.stringify({ guides, syncedAt })).catch(() => {});
    } catch {
      // No signal: keep the copy on the phone.
    } finally {
      publish({ loading: false });
    }
  }, [owner]);

  useEffect(() => {
    if (!owner || cache.owner === owner) return;
    publish({ owner, guides: [], syncedAt: null });
    AsyncStorage.getItem(keyOf(owner))
      .then((raw) => {
        if (!raw || cache.owner !== owner || cache.syncedAt) return;
        const saved = JSON.parse(raw) as { guides: Guide[]; syncedAt: string };
        publish({ guides: saved.guides, syncedAt: saved.syncedAt });
      })
      .catch(() => {})
      .finally(refresh);
  }, [owner, refresh]);

  const ready = state.owner === owner;
  return { guides: ready ? state.guides : [], syncedAt: ready ? state.syncedAt : null, loading: state.loading, refresh };
}

/** The reviewed guide for a cause in the farmer's language, if the co-op has published one. */
export function guideFor(guides: Guide[], causeId: string, language: string) {
  return guides.find((g) => g.causeId === causeId && g.language === language && !g.preview);
}

export async function forgetGuides(owner: string | undefined) {
  if (owner) await AsyncStorage.removeItem(keyOf(owner)).catch(() => {});
  publish({ owner: '', guides: [], syncedAt: null });
}
