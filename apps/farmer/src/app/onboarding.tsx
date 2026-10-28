import { Image } from 'expo-image';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState, type ReactNode } from 'react';
import { BackHandler, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/button';
import { ChoiceChip, ChoiceRow } from '@/components/choice';
import { CountyPicker } from '@/components/county-picker';
import { FIELD_PHOTOS, FieldScrim } from '@/components/field-background';
import { FieldLabel, FieldMessage, TextField } from '@/components/fields';
import { PressableScale } from '@/components/motion';
import { useAuth } from '@/lib/auth';
import { AGES, CROPS, FARM_SIZES, GENDERS, GOALS, LIVESTOCK, PLOTS, WATER, type FarmAnswers, type Livestock } from '@/lib/onboarding';
import { OnboardingDone } from '@/components/onboarding-done';
import { color, font, motion, radius, space, touch, type } from '@/theme/tokens';

// Required first, then the skippable ones; the personal question comes last.
const STEPS = ['crops', 'size', 'plots', 'place', 'water', 'livestock', 'coop', 'goals', 'about'] as const;
type Step = (typeof STEPS)[number];
const OPTIONAL: Step[] = ['water', 'livestock', 'coop', 'goals', 'about'];
// Header photo per question, alternating so the band changes with each step. The farmer photo is
// left out: a short band would only show his shirt.
const STEP_PHOTO: Record<Step, number> = { crops: 1, size: 2, plots: 1, place: 2, water: 1, livestock: 2, coop: 1, goals: 2, about: 1 };
// Where each photo sits in the band: the seedling's leaves are in its upper third.
const PHOTO_POSITION = ['center', { top: '24%' }, 'center'] as const;

export default function OnboardingScreen() {
  const { t } = useTranslation();
  const { user, completeOnboarding, finishOnboarding } = useAuth();
  const insets = useSafeAreaInsets();

  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Partial<FarmAnswers>>({
    crops: [],
    goals: [],
    livestock: [],
    coop: null,
    coopName: '',
    county: user?.county,
    farmName: user?.name ? t('onboarding.place.defaultName', { name: user.name.split(' ')[0] }) : '',
    ward: '',
  });
  const [nameError, setNameError] = useState<string | null>(null);

  const key = STEPS[step];
  const set = (patch: Partial<FarmAnswers>) => setAnswers((a) => ({ ...a, ...patch }));
  const toggle = <T extends string>(list: T[] | undefined, v: T) => (list?.includes(v) ? list.filter((x) => x !== v) : [...(list ?? []), v]);

  const canContinue =
    (key === 'crops' && (answers.crops?.length ?? 0) > 0) ||
    (key === 'size' && !!answers.size) ||
    (key === 'plots' && !!answers.plots) ||
    (key === 'livestock' && (answers.livestock?.length ?? 0) > 0) ||
    (key === 'coop' && answers.coop !== null && answers.coop !== undefined) ||
    (key === 'about' && (!!answers.age || !!answers.gender)) ||
    (key === 'place' && !!answers.county) ||
    (key === 'water' && !!answers.water) ||
    (key === 'goals' && (answers.goals?.length ?? 0) > 0);
  const optional = OPTIONAL.includes(key);

  function go(delta: 1 | -1) {
    setDirection(delta);
    setStep((s) => Math.max(0, Math.min(STEPS.length - 1, s + delta)));
  }

  // Android back steps through the questions instead of leaving the app.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (step > 0 && !done) {
        go(-1);
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [step, done]);

  async function next() {
    if (key === 'place' && !answers.farmName?.trim()) return setNameError(t('onboarding.place.nameRequired'));
    if (step < STEPS.length - 1) return go(1);
    setSaving(true);
    setError(null);
    const final: FarmAnswers = {
      crops: answers.crops ?? [],
      size: answers.size ?? 'notSure',
      plots: answers.plots ?? 'one',
      livestock: answers.livestock ?? [],
      coop: answers.coop ?? null,
      coopName: answers.coopName?.trim() ?? '',
      age: answers.age ?? 'skip',
      gender: answers.gender ?? 'skip',
      farmName: answers.farmName!.trim(),
      county: answers.county!,
      ward: answers.ward?.trim() ?? '',
      water: answers.water ?? 'rain',
      goals: answers.goals ?? [],
    };
    const result = await completeOnboarding(final);
    setSaving(false);
    if (result) return setError(t('onboarding.saveError'));
    setAnswers(final);
    setDone(true);
  }

  if (done) {
    return <OnboardingDone answers={answers as FarmAnswers} name={user?.name ?? ''} onFinish={finishOnboarding} />;
  }

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <Header step={step} insetTop={insets.top} onBack={step > 0 ? () => go(-1) : undefined} label={t('onboarding.stepOf', { n: step + 1, total: STEPS.length })} />

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <StepEnter key={key} direction={direction}>
            <Text style={styles.title} role="heading">
              {t(`onboarding.${key}.title`)}
            </Text>
            <Text style={styles.subtitle}>{t(`onboarding.${key}.subtitle`)}</Text>

            <View style={styles.options}>
              {key === 'crops' ? (
                <View style={styles.grid}>
                  {CROPS.map((c) => (
                    <ChoiceChip key={c} label={t(`onboarding.crops.${c}`)} selected={!!answers.crops?.includes(c)} onPress={() => set({ crops: toggle(answers.crops, c) })} />
                  ))}
                </View>
              ) : null}

              {key === 'size' ? (
                <>
                  {FARM_SIZES.map((s) => (
                    <ChoiceRow key={s} label={t(`onboarding.size.${s}`)} selected={answers.size === s} onPress={() => set({ size: s })} />
                  ))}
                  <Text style={styles.hint}>{t('onboarding.size.hint')}</Text>
                </>
              ) : null}

              {key === 'plots'
                ? PLOTS.map((p) => <ChoiceRow key={p} label={t(`onboarding.plots.${p}`)} selected={answers.plots === p} onPress={() => set({ plots: p })} />)
                : null}

              {key === 'livestock' ? (
                <View style={styles.grid}>
                  {LIVESTOCK.map((l) => (
                    <ChoiceChip
                      key={l}
                      label={t(`onboarding.livestock.${l}`)}
                      selected={!!answers.livestock?.includes(l)}
                      onPress={() => set({ livestock: toggleLivestock(answers.livestock ?? [], l) })}
                    />
                  ))}
                </View>
              ) : null}

              {key === 'coop' ? (
                <>
                  <ChoiceRow label={t('onboarding.coop.yes')} hint={t('onboarding.coop.yesHint')} selected={answers.coop === true} onPress={() => set({ coop: true })} />
                  <ChoiceRow label={t('onboarding.coop.no')} hint={t('onboarding.coop.noHint')} selected={answers.coop === false} onPress={() => set({ coop: false })} />
                  {answers.coop ? (
                    <StepEnter direction={1}>
                      <View style={styles.reveal}>
                        <FieldLabel optional={t('common.optional')}>{t('onboarding.coop.nameLabel')}</FieldLabel>
                        <TextField
                          value={answers.coopName}
                          onChangeText={(v) => set({ coopName: v })}
                          placeholder={t('onboarding.coop.namePlaceholder')}
                          accessibilityLabel={t('onboarding.coop.nameLabel')}
                          autoCapitalize="words"
                          maxLength={80}
                        />
                      </View>
                    </StepEnter>
                  ) : null}
                </>
              ) : null}

              {key === 'about' ? (
                <View style={styles.form}>
                  <View>
                    <Text style={styles.groupLabel}>{t('onboarding.about.age')}</Text>
                    <View style={styles.grid} role="radiogroup">
                      {AGES.map((a) => (
                        <ChoiceChip key={a} single label={t(`onboarding.about.${a}`)} selected={answers.age === a} onPress={() => set({ age: a })} />
                      ))}
                    </View>
                  </View>
                  <View>
                    <Text style={styles.groupLabel}>{t('onboarding.about.gender')}</Text>
                    <View style={styles.grid} role="radiogroup">
                      {GENDERS.map((g) => (
                        <ChoiceChip key={g} single label={t(`onboarding.about.${g}`)} selected={answers.gender === g} onPress={() => set({ gender: g })} />
                      ))}
                    </View>
                  </View>
                </View>
              ) : null}

              {key === 'place' ? (
                <View style={styles.form}>
                  <View>
                    <FieldLabel>{t('onboarding.place.nameLabel')}</FieldLabel>
                    <TextField
                      value={answers.farmName}
                      onChangeText={(v) => {
                        set({ farmName: v });
                        setNameError(null);
                      }}
                      placeholder={t('onboarding.place.namePlaceholder')}
                      accessibilityLabel={t('onboarding.place.nameLabel')}
                      autoCapitalize="words"
                      maxLength={50}
                      invalid={!!nameError}
                    />
                    <FieldMessage error={nameError} />
                  </View>
                  <View>
                    <FieldLabel>{t('signUp.countyLabel')}</FieldLabel>
                    <CountyPicker
                      value={answers.county ?? null}
                      onChange={(c) => set({ county: c })}
                      label={t('signUp.countyLabel')}
                      placeholder={t('signUp.countyPlaceholder')}
                      searchLabel={t('signUp.countySearch')}
                    />
                  </View>
                  <View>
                    <FieldLabel optional={t('common.optional')}>{t('onboarding.place.wardLabel')}</FieldLabel>
                    <TextField
                      value={answers.ward}
                      onChangeText={(v) => set({ ward: v })}
                      placeholder={t('onboarding.place.wardPlaceholder')}
                      accessibilityLabel={t('onboarding.place.wardLabel')}
                      autoCapitalize="words"
                      maxLength={60}
                    />
                  </View>
                </View>
              ) : null}

              {key === 'water'
                ? WATER.map((w) => (
                    <ChoiceRow key={w} label={t(`onboarding.water.${w}`)} hint={t(`onboarding.water.${w}Hint`)} selected={answers.water === w} onPress={() => set({ water: w })} />
                  ))
                : null}

              {key === 'goals'
                ? GOALS.map((g) => (
                    <ChoiceRow
                      key={g}
                      multi
                      label={t(`onboarding.goals.${g}`)}
                      hint={t(`onboarding.goals.${g}Hint`)}
                      selected={!!answers.goals?.includes(g)}
                      onPress={() => set({ goals: toggle(answers.goals, g) })}
                    />
                  ))
                : null}
            </View>
          </StepEnter>
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: insets.bottom + space[4] }]}>
          <FieldMessage error={error} />
          <Button
            label={step === STEPS.length - 1 ? t('onboarding.finish') : t('common.continue')}
            onPress={next}
            disabled={!canContinue}
            loading={saving}
          />
          {optional ? (
            <Button
              variant="text"
              label={t('onboarding.skip')}
              onPress={() => {
                if (key === 'goals') set({ goals: [] });
                if (key === 'livestock') set({ livestock: [] });
                if (key === 'coop') set({ coop: null });
                if (key === 'about') set({ age: undefined, gender: undefined });
                if (step < STEPS.length - 1) go(1);
                else next();
              }}
            />
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

/** "No animals" clears the others, and picking an animal clears "No animals". */
function toggleLivestock(list: Livestock[], v: Livestock): Livestock[] {
  if (v === 'none') return list.includes('none') ? [] : ['none'];
  const rest = list.filter((x) => x !== 'none');
  return rest.includes(v) ? rest.filter((x) => x !== v) : [...rest, v];
}

/** Short photo band with back, "Question n of 5" and a segmented progress bar. */
function Header({ step, insetTop, onBack, label }: { step: number; insetTop: number; onBack?: () => void; label: string }) {
  const { t } = useTranslation();
  return (
    <View style={[styles.header, { paddingTop: insetTop + space[2] }]}>
      {FIELD_PHOTOS.map((src, i) => (
        <PhotoLayer key={i} source={src} position={PHOTO_POSITION[i]} active={STEP_PHOTO[STEPS[step]] === i} />
      ))}
      <FieldScrim strength="soft" />
      <View style={styles.headerRow}>
        {onBack ? (
          <PressableScale onPress={onBack} accessibilityRole="button" accessibilityLabel={t('common.back')} scaleTo={0.94} style={styles.back}>
            <Text style={styles.backArrow}>←</Text>
          </PressableScale>
        ) : (
          <View style={styles.back} />
        )}
        <Text style={styles.stepLabel}>{label}</Text>
        <View style={styles.back} />
      </View>
      <View style={styles.progress} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: STEPS.length, now: step + 1 }}>
        {STEPS.map((s, i) => (
          <Segment key={s} filled={i <= step} />
        ))}
      </View>
    </View>
  );
}

function PhotoLayer({ source, active, position }: { source: number; active: boolean; position: (typeof PHOTO_POSITION)[number] }) {
  const opacity = useSharedValue(active ? 1 : 0);
  useEffect(() => {
    opacity.value = withTiming(active ? 1 : 0, { duration: 400, easing: Easing.inOut(Easing.quad) });
  }, [active, opacity]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <Animated.View style={[StyleSheet.absoluteFill, style]}>
      <Image source={source} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition={position} transition={0} />
    </Animated.View>
  );
}

function Segment({ filled }: { filled: boolean }) {
  const fill = useSharedValue(filled ? 1 : 0);
  useEffect(() => {
    fill.value = withTiming(filled ? 1 : 0, motion.sheet);
  }, [filled, fill]);
  const style = useAnimatedStyle(() => ({ width: `${fill.value * 100}%` }));
  return (
    <View style={styles.segment}>
      <Animated.View style={[styles.segmentFill, style]} />
    </View>
  );
}

/** Each question slides 16 px in from the side it came from and fades up (240 ms). */
function StepEnter({ children, direction }: { children: ReactNode; direction: 1 | -1 }) {
  const reduced = useReducedMotion();
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withTiming(1, motion.sheet);
  }, [p]);
  const style = useAnimatedStyle(() => ({
    opacity: 0.2 + 0.8 * p.value,
    transform: [{ translateX: reduced ? 0 : (1 - p.value) * 16 * direction }],
  }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.stone50 },
  flex: { flex: 1 },
  header: { backgroundColor: color.forest900, overflow: 'hidden', paddingBottom: space[5], paddingHorizontal: space[2] },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  back: { width: touch.min, height: touch.min, alignItems: 'center', justifyContent: 'center', borderRadius: radius.full },
  backArrow: { fontSize: 26, lineHeight: 30, color: color.onForest, fontFamily: font.medium },
  stepLabel: { ...type.meta, color: color.onForest, fontVariant: ['tabular-nums'] },
  progress: { flexDirection: 'row', gap: 6, paddingHorizontal: space[2], marginTop: space[7] },
  segment: { flex: 1, height: 6, borderRadius: 3, backgroundColor: 'rgba(244,241,230,0.3)', overflow: 'hidden' },
  segmentFill: { height: '100%', borderRadius: 3, backgroundColor: color.onForest },
  content: { paddingHorizontal: space[4], paddingTop: space[5], paddingBottom: space[5], maxWidth: 560, width: '100%', alignSelf: 'center' },
  title: { ...type.display, color: color.ink },
  subtitle: { ...type.body, color: color.stone600, marginTop: space[2] },
  options: { marginTop: space[5], gap: space[3] },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: space[3] },
  form: { gap: space[5] },
  reveal: { marginTop: space[2] },
  groupLabel: { ...type.label, color: color.stone600, marginBottom: space[3] },
  hint: { ...type.meta, fontFamily: font.regular, color: color.stone600, marginTop: space[1] },
  footer: {
    paddingHorizontal: space[4],
    paddingTop: space[3],
    gap: space[1],
    backgroundColor: color.stone50,
    borderTopWidth: 1,
    borderTopColor: color.stone200,
    maxWidth: 560,
    width: '100%',
    alignSelf: 'center',
  },
});
