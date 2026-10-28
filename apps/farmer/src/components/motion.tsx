import { useEffect, type ReactNode } from 'react';
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { motion } from '@/theme/tokens';

/**
 * Screen-enter motion (design.md §5.6 motion.enter): 8 px rise and a short fade, 200 ms,
 * staggered 40 ms by `step` (max 3 steps). Reduced motion drops the translation.
 */
export function Enter({
  children,
  step = 0,
  from = 0.92,
  delay = 0,
  style,
}: {
  children: ReactNode;
  step?: number;
  from?: number;
  delay?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const reduced = useReducedMotion();
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(
      delay + Math.min(step, 3) * motion.stagger,
      withTiming(1, { ...motion.enter, reduceMotion: ReduceMotion.Never }),
    );
  }, [delay, step, progress]);

  const animated = useAnimatedStyle(() => ({
    opacity: from + (1 - from) * progress.value,
    transform: [{ translateY: reduced ? 0 : (1 - progress.value) * 8 }],
  }));

  return <Animated.View style={[style, animated]}>{children}</Animated.View>;
}

/** Press feedback (motion.press): scale to 0.98 in 80 ms, back on release. */
export function PressableScale({
  children,
  style,
  containerStyle,
  scaleTo = 0.98,
  ...props
}: PressableProps & { style?: StyleProp<ViewStyle>; containerStyle?: StyleProp<ViewStyle>; scaleTo?: number; children: ReactNode }) {
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Pressable
      {...props}
      style={containerStyle}
      onPressIn={(e) => {
        scale.value = withTiming(scaleTo, motion.press);
        props.onPressIn?.(e);
      }}
      onPressOut={(e) => {
        scale.value = withTiming(1, motion.press);
        props.onPressOut?.(e);
      }}>
      <Animated.View style={[style, animated]}>{children}</Animated.View>
    </Pressable>
  );
}
