import { useRouter, type Href } from 'expo-router';
import type { ComponentType } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { CameraIcon, CheckIcon, NotebookIcon, PlantIcon, StorefrontIcon, WifiSlashIcon } from '@/components/icons';
import { PressableScale } from '@/components/motion';
import { Card, SectionTitle } from '@/components/screen';
import { START_STEPS, type StartStep } from '@/lib/start-guide';
import { color, font, radius, space, type } from '@/theme/tokens';

type IconProps = { size?: number; color?: string; weight?: 'regular' | 'fill' | 'bold' };

const ICON: Record<StartStep, ComponentType<IconProps>> = { plot: PlantIcon, check: CameraIcon, record: NotebookIcon, coop: StorefrontIcon };
const HREF: Record<StartStep, Href> = { plot: '/shamba?add=1', check: '/check', record: '/journal?add=1', coop: '/profile' };

/** First-week guide on Home: four steps that tick themselves off, and a reminder that signal can wait. */
export function StartCard({ done, onHide }: { done: Record<StartStep, boolean>; onHide: () => void }) {
  const { t } = useTranslation();
  const router = useRouter();
  const count = START_STEPS.filter((s) => done[s]).length;

  return (
    <View>
      <SectionTitle
        action={
          <PressableScale onPress={onHide} accessibilityRole="button" accessibilityLabel={t('startHere.hideHint')} style={styles.hide}>
            <Text style={styles.hideText}>{t('startHere.hide')}</Text>
          </PressableScale>
        }>
        {t('startHere.title')}
      </SectionTitle>
      <Card style={styles.card}>
        <View style={styles.progressRow}>
          <Text style={styles.progressText}>{t('startHere.progress', { done: count, total: START_STEPS.length })}</Text>
          <View style={styles.bar} accessible={false}>
            <View style={[styles.fill, { width: `${(count / START_STEPS.length) * 100}%` }]} />
          </View>
        </View>
        {START_STEPS.map((s, i) => {
          const Icon = ICON[s];
          const ok = done[s];
          return (
            <PressableScale
              key={s}
              onPress={() => router.push(HREF[s])}
              accessibilityRole="button"
              accessibilityState={{ checked: ok }}
              accessibilityLabel={`${t(`startHere.steps.${s}.title`)}. ${ok ? t('startHere.done') : t(`startHere.steps.${s}.hint`)}`}
              style={[styles.step, i > 0 && styles.divider]}>
              <View style={[styles.icon, ok && styles.iconDone]}>
                {ok ? <CheckIcon size={20} color={color.onForest} weight="bold" /> : <Icon size={20} color={color.forest900} />}
              </View>
              <View style={styles.flex}>
                <Text style={[styles.stepTitle, ok && styles.stepTitleDone]}>{t(`startHere.steps.${s}.title`)}</Text>
                {ok ? null : <Text style={styles.stepHint}>{t(`startHere.steps.${s}.hint`)}</Text>}
              </View>
            </PressableScale>
          );
        })}
        <View style={styles.offline}>
          <WifiSlashIcon size={18} color={color.stone600} />
          <Text style={styles.offlineText}>{t('startHere.offline')}</Text>
        </View>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { paddingVertical: space[2] },
  flex: { flex: 1 },
  hide: { minHeight: 48, justifyContent: 'center', paddingHorizontal: space[1] },
  hideText: { ...type.meta, fontFamily: font.semibold, color: color.stone600, textDecorationLine: 'underline' },
  progressRow: { gap: space[2], paddingVertical: space[2] },
  progressText: { ...type.meta, color: color.stone600 },
  bar: { height: 6, borderRadius: radius.full, backgroundColor: color.stone100, overflow: 'hidden' },
  fill: { height: 6, borderRadius: radius.full, backgroundColor: color.forest900 },
  step: { flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 64, paddingVertical: space[2] },
  divider: { borderTopWidth: 1, borderTopColor: color.stone200 },
  icon: { width: 40, height: 40, borderRadius: 20, backgroundColor: color.forest50, alignItems: 'center', justifyContent: 'center' },
  iconDone: { backgroundColor: color.forest900 },
  stepTitle: { ...type.bodyEmphasis, color: color.ink },
  stepTitleDone: { color: color.stone500, textDecorationLine: 'line-through' },
  stepHint: { ...type.meta, fontFamily: font.regular, color: color.stone600 },
  offline: { flexDirection: 'row', alignItems: 'flex-start', gap: space[2], marginTop: space[2], padding: space[3], borderRadius: radius.sm, backgroundColor: color.stone50 },
  offlineText: { ...type.meta, fontFamily: font.regular, color: color.stone600, flex: 1 },
});
