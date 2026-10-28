import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, BackHandler, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedProps, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/button';
import { ChoiceChip, ChoiceRow } from '@/components/choice';
import { FieldLabel, FieldMessage } from '@/components/fields';
import { CheckIcon, LeafIcon, XIcon } from '@/components/icons';
import { Enter, PressableScale } from '@/components/motion';
import { useAuth } from '@/lib/auth';
import { OUTCOMES, SYMPTOMS, useFarm, type Outcome, type Symptom } from '@/lib/farm-store';
import { CROPS, type Crop } from '@/lib/onboarding';
import { color, font, motion, radius, space, type } from '@/theme/tokens';

type Step = 'capture' | 'preview' | 'context' | 'outcome' | 'checking' | 'saved';
const AnimatedPath = Animated.createAnimatedComponent(Path);

/**
 * Crop check (design.md §7.4): photo, a little context, saved on the phone. The phone never
 * guesses a diagnosis; the check waits for the cloud and, if needed, an agronomist.
 *
 * Opened with `followUp=<check id>` it takes a follow-up photo instead (architecture.md §10): same
 * plant again, then "better, same or worse", and it joins the first check's case.
 */
export default function CheckScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { plots, checks, addCheck, addFollowUp, instantCheck, canSend } = useFarm();
  const params = useLocalSearchParams<{ plot?: string; followUp?: string }>();
  const parent = checks.find((c) => c.id === params.followUp);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  // Opened from a plot page: that plot and its crop come pre-picked.
  const preset = plots.find((p) => p.id === params.plot);
  const [step, setStep] = useState<Step>('capture');
  const [photo, setPhoto] = useState<string | null>(null);
  const [crop, setCrop] = useState<Crop | null>(preset?.crop ?? null);
  const [plotId, setPlotId] = useState<string | null>(preset?.id ?? null);
  const [symptoms, setSymptoms] = useState<Symptom[]>([]);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const saved = checks.find((c) => c.id === savedId);

  // With signal the photo stays on screen while it is sent and checked, then the result opens.
  useEffect(() => {
    if (step === 'checking' && saved?.status === 'done') router.replace({ pathname: '/result/[id]', params: { id: saved.id } });
  }, [step, saved?.status, saved?.id, router]);

  const farmCrops = user?.farm?.crops?.length ? user.farm.crops : CROPS.filter((c) => c !== 'other');
  const cropOptions = Array.from(new Set([...plots.map((p) => p.crop), ...farmCrops]));

  // Android back walks back through the steps before leaving.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (step === 'preview' || step === 'context' || step === 'outcome') {
        setStep(step === 'preview' ? 'capture' : 'preview');
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [step]);

  const pick = async (source: 'camera' | 'gallery') => {
    setCameraError(null);
    const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.6, exif: false };
    if (source === 'camera') {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) return setCameraError(t('check.cameraDenied'));
    }
    const result = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
    if (result.canceled || !result.assets[0]) return;
    setPhoto(result.assets[0].uri);
    setStep('preview');
  };

  const choosePlot = (id: string | null) => {
    setPlotId(id);
    const p = plots.find((x) => x.id === id);
    if (p) setCrop(p.crop);
  };

  const toggleSymptom = (s: Symptom) =>
    setSymptoms((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : cur.length >= 3 ? cur : [...cur, s]));

  const save = () => {
    if (!photo || !crop) return;
    const check = addCheck({ crop, plotId, photoUri: photo, symptoms });
    setSavedId(check.id);
    setStep(instantCheck ? 'checking' : 'saved');
  };

  const saveFollowUp = () => {
    if (!photo || !outcome || !parent) return;
    addFollowUp(parent.id, photo, outcome);
    setStep('saved');
  };

  const reset = () => {
    setPhoto(null);
    setSymptoms([]);
    setOutcome(null);
    setStep('capture');
  };

  const close = () => (router.canGoBack() ? router.back() : router.replace('/home'));
  const tipKeys = parent ? (['followUp.tip1', 'followUp.tip2', 'followUp.tip3'] as const) : (['check.tip1', 'check.tip2', 'check.tip3'] as const);

  if (params.followUp && !parent)
    return (
      <View style={[styles.light, styles.saved, { paddingTop: insets.top + space[6], paddingBottom: insets.bottom + space[4] }]}>
        <View style={styles.savedBody}>
          <Text style={[styles.body, styles.center]}>{t('followUp.notFound')}</Text>
        </View>
        <Button variant="secondary" label={t('common.back')} onPress={close} />
      </View>
    );

  if (step === 'capture')
    return (
      <View style={[styles.dark, { paddingTop: insets.top + space[2], paddingBottom: insets.bottom + space[4] }]}>
        <StatusBar style="light" />
        <CloseButton onPress={close} label={t('common.close')} />
        <View style={styles.flex}>
          <Enter step={0} style={styles.frameWrap}>
            <Viewfinder />
          </Enter>
          <Enter step={1}>
            <Text style={styles.darkTitle} role="heading">
              {parent ? t('followUp.captureTitle') : t('check.capture')}
            </Text>
          </Enter>
          <Enter step={2} style={styles.tips}>
            {tipKeys.map((k) => (
              <View key={k} style={styles.tip}>
                <CheckIcon size={18} color={color.lime} weight="bold" />
                <Text style={styles.tipText}>{t(k)}</Text>
              </View>
            ))}
          </Enter>
        </View>
        <Enter step={3} style={styles.actions}>
          {cameraError ? <Text style={styles.darkError}>{cameraError}</Text> : null}
          <Button variant="onDarkPrimary" label={t('check.takePhoto')} onPress={() => pick('camera')} />
          <Button variant="onDarkSecondary" label={t('check.gallery')} onPress={() => pick('gallery')} />
        </Enter>
      </View>
    );

  if (step === 'preview' && photo)
    return (
      <View style={[styles.dark, { paddingTop: insets.top + space[2], paddingBottom: insets.bottom + space[4] }]}>
        <StatusBar style="light" />
        <CloseButton onPress={close} label={t('common.close')} />
        <Enter step={0} from={0} style={styles.previewWrap}>
          <Image source={{ uri: photo }} style={styles.preview} contentFit="cover" transition={200} accessibilityIgnoresInvertColors />
        </Enter>
        <View style={styles.actions}>
          <Button variant="onDarkPrimary" label={t('check.usePhoto')} onPress={() => setStep(parent ? 'outcome' : 'context')} />
          <Button variant="onDarkSecondary" label={t('check.retake')} onPress={reset} />
        </View>
      </View>
    );

  if (step === 'context' && photo)
    return (
      <View style={[styles.light, { paddingTop: insets.top + space[2] }]}>
        <StatusBar style="dark" />
        <View style={styles.contextHead}>
          <Image source={{ uri: photo }} style={styles.thumb} contentFit="cover" />
          <Text style={styles.lightTitle} role="heading">
            {t('check.title')}
          </Text>
          <CloseButton onPress={close} label={t('common.close')} light />
        </View>
        <ScrollView contentContainerStyle={styles.form} showsVerticalScrollIndicator={false}>
          {plots.length > 0 ? (
            <Enter step={0}>
              <FieldLabel>{t('check.whichPlot')}</FieldLabel>
              <View style={styles.chips} role="radiogroup">
                {plots.map((p) => (
                  <ChoiceChip key={p.id} single label={p.name} selected={plotId === p.id} onPress={() => choosePlot(p.id)} />
                ))}
              </View>
            </Enter>
          ) : null}
          <Enter step={1}>
            <FieldLabel>{t('check.whichCrop')}</FieldLabel>
            <View style={styles.chips} role="radiogroup">
              {cropOptions.map((c) => (
                <ChoiceChip key={c} single label={t(`onboarding.crops.${c}`)} selected={crop === c} onPress={() => setCrop(c)} />
              ))}
            </View>
          </Enter>
          <Enter step={2}>
            <FieldLabel optional={t('common.optional')}>{t('check.whatSee')}</FieldLabel>
            <FieldMessage hint={t('check.whatSeeHint')} />
            <View style={[styles.chips, styles.chipsGap]}>
              {SYMPTOMS.map((s) => (
                <ChoiceChip key={s} label={t(`check.symptoms.${s}`)} selected={symptoms.includes(s)} onPress={() => toggleSymptom(s)} />
              ))}
            </View>
          </Enter>
        </ScrollView>
        <View style={[styles.footer, { paddingBottom: insets.bottom + space[3] }]}>
          <Button label={t('check.save')} onPress={save} disabled={!crop} />
        </View>
      </View>
    );

  if (step === 'outcome' && photo && parent)
    return (
      <View style={[styles.light, { paddingTop: insets.top + space[2] }]}>
        <StatusBar style="dark" />
        <View style={styles.contextHead}>
          <Image source={{ uri: photo }} style={styles.thumb} contentFit="cover" />
          <Text style={styles.lightTitle} role="heading">
            {t('result.sendFollowUp')}
          </Text>
          <CloseButton onPress={close} label={t('common.close')} light />
        </View>
        <ScrollView contentContainerStyle={styles.form} showsVerticalScrollIndicator={false}>
          <Enter step={0}>
            <FieldLabel>{t('followUp.outcomeTitle')}</FieldLabel>
            <FieldMessage hint={t('followUp.outcomeHint')} />
          </Enter>
          <Enter step={1}>
            <View style={styles.rows} role="radiogroup">
              {OUTCOMES.map((o) => (
                <ChoiceRow key={o} label={t(`followUp.outcomes.${o}`)} hint={t(`followUp.outcomeHints.${o}`)} selected={outcome === o} onPress={() => setOutcome(o)} />
              ))}
            </View>
          </Enter>
        </ScrollView>
        <View style={[styles.footer, { paddingBottom: insets.bottom + space[3] }]}>
          <Button label={t('followUp.send')} onPress={saveFollowUp} disabled={!outcome} />
        </View>
      </View>
    );

  if (step === 'checking' && photo)
    return (
      <View style={[styles.dark, { paddingTop: insets.top + space[2], paddingBottom: insets.bottom + space[4] }]}>
        <StatusBar style="light" />
        <View style={styles.previewWrap}>
          <Image source={{ uri: photo }} style={styles.preview} contentFit="cover" accessibilityIgnoresInvertColors />
          <View style={styles.checkingCard}>
            <ActivityIndicator color={color.onForest} />
            <Text style={styles.checkingText} accessibilityLiveRegion="polite">
              {saved?.status === 'checking' ? t('check.checkingLibrary') : t('check.sendingPhoto')}
            </Text>
          </View>
        </View>
        <View style={styles.actions}>
          <Text style={styles.stopHint}>{t('check.stopHint')}</Text>
          <Button variant="onDarkSecondary" label={t('check.stopWaiting')} onPress={close} />
        </View>
      </View>
    );

  return (
    <View style={[styles.light, styles.saved, { paddingTop: insets.top + space[6], paddingBottom: insets.bottom + space[4] }]}>
      <StatusBar style="dark" />
      <View style={styles.savedBody}>
        <SavedMark />
        <Enter step={1} delay={200}>
          <Text style={[styles.lightTitle, styles.center]} role="heading">
            {parent ? t('followUp.savedTitle') : t('check.savedTitle')}
          </Text>
          <Text style={[styles.body, styles.center]}>
            {parent
              ? [parent.reply?.by ? t('followUp.savedBody', { name: parent.reply.by }) : t('followUp.savedBodyNoName'), canSend ? null : t('followUp.savedOffline')].filter(Boolean).join(' ')
              : t('check.savedBody')}
          </Text>
        </Enter>
        {parent ? null : (
          <Enter step={2} delay={200} style={styles.note}>
            <LeafIcon size={20} color={color.forest900} />
            <Text style={styles.noteText}>{t('check.notDiagnosis')}</Text>
          </Enter>
        )}
      </View>
      <Enter step={3} delay={200} style={styles.actions}>
        <Button label={t('check.done')} onPress={close} />
        {parent ? null : <Button variant="secondary" label={t('check.another')} onPress={reset} />}
      </Enter>
    </View>
  );
}

function CloseButton({ onPress, label, light }: { onPress: () => void; label: string; light?: boolean }) {
  return (
    <PressableScale onPress={onPress} accessibilityRole="button" accessibilityLabel={label} scaleTo={0.92} style={[styles.close, light && styles.closeLight]}>
      <XIcon size={22} color={light ? color.ink : color.onForest} weight="bold" />
    </PressableScale>
  );
}

/** Corner brackets that show how close to frame the leaf. */
function Viewfinder() {
  const c = 'rgba(244,241,230,0.85)';
  return (
    <View style={styles.frame}>
      <Svg width="100%" height="100%" viewBox="0 0 200 200" style={StyleSheet.absoluteFill}>
        {['M8 44V8h36', 'M156 8h36v36', 'M192 156v36h-36', 'M44 192H8v-36'].map((d) => (
          <Path key={d} d={d} stroke={c} strokeWidth={4} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        ))}
      </Svg>
      <LeafIcon size={72} color={color.lime} weight="regular" />
    </View>
  );
}

/** Sky disc (waiting, not done) with a tick drawn in over 320 ms. */
function SavedMark() {
  const scale = useSharedValue(0.85);
  const draw = useSharedValue(0);
  useEffect(() => {
    scale.value = withTiming(1, motion.sheet);
    draw.value = withDelay(120, withTiming(1, { duration: 320 }));
  }, [scale, draw]);
  const disc = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }], opacity: scale.value }));
  const tick = useAnimatedProps(() => ({ strokeDashoffset: 40 * (1 - draw.value) }));
  return (
    <Animated.View style={[styles.disc, disc]}>
      <Svg width={44} height={44} viewBox="0 0 24 24">
        <AnimatedPath d="M5 12.5l4.5 4.5L19 7.5" stroke={color.sky700} strokeWidth={2.6} fill="none" strokeLinecap="round" strokeLinejoin="round" strokeDasharray={40} animatedProps={tick} />
      </Svg>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, justifyContent: 'center' },
  dark: { flex: 1, backgroundColor: color.forest950, paddingHorizontal: space[4] },
  light: { flex: 1, backgroundColor: color.stone50 },
  close: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(244,241,230,0.12)' },
  closeLight: { backgroundColor: color.stone100 },
  frameWrap: { alignItems: 'center', marginBottom: space[6] },
  frame: { width: 200, height: 200, alignItems: 'center', justifyContent: 'center' },
  darkTitle: { ...type.title, color: color.onForest, textAlign: 'center' },
  tips: { gap: space[3], marginTop: space[5], alignSelf: 'center' },
  tip: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  tipText: { ...type.body, color: 'rgba(244,241,230,0.85)' },
  darkError: { ...type.meta, color: color.onForest, backgroundColor: 'rgba(180,35,24,0.35)', padding: space[3], borderRadius: radius.sm },
  actions: { gap: space[3] },
  checkingCard: {
    position: 'absolute',
    left: space[3],
    right: space[3],
    bottom: space[3],
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    padding: space[4],
    borderRadius: radius.md,
    backgroundColor: 'rgba(11,46,28,0.88)',
  },
  checkingText: { ...type.body, color: color.onForest, flex: 1 },
  stopHint: { ...type.meta, fontFamily: font.regular, color: 'rgba(244,241,230,0.78)', textAlign: 'center' },
  previewWrap: { flex: 1, marginVertical: space[4], borderRadius: radius.md, overflow: 'hidden' },
  preview: { flex: 1, backgroundColor: color.forest900 },
  contextHead: { flexDirection: 'row', alignItems: 'center', gap: space[3], paddingHorizontal: space[4], paddingBottom: space[3] },
  thumb: { width: 48, height: 48, borderRadius: radius.sm, backgroundColor: color.stone200 },
  lightTitle: { ...type.title, color: color.ink, flex: 1 },
  form: { paddingHorizontal: space[4], paddingBottom: space[6], gap: space[5] },
  chips: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: space[2] },
  chipsGap: { marginTop: space[2] },
  rows: { gap: space[3] },
  footer: { paddingHorizontal: space[4], paddingTop: space[3], borderTopWidth: 1, borderTopColor: color.stone200, backgroundColor: color.stone50 },
  saved: { paddingHorizontal: space[4] },
  savedBody: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: space[4] },
  disc: { width: 96, height: 96, borderRadius: 48, backgroundColor: '#EAF2F7', alignItems: 'center', justifyContent: 'center' },
  center: { textAlign: 'center', flex: 0 },
  body: { ...type.body, color: color.stone600, marginTop: space[2] },
  note: {
    flexDirection: 'row',
    gap: space[3],
    padding: space[4],
    borderRadius: radius.md,
    backgroundColor: color.forest50,
    alignItems: 'flex-start',
  },
  noteText: { ...type.meta, fontFamily: font.regular, color: color.forest900, flex: 1 },
});
