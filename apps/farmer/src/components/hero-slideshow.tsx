import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';

import { color, font, space, type } from '@/theme/tokens';
import { FIELD_PHOTOS } from './field-background';

// Start-screen slideshow: three lines, each on its own farm background. Kalpit asked for a live,
// minimal background here, so this screen goes past design.md §5.6 on purpose: a slow drift
// (transform only, cheap on low-end GPUs) and a 700 ms crossfade. Reduced motion stops both.
const SLIDES = ['s1', 's2', 's3'] as const;
const SLIDE_MS = 5500;
const CROSSFADE_MS = 700;
const DRIFT_MS = 16000;

export function useSlideshow() {
  const [index, setIndex] = useState(0);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (reduced) return;
    // Restarts after every change, so a manual swipe gets a full slide's time.
    const id = setTimeout(() => setIndex((i) => (i + 1) % SLIDES.length), SLIDE_MS);
    return () => clearTimeout(id);
  }, [index, reduced]);
  return { index, setIndex, count: SLIDES.length };
}

export function SlideBackgrounds({ index }: { index: number }) {
  return (
    <View style={StyleSheet.absoluteFill} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {FIELD_PHOTOS.map((src, i) => (
        <BackgroundLayer key={i} source={src} active={i === index} direction={i % 2 === 0 ? 1 : -1} />
      ))}
    </View>
  );
}

function BackgroundLayer({ source, active, direction }: { source: number; active: boolean; direction: 1 | -1 }) {
  const reduced = useReducedMotion();
  const opacity = useSharedValue(active ? 1 : 0);
  const drift = useSharedValue(0);

  useEffect(() => {
    opacity.value = withTiming(active ? 1 : 0, { duration: reduced ? 0 : CROSSFADE_MS, easing: Easing.inOut(Easing.quad) });
  }, [active, reduced, opacity]);

  useEffect(() => {
    if (reduced) return;
    drift.value = withRepeat(withTiming(1, { duration: DRIFT_MS, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, [reduced, drift]);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [
      { scale: 1.08 + drift.value * 0.06 },
      { translateX: direction * (drift.value * 24 - 12) },
      { translateY: drift.value * -16 },
    ],
  }));

  return (
    <Animated.View style={[StyleSheet.absoluteFill, style]}>
      <Image source={source} style={StyleSheet.absoluteFill} contentFit="cover" transition={0} />
    </Animated.View>
  );
}

/** Headline + line for the active slide, with dots. Swipe left or right to change slides. */
export function SlideCaptions({ index, onChange, count }: { index: number; onChange: (i: number) => void; count: number }) {
  const { t } = useTranslation();
  const [height, setHeight] = useState(0);
  const [touchX, setTouchX] = useState<number | null>(null);

  return (
    <View
      onTouchStart={(e) => setTouchX(e.nativeEvent.pageX)}
      onTouchEnd={(e) => {
        if (touchX === null) return;
        const dx = e.nativeEvent.pageX - touchX;
        if (Math.abs(dx) > 40) onChange((index + (dx < 0 ? 1 : count - 1)) % count);
        setTouchX(null);
      }}>
      {/* All captions share one box sized to the tallest, so the buttons below never jump. */}
      <View style={{ minHeight: height }} accessibilityLiveRegion="polite">
        {SLIDES.map((key, i) => (
          <Caption
            key={key}
            active={i === index}
            title={t(`start.slides.${key}.title`)}
            body={t(`start.slides.${key}.body`)}
            onHeight={(h) => setHeight((prev) => Math.max(prev, h))}
          />
        ))}
      </View>
      <View style={styles.dots}>
        {SLIDES.map((key, i) => (
          <Dot
            key={key}
            active={i === index}
            label={t('start.slideLabel', { n: i + 1, total: count })}
            onPress={() => onChange(i)}
          />
        ))}
      </View>
    </View>
  );
}

function Caption({ active, title, body, onHeight }: { active: boolean; title: string; body: string; onHeight: (h: number) => void }) {
  const reduced = useReducedMotion();
  const shown = useSharedValue(active ? 1 : 0);
  useEffect(() => {
    shown.value = withTiming(active ? 1 : 0, { duration: active ? 360 : 200, easing: Easing.bezier(0.2, 0.8, 0.2, 1) });
  }, [active, shown]);
  const style = useAnimatedStyle(() => ({
    opacity: shown.value,
    transform: [{ translateY: reduced ? 0 : (1 - shown.value) * 12 }],
  }));
  return (
    <Animated.View
      style={[styles.caption, style]}
      pointerEvents={active ? 'auto' : 'none'}
      accessibilityElementsHidden={!active}
      importantForAccessibility={active ? 'auto' : 'no-hide-descendants'}
      onLayout={(e) => onHeight(e.nativeEvent.layout.height)}>
      <Text style={styles.title} role="heading">
        {title}
      </Text>
      <Text style={styles.body}>{body}</Text>
    </Animated.View>
  );
}

function Dot({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  const on = useSharedValue(active ? 1 : 0);
  useEffect(() => {
    on.value = withTiming(active ? 1 : 0, { duration: 240 });
  }, [active, on]);
  const style = useAnimatedStyle(() => ({ width: 8 + on.value * 18, opacity: 0.45 + on.value * 0.55 }));
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: active }} style={styles.dotHit}>
      <Animated.View style={[styles.dot, style]} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  caption: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  title: { fontFamily: font.semibold, fontSize: 32, lineHeight: 38, color: color.onForest, letterSpacing: -0.4 },
  body: { ...type.body, color: color.onForest, opacity: 0.88, marginTop: space[2] },
  dots: { flexDirection: 'row', marginTop: space[3], marginLeft: -space[2] },
  dotHit: { height: 32, minWidth: 32, paddingHorizontal: space[1], alignItems: 'center', justifyContent: 'center' },
  dot: { height: 8, borderRadius: 4, backgroundColor: color.onForest },
});
