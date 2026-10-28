import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { BookOpenTextIcon, CaretLeftIcon, CaretRightIcon } from '@/components/icons';
import { Enter, PressableScale } from '@/components/motion';
import { Card, SectionTitle } from '@/components/screen';
import { syncTime } from '@/components/sync-chip';
import { isPreview, useAuth } from '@/lib/auth';
import { useCoops } from '@/lib/coops';
import { useGuides, type Guide } from '@/lib/guides';
import { color, font, space, type } from '@/theme/tokens';

/** Crop guides, grouped by crop with the farmer's own crops first. One guide per problem, in their language when there is one. */
export default function GuidesScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { guides, syncedAt, refresh } = useGuides();
  const { coops, loading } = useCoops(!!user?.id);
  const lang = i18n.language;
  const back = () => (router.canGoBack() ? router.back() : router.replace('/home'));

  useEffect(() => {
    refresh();
  }, [refresh]);

  // One guide per problem: the farmer's language if there is one, otherwise the other.
  const shown = new Map<string, Guide>();
  for (const g of guides) {
    const had = shown.get(g.causeId);
    if (!had || (had.language !== lang && g.language === lang)) shown.set(g.causeId, g);
  }
  const mine = user?.farm?.crops ?? [];
  const crops = Array.from(new Set([...shown.values()].map((g) => g.crop))).sort(
    (a, b) => Number(!mine.includes(a as never)) - Number(!mine.includes(b as never)) || Number(a === 'any') - Number(b === 'any') || a.localeCompare(b),
  );
  const cropName = (c: string) => (c === 'any' ? t('guides.anyCrop') : t(`onboarding.crops.${c}`, { defaultValue: c }));
  const name = (g: Guide) => (lang === 'sw' ? g.causeName.sw : g.causeName.en);

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={[styles.scroll, { paddingTop: insets.top + space[3], paddingBottom: insets.bottom + space[6] }]} showsVerticalScrollIndicator={false}>
        <Enter step={0} style={styles.head}>
          <PressableScale onPress={back} accessibilityRole="button" accessibilityLabel={t('common.back')} scaleTo={0.92} style={styles.backBtn}>
            <CaretLeftIcon size={22} color={color.ink} weight="bold" />
          </PressableScale>
          <Text style={styles.title} role="heading">
            {t('guides.title')}
          </Text>
        </Enter>
        <Enter step={0}>
          <Text style={styles.body}>{isPreview ? t('guides.previewIntro') : t('guides.intro')}</Text>
          {syncedAt && !isPreview ? <Text style={styles.meta}>{t('guides.synced', { time: syncTime(syncedAt, t, lang) })}</Text> : null}
        </Enter>

        {shown.size === 0 ? (
          <Enter step={1}>
            <Card style={styles.empty}>
              <BookOpenTextIcon size={28} color={color.stone600} />
              <Text style={styles.body}>{!loading && !coops.length ? t('guides.noCoop') : t('guides.none')}</Text>
            </Card>
          </Enter>
        ) : (
          crops.map((c, ci) => (
            <Enter key={c} step={Math.min(ci + 1, 3)}>
              <SectionTitle>{cropName(c)}</SectionTitle>
              <Card style={styles.list}>
                {[...shown.values()]
                  .filter((g) => g.crop === c)
                  .sort((a, b) => name(a).localeCompare(name(b)))
                  .map((g, i) => (
                    <PressableScale
                      key={g.id}
                      onPress={() => router.push({ pathname: '/guides/[id]', params: { id: g.id } })}
                      accessibilityRole="button"
                      style={[styles.row, i > 0 && styles.divider]}>
                      <View style={styles.flex}>
                        <Text style={styles.rowTitle}>{g.title}</Text>
                        <Text style={styles.meta}>
                          {[
                            g.language !== lang ? t('guides.otherLanguage') : null,
                            g.reviewerName ? t('guides.reviewedShort', { name: g.reviewerName }) : null,
                            t('guides.steps', { count: g.steps.length }),
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </Text>
                      </View>
                      <CaretRightIcon size={20} color={color.stone500} />
                    </PressableScale>
                  ))}
              </Card>
            </Enter>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.stone50 },
  scroll: { paddingHorizontal: space[4], gap: space[4] },
  flex: { flex: 1 },
  head: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  backBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: color.stone100 },
  title: { ...type.title, color: color.ink, flexShrink: 1 },
  body: { ...type.body, color: color.stone600 },
  meta: { ...type.meta, fontFamily: font.regular, color: color.stone600, marginTop: 2 },
  empty: { gap: space[3], alignItems: 'flex-start' },
  list: { paddingVertical: space[1] },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 64, paddingVertical: space[3] },
  divider: { borderTopWidth: 1, borderTopColor: color.stone200 },
  rowTitle: { ...type.bodyEmphasis, color: color.ink },
});
