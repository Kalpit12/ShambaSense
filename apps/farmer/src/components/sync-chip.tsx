import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';

import { formatDate, localDay } from '@/lib/dates';
import { useFarm } from '@/lib/farm-store';
import { color, radius, space, type } from '@/theme/tokens';

/**
 * Honest sync state (design.md §12): offline, "Waiting to send · N", "Sending 2 of 3…", and once
 * everything is up it collapses to the last sync time. Sky dot that pulses while anything is pending.
 * Never lime, never a green check while pending.
 */
export function SyncChip({ onDark }: { onDark?: boolean }) {
  const { t, i18n } = useTranslation();
  const { waiting: queued, progress, offline, lastSyncAt } = useFarm();
  const waiting = queued + (progress ? 1 : 0);
  const reduced = useReducedMotion();
  const pulse = useSharedValue(1);

  useEffect(() => {
    if (waiting > 0 && !reduced) {
      pulse.value = withRepeat(withTiming(0.35, { duration: 900, easing: Easing.inOut(Easing.quad) }), -1, true);
    } else {
      cancelAnimation(pulse);
      pulse.value = 1;
    }
  }, [waiting, reduced, pulse]);

  const dot = useAnimatedStyle(() => ({ opacity: pulse.value }));
  const label = progress
    ? t('sync.sending', { done: Math.min(progress.done + 1, progress.total), total: progress.total })
    : queued > 0
      ? t('sync.waiting', { count: queued })
      : offline
        ? t('sync.offline')
        : lastSyncAt
          ? t('sync.synced', { time: syncTime(lastSyncAt, t, i18n.language) })
          : t('sync.saved');

  return (
    <View
      style={[styles.chip, onDark ? styles.dark : waiting > 0 ? styles.waiting : styles.saved]}
      accessibilityRole="text"
      accessibilityLabel={label}>
      <Animated.View style={[styles.dot, { backgroundColor: onDark ? (waiting > 0 ? '#9CCBE6' : color.onForest) : waiting > 0 ? color.sky700 : color.forest900 }, dot]} />
      <Text style={[styles.text, { color: onDark ? color.onForest : waiting > 0 ? color.sky700 : color.forest900 }]}>{label}</Text>
    </View>
  );
}

/** "10:42" today, otherwise "Yesterday" or the date. */
export function syncTime(iso: string, t: (k: string) => string, lang: string) {
  const d = new Date(iso);
  const sameDay = new Date().toDateString() === d.toDateString();
  if (sameDay) return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const yesterday = new Date(Date.now() - 86400000).toDateString() === d.toDateString();
  return yesterday ? t('dates.yesterday') : formatDate(localDay(iso), lang);
}

const styles = StyleSheet.create({
  chip: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
    minHeight: 32,
    paddingHorizontal: space[3],
    borderRadius: radius.full,
    borderWidth: 1,
  },
  waiting: { backgroundColor: '#EAF2F7', borderColor: '#BFD6E4' },
  dark: { backgroundColor: 'rgba(244,241,230,0.1)', borderColor: 'rgba(244,241,230,0.22)' },
  saved: { backgroundColor: color.forest50, borderColor: color.forest100 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  text: { ...type.meta },
});
