import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedProps, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';
import { useTranslation } from 'react-i18next';

import type { FarmAnswers } from '@/lib/onboarding';
import { color, font, space, type } from '@/theme/tokens';
import { Button } from './button';
import { Enter } from './motion';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const CHECK_LENGTH = 40;

/** Closing screen: a forest disc whose check draws itself, then what was saved, then one button. */
export function OnboardingDone({ answers, name, onFinish }: { answers: FarmAnswers; name: string; onFinish: () => void }) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const disc = useSharedValue(reduced ? 1 : 0);
  const draw = useSharedValue(reduced ? 1 : 0);

  useEffect(() => {
    if (reduced) return;
    disc.value = withTiming(1, { duration: 240, easing: Easing.bezier(0.2, 0.8, 0.2, 1) });
    draw.value = withDelay(160, withTiming(1, { duration: 320, easing: Easing.out(Easing.quad) }));
  }, [reduced, disc, draw]);

  const discStyle = useAnimatedStyle(() => ({ opacity: 0.4 + 0.6 * disc.value, transform: [{ scale: 0.92 + 0.08 * disc.value }] }));
  const checkProps = useAnimatedProps(() => ({ strokeDashoffset: CHECK_LENGTH * (1 - draw.value) }));

  const rows: [string, string][] = [
    [t('onboarding.done.crops'), answers.crops.map((c) => t(`onboarding.crops.${c}`)).join(', ')],
    [t('onboarding.done.size'), `${t(`onboarding.size.${answers.size}`)} · ${t(`onboarding.plots.${answers.plots}`)}`],
    [t('onboarding.done.place'), [answers.farmName, answers.ward, answers.county].filter(Boolean).join(' · ')],
    [t('onboarding.done.water'), t(`onboarding.water.${answers.water}`)],
    [t('onboarding.done.animals'), answers.livestock.map((l) => t(`onboarding.livestock.${l}`)).join(', ')],
    [t('onboarding.done.group'), answers.coop === null ? '' : answers.coop ? answers.coopName || t('onboarding.coop.yes') : t('onboarding.coop.no')],
  ];
  // Skipped questions are left out of the summary; age and gender are never echoed back.
  const shown = rows.filter(([, value]) => value);

  return (
    <View style={[styles.root, { paddingTop: insets.top + space[7], paddingBottom: insets.bottom + space[4] }]}>
      <StatusBar style="dark" />
      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
        <Animated.View style={[styles.disc, discStyle]}>
          <Svg width={88} height={88} viewBox="0 0 88 88">
            <Circle cx={44} cy={44} r={44} fill={color.forest900} />
            <AnimatedPath
              d="M28 45l11 11 22-24"
              stroke={color.onForest}
              strokeWidth={6}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={CHECK_LENGTH}
              animatedProps={checkProps}
            />
          </Svg>
        </Animated.View>

        <Enter step={1} delay={200}>
          <Text style={styles.title} role="heading">
            {t('onboarding.done.title')}
          </Text>
          <Text style={styles.subtitle}>{t('onboarding.done.subtitle', { name: name.split(' ')[0] })}</Text>
        </Enter>

        <Enter step={2} delay={200} style={styles.summary}>
          {shown.map(([label, value], i) => (
            <View key={label} style={[styles.row, i > 0 && styles.rowDivider]}>
              <Text style={styles.rowLabel}>{label}</Text>
              <Text style={styles.rowValue}>{value}</Text>
            </View>
          ))}
        </Enter>
      </ScrollView>

      <Enter step={3} delay={200}>
        <Button label={t('onboarding.done.go')} onPress={onFinish} />
      </Enter>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.stone50, paddingHorizontal: space[4], maxWidth: 560, width: '100%', alignSelf: 'center' },
  body: { flex: 1 },
  bodyContent: { paddingBottom: space[5] },
  disc: { width: 88, height: 88, marginBottom: space[5] },
  title: { ...type.display, color: color.ink },
  subtitle: { ...type.body, color: color.stone600, marginTop: space[2] },
  summary: {
    marginTop: space[5],
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: color.stone200,
  },
  row: { flexDirection: 'row', gap: space[4], paddingVertical: space[3] },
  rowDivider: { borderTopWidth: 1, borderTopColor: color.stone200 },
  rowLabel: { ...type.meta, color: color.stone600, width: 76, paddingTop: 3 },
  rowValue: { ...type.body, fontFamily: font.medium, color: color.ink, flex: 1 },
});
