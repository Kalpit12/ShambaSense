import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { color, radius, space } from '@/theme/tokens';
import { HEADER_PHOTO } from './field-background';

/** The tea photo under a deep forest wash, behind the status bar. Lime is allowed on it. */
export function DarkHero({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.hero, { paddingTop: insets.top + space[3] }, style]}>
      <Image source={HEADER_PHOTO} style={StyleSheet.absoluteFill} contentFit="cover" />
      <LinearGradient
        colors={['rgba(11,46,28,0.82)', 'rgba(11,46,28,0.92)', color.forest950]}
        locations={[0, 0.45, 1]}
        style={StyleSheet.absoluteFill}
      />
      {children}
    </View>
  );
}

/** Frosted panel that sits on the hero. */
export function GlassPanel({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.panel, style]}>{children}</View>;
}

/** Stone sheet that overlaps the hero's bottom edge with rounded corners. */
export function HeroBody({ children }: { children: ReactNode }) {
  return <View style={styles.body}>{children}</View>;
}

export const onForestMuted = 'rgba(244,241,230,0.72)';

const styles = StyleSheet.create({
  hero: { paddingHorizontal: space[4], paddingBottom: space[8], overflow: 'hidden', backgroundColor: color.forest950, gap: space[3] },
  panel: {
    padding: space[4],
    borderRadius: radius.md + 4,
    backgroundColor: 'rgba(244,241,230,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(244,241,230,0.12)',
  },
  body: {
    marginTop: -space[5],
    borderTopLeftRadius: radius.md + 8,
    borderTopRightRadius: radius.md + 8,
    backgroundColor: color.stone50,
    paddingHorizontal: space[4],
    paddingTop: space[3],
    gap: space[4],
  },
});
