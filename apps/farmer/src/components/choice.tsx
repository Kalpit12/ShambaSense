import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { color, font, motion, radius, space, touch, type } from '@/theme/tokens';
import { PressableScale } from './motion';

/** Selection fill and border ease over motion.color (140 ms); the tick pops in with a short scale. */
function useSelected(selected: boolean) {
  const on = useSharedValue(selected ? 1 : 0);
  useEffect(() => {
    on.value = withTiming(selected ? 1 : 0, motion.color);
  }, [selected, on]);
  const box = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(on.value, [0, 1], ['#FFFFFF', color.forest50]),
    borderColor: interpolateColor(on.value, [0, 1], [color.stone300, color.forest900]),
    borderWidth: on.value > 0.5 ? 2 : 1,
  }));
  const tick = useAnimatedStyle(() => ({ opacity: on.value, transform: [{ scale: 0.6 + 0.4 * on.value }] }));
  return { box, tick };
}

function Tick({ round }: { round?: boolean }) {
  return (
    <View style={[styles.tickBox, round && styles.tickRound]}>
      <Svg width={14} height={14} viewBox="0 0 16 16">
        <Path d="M3 8.5l3.2 3L13 4.5" stroke={color.onForest} strokeWidth={2.4} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    </View>
  );
}

/** Compact two-column chip: multi-select (crops, animals) or, with `single`, one choice (age). */
export function ChoiceChip({ label, selected, onPress, single }: { label: string; selected: boolean; onPress: () => void; single?: boolean }) {
  const { box, tick } = useSelected(selected);
  return (
    <PressableScale
      onPress={onPress}
      role={single ? 'radio' : 'checkbox'}
      accessibilityRole={single ? 'radio' : 'checkbox'}
      accessibilityState={single ? { selected } : { checked: selected }}
      accessibilityLabel={label}
      containerStyle={styles.chipCell}>
      <Animated.View style={[styles.chip, box]}>
        <Text style={[styles.chipText, selected && styles.selectedText]} numberOfLines={2}>
          {label}
        </Text>
        <Animated.View style={tick}>
          <Tick round={single} />
        </Animated.View>
      </Animated.View>
    </PressableScale>
  );
}

/** Full-width option row with an optional hint line. Radio for single choice, box for multi. */
export function ChoiceRow({
  label,
  hint,
  selected,
  onPress,
  multi,
}: {
  label: string;
  hint?: string;
  selected: boolean;
  onPress: () => void;
  multi?: boolean;
}) {
  const { box, tick } = useSelected(selected);
  return (
    <PressableScale
      onPress={onPress}
      role={multi ? 'checkbox' : 'radio'}
      accessibilityRole={multi ? 'checkbox' : 'radio'}
      accessibilityState={multi ? { checked: selected } : { selected }}
      accessibilityLabel={hint ? `${label}. ${hint}` : label}>
      <Animated.View style={[styles.row, box]}>
        <View style={styles.rowText}>
          <Text style={[styles.rowLabel, selected && styles.selectedText]}>{label}</Text>
          {hint ? <Text style={styles.rowHint}>{hint}</Text> : null}
        </View>
        <View style={[styles.mark, !multi && styles.markRound]}>
          <Animated.View style={[styles.markFill, tick]}>
            <Tick round={!multi} />
          </Animated.View>
        </View>
      </Animated.View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  chipCell: { width: '48.5%' },
  chip: {
    minHeight: touch.primary,
    borderRadius: radius.sm,
    paddingLeft: space[4],
    paddingRight: space[3],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space[2],
  },
  chipText: { ...type.body, fontFamily: font.medium, color: color.ink, flexShrink: 1 },
  selectedText: { fontFamily: font.semibold, color: color.forest900 },
  row: {
    minHeight: 72,
    borderRadius: radius.sm,
    paddingHorizontal: space[4],
    paddingVertical: space[3],
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
  },
  rowText: { flex: 1 },
  rowLabel: { ...type.bodyEmphasis, color: color.ink },
  rowHint: { ...type.meta, fontFamily: font.regular, color: color.stone600, marginTop: 2 },
  mark: { width: 26, height: 26, borderRadius: 6, borderWidth: 2, borderColor: color.stone300 },
  markRound: { borderRadius: 13 },
  markFill: { position: 'absolute', top: -2, left: -2 },
  tickBox: { width: 26, height: 26, borderRadius: 6, backgroundColor: color.forest900, alignItems: 'center', justifyContent: 'center' },
  tickRound: { borderRadius: 13 },
});
