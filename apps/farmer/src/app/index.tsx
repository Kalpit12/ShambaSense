import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { BrandMark, LockupOnDark } from '@/components/brand';
import { Button } from '@/components/button';
import { FieldScrim } from '@/components/field-background';
import { SlideBackgrounds, SlideCaptions, useSlideshow } from '@/components/hero-slideshow';
import { LanguageTiles } from '@/components/language-tiles';
import { Enter } from '@/components/motion';
import { color, font, motion, space, type } from '@/theme/tokens';

// Splash hold: native splash + this screen's first frame together stay under 1 s (design.md §8.1).
const SPLASH_HOLD_MS = 550;

export default function StartScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const reduced = useReducedMotion();
  const [revealed, setRevealed] = useState(false);
  const splash = useSharedValue(1);
  const slides = useSlideshow();

  useEffect(() => {
    // The forest splash layer lifts away and the photo screen rises in underneath. The mark itself
    // never animates its bands; it only fades with its layer.
    splash.value = withDelay(SPLASH_HOLD_MS, withTiming(0, motion.sheet));
    const timer = setTimeout(() => setRevealed(true), SPLASH_HOLD_MS);
    return () => clearTimeout(timer);
  }, [splash]);

  const splashStyle = useAnimatedStyle(() => ({
    opacity: splash.value,
    transform: [{ scale: reduced ? 1 : 1 + (1 - splash.value) * 0.04 }],
  }));

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <SlideBackgrounds index={slides.index} />
      <FieldScrim />

      {revealed ? (
        <View style={[styles.content, { paddingTop: insets.top + space[5], paddingBottom: insets.bottom + space[5] }]}>
          <Enter step={0}>
            <LockupOnDark height={34} />
          </Enter>

          <View style={styles.spacer} />

          <Enter step={1}>
            <SlideCaptions index={slides.index} onChange={slides.setIndex} count={slides.count} />
          </Enter>

          <Enter step={2} style={styles.block}>
            <Text style={styles.overline}>{t('start.chooseLanguage')}</Text>
            <LanguageTiles />
          </Enter>

          <Enter step={3} style={styles.actions}>
            <Button variant="onDarkPrimary" label={t('start.createAccount')} onPress={() => router.push('/sign-up')} />
            <Button variant="onDarkSecondary" label={t('start.signIn')} onPress={() => router.push('/sign-in')} />
            <Text style={styles.terms}>{t('start.terms')}</Text>
          </Enter>
        </View>
      ) : null}

      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.splash, splashStyle]}>
        <BrandMark size={112} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.forest900 },
  splash: { backgroundColor: color.forest900, alignItems: 'center', justifyContent: 'center' },
  content: { flex: 1, paddingHorizontal: space[4], maxWidth: 560, width: '100%', alignSelf: 'center' },
  spacer: { flex: 1, minHeight: space[6] },
  block: { marginTop: space[5] },
  overline: { ...type.label, color: color.onForest, opacity: 0.85, marginBottom: space[3] },
  actions: { marginTop: space[5], gap: space[3] },
  terms: { ...type.meta, fontFamily: font.regular, color: color.onForest, opacity: 0.8, textAlign: 'center', marginTop: space[1] },
});
