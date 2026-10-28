import { useEffect, useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { color, motion, radius, space, type } from '@/theme/tokens';

/**
 * Bottom sheet for short forms (add plot, add record, sign out). Rises 40 px and fades over
 * motion.sheet (240 ms); closing plays the same motion backwards before the modal unmounts.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const [mounted, setMounted] = useState(open);
  const y = useSharedValue(40);
  const fade = useSharedValue(0);

  useEffect(() => {
    if (open) {
      setMounted(true);
      y.value = 40;
      fade.value = 0;
      y.value = withTiming(0, motion.sheet);
      fade.value = withTiming(1, motion.fade);
    } else if (mounted) {
      y.value = withTiming(40, motion.fade);
      fade.value = withTiming(0, motion.fade, (done) => {
        if (done) runOnJS(setMounted)(false);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const sheet = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }], opacity: 0.6 + 0.4 * fade.value }));
  const scrim = useAnimatedStyle(() => ({ opacity: fade.value }));

  return (
    <Modal visible={mounted} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, scrim]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
      </Animated.View>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.anchor} pointerEvents="box-none">
        <Animated.View style={[styles.sheet, sheet]}>
          <View style={styles.grabber} />
          <Text style={styles.title} role="heading">
            {title}
          </Text>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
            {children}
          </ScrollView>
          {footer ? <View style={[styles.footer, { paddingBottom: insets.bottom + space[3] }]}>{footer}</View> : null}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { backgroundColor: 'rgba(13,17,14,0.45)' },
  anchor: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    maxHeight: '90%',
    backgroundColor: color.stone50,
    borderTopLeftRadius: radius.md,
    borderTopRightRadius: radius.md,
    boxShadow: '0 8px 24px rgba(20,32,26,0.12)',
  },
  grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: color.stone300, marginVertical: space[3] },
  title: { ...type.title, color: color.ink, paddingHorizontal: space[4], marginBottom: space[2] },
  body: { paddingHorizontal: space[4], paddingBottom: space[4], gap: space[2] },
  footer: { paddingHorizontal: space[4], paddingTop: space[3], gap: space[2], borderTopWidth: 1, borderTopColor: color.stone200 },
});
