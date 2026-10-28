import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/button';
import { CaretLeftIcon, ShieldCheckIcon, WarningIcon } from '@/components/icons';
import { Enter, PressableScale } from '@/components/motion';
import { Card } from '@/components/screen';
import { formatDate } from '@/lib/dates';
import { useGuides } from '@/lib/guides';
import { color, font, radius, space, type } from '@/theme/tokens';

/** One crop guide: numbered steps, when to ask an agronomist, and who reviewed it. */
export default function GuideScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { guides } = useGuides();
  const g = guides.find((x) => x.id === id);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/guides'));

  if (!g)
    return (
      <View style={[styles.root, styles.missing]}>
        <Text style={styles.body}>{t('guides.notFound')}</Text>
        <Button variant="secondary" label={t('common.back')} onPress={back} />
      </View>
    );

  const other = guides.find((x) => x.causeId === g.causeId && x.language !== g.language);
  const lang = g.language;
  const crop = g.crop === 'any' ? t('guides.anyCrop') : t(`onboarding.crops.${g.crop}`, { defaultValue: g.crop });

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={[styles.scroll, { paddingTop: insets.top + space[3], paddingBottom: insets.bottom + space[6] }]} showsVerticalScrollIndicator={false}>
        <Enter step={0} style={styles.head}>
          <PressableScale onPress={back} accessibilityRole="button" accessibilityLabel={t('common.back')} scaleTo={0.92} style={styles.backBtn}>
            <CaretLeftIcon size={22} color={color.ink} weight="bold" />
          </PressableScale>
          <Text style={styles.meta}>{crop}</Text>
        </Enter>
        <Enter step={0}>
          <Text style={styles.title} role="heading">
            {g.title}
          </Text>
          {(lang === 'sw' ? g.causeName.sw : g.causeName.en) !== g.title ? <Text style={styles.meta}>{lang === 'sw' ? g.causeName.sw : g.causeName.en}</Text> : null}
        </Enter>

        <Enter step={1}>
          <Card style={styles.steps}>
            {g.steps.map((s, i) => (
              <View key={i} style={styles.step}>
                <View style={styles.stepNum}>
                  <Text style={styles.stepNumText}>{i + 1}</Text>
                </View>
                <Text style={[styles.body, styles.flex, styles.ink]}>{s}</Text>
              </View>
            ))}
          </Card>
        </Enter>

        {g.warning ? (
          <Enter step={2} style={styles.warn}>
            <WarningIcon size={24} color={color.amber800} weight="fill" />
            <View style={styles.flex}>
              <Text style={styles.warnTitle}>{t('guides.askWhen')}</Text>
              <Text style={[styles.body, styles.ink]}>{g.warning}</Text>
            </View>
          </Enter>
        ) : null}

        <Enter step={2} style={styles.source}>
          <ShieldCheckIcon size={22} color={g.preview ? color.stone600 : color.forest900} />
          <View style={styles.flex}>
            {g.preview ? (
              <Text style={styles.meta}>{t('result.guidePreview')}</Text>
            ) : (
              <>
                {g.reviewerName && g.reviewedOn ? <Text style={styles.sourceText}>{t('guides.reviewed', { name: g.reviewerName, date: formatDate(g.reviewedOn, i18n.language) })}</Text> : null}
                <Text style={styles.meta}>{[g.coopName ? t('guides.from', { coop: g.coopName }) : null, t('guides.version', { version: g.version })].filter(Boolean).join(' · ')}</Text>
              </>
            )}
          </View>
        </Enter>

        <Enter step={3} style={styles.actions}>
          {other ? <Button variant="secondary" label={t(g.language === 'sw' ? 'guides.readEnglish' : 'guides.readKiswahili')} onPress={() => router.replace({ pathname: '/guides/[id]', params: { id: other.id } })} /> : null}
          <Button variant="text" label={t('guides.check')} onPress={() => router.push('/check')} />
        </Enter>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.stone50 },
  missing: { justifyContent: 'center', padding: space[5], gap: space[4] },
  scroll: { paddingHorizontal: space[4], gap: space[4] },
  flex: { flex: 1 },
  ink: { color: color.ink },
  head: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  backBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: color.stone100 },
  title: { ...type.display, color: color.ink },
  meta: { ...type.meta, fontFamily: font.regular, color: color.stone600 },
  body: { ...type.body, color: color.stone600 },
  steps: { gap: space[4] },
  step: { flexDirection: 'row', gap: space[3], alignItems: 'flex-start' },
  stepNum: { width: 28, height: 28, borderRadius: 14, backgroundColor: color.forest50, alignItems: 'center', justifyContent: 'center' },
  stepNumText: { fontFamily: font.semibold, fontSize: 14, lineHeight: 18, color: color.forest900 },
  warn: { flexDirection: 'row', gap: space[3], padding: space[4], borderRadius: radius.md, backgroundColor: color.amber50, alignItems: 'flex-start' },
  warnTitle: { ...type.bodyEmphasis, fontSize: 16, lineHeight: 22, color: color.amber800 },
  source: { flexDirection: 'row', gap: space[3], alignItems: 'flex-start' },
  sourceText: { ...type.meta, color: color.ink },
  actions: { gap: space[2] },
});
