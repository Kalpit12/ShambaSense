import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';

import { setLanguage, type Language } from '@/i18n';
import { color, font, motion, radius, space, type } from '@/theme/tokens';
import { PressableScale } from './motion';

// Kiswahili first (design.md §9, architecture.md §8). Switching is instant and saved on the phone.
const ORDER: Language[] = ['sw', 'en'];

/** `light` is for stone screens such as Profile; the default sits on the start screen's photos. */
export function LanguageTiles({ light }: { light?: boolean }) {
  const { t, i18n } = useTranslation();
  const current = i18n.language as Language;
  return (
    <View style={styles.row} role="radiogroup">
      {ORDER.map((lng) => (
        <View key={lng} style={styles.col}>
          <Tile
            selected={current === lng}
            name={t(`language.${lng}.name`)}
            sample={t(`language.${lng}.sample`)}
            onPress={() => setLanguage(lng)}
            light={light}
          />
        </View>
      ))}
    </View>
  );
}

function Tile({ selected, name, sample, onPress, light }: { selected: boolean; name: string; sample: string; onPress: () => void; light?: boolean }) {
  const on = useSharedValue(selected ? 1 : 0);
  useEffect(() => {
    on.value = withTiming(selected ? 1 : 0, motion.color);
  }, [selected, on]);
  const box = useAnimatedStyle(() =>
    light
      ? {
          backgroundColor: interpolateColor(on.value, [0, 1], ['#FFFFFF', color.forest50]),
          borderColor: interpolateColor(on.value, [0, 1], [color.stone300, color.forest900]),
        }
      : {
          backgroundColor: interpolateColor(on.value, [0, 1], ['rgba(13,17,14,0.35)', 'rgba(244,241,230,1)']),
          borderColor: interpolateColor(on.value, [0, 1], ['rgba(244,241,230,0.55)', 'rgba(244,241,230,1)']),
        },
  );
  const ink = selected ? color.forest900 : light ? color.ink : color.onForest;
  return (
    <PressableScale
      onPress={onPress}
      role="radio"
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${name}. ${sample}`}
      containerStyle={styles.flex}
      style={styles.flex}>
      <Animated.View style={[styles.tile, styles.flex, box]}>
        <View style={styles.tileHead}>
          <Text style={[styles.name, { color: ink }]}>{name}</Text>
          <View style={[styles.radio, { borderColor: ink }]}>{selected ? <View style={styles.radioDot} /> : null}</View>
        </View>
        <Text style={[styles.sample, { color: ink }]} numberOfLines={2}>
          {sample}
        </Text>
      </Animated.View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space[3] },
  flex: { flex: 1 },
  col: { flex: 1, alignSelf: 'stretch' },
  tile: {
    minHeight: 72,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    paddingHorizontal: space[3],
    paddingVertical: space[3],
    justifyContent: 'center',
  },
  tileHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  name: { ...type.bodyEmphasis },
  sample: { ...type.meta, fontFamily: font.regular, marginTop: 2 },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: color.forest900 },
});
