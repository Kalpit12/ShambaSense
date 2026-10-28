import { useEffect, useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { COUNTIES } from '@/lib/counties';
import { color, font, motion, radius, space, touch, type } from '@/theme/tokens';

type Props = {
  value: string | null;
  onChange: (county: string) => void;
  placeholder: string;
  searchLabel: string;
  label: string;
  invalid?: boolean;
};

/** Field that opens a bottom sheet of Kenya's 47 counties with search (motion.sheet, 240 ms). */
export function CountyPicker({ value, onChange, placeholder, searchLabel, label, invalid }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value ?? placeholder}`}
        style={[styles.field, invalid && styles.fieldInvalid]}>
        <Text style={[styles.fieldText, !value && styles.placeholder]}>{value ?? placeholder}</Text>
        <Text style={styles.chevron}>▾</Text>
      </Pressable>
      <CountySheet
        open={open}
        onClose={() => setOpen(false)}
        onPick={(c) => {
          onChange(c);
          setOpen(false);
        }}
        selected={value}
        searchLabel={searchLabel}
        title={label}
      />
    </>
  );
}

function CountySheet({
  open,
  onClose,
  onPick,
  selected,
  searchLabel,
  title,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (c: string) => void;
  selected: string | null;
  searchLabel: string;
  title: string;
}) {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const y = useSharedValue(40);
  const fade = useSharedValue(0);

  useEffect(() => {
    if (open) {
      setQuery('');
      y.value = 40;
      fade.value = 0;
      y.value = withTiming(0, motion.sheet);
      fade.value = withTiming(1, motion.fade);
    }
  }, [open, y, fade]);

  const sheet = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }], opacity: 0.6 + 0.4 * fade.value }));
  const scrim = useAnimatedStyle(() => ({ opacity: fade.value }));

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? COUNTIES.filter((c) => c.toLowerCase().includes(q)) : COUNTIES;
  }, [query]);

  return (
    <Modal visible={open} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, scrim]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
      </Animated.View>
      <Animated.View style={[styles.sheet, { paddingBottom: insets.bottom + space[2] }, sheet]}>
        <View style={styles.grabber} />
        <Text style={styles.title}>{title}</Text>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={searchLabel}
          placeholderTextColor={color.stone500}
          accessibilityLabel={searchLabel}
          autoCorrect={false}
          style={styles.search}
        />
        <FlatList
          data={items as readonly string[] as string[]}
          keyExtractor={(c) => c}
          keyboardShouldPersistTaps="handled"
          initialNumToRender={14}
          renderItem={({ item }) => {
            const isSelected = item === selected;
            return (
              <Pressable
                onPress={() => onPick(item)}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                style={({ pressed }) => [styles.row, isSelected && styles.rowSelected, pressed && styles.rowPressed]}>
                <Text style={[styles.rowText, isSelected && styles.rowTextSelected]}>{item}</Text>
                {isSelected ? <Text style={styles.check}>✓</Text> : null}
              </Pressable>
            );
          }}
        />
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  field: {
    minHeight: touch.primary,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: color.stone300,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: space[4],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  fieldInvalid: { borderColor: color.red700, borderWidth: 2 },
  fieldText: { ...type.body, color: color.ink },
  placeholder: { color: color.stone500 },
  chevron: { fontSize: 16, color: color.stone600 },
  scrim: { backgroundColor: 'rgba(13,17,14,0.45)' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '80%',
    backgroundColor: color.stone50,
    borderTopLeftRadius: radius.md,
    borderTopRightRadius: radius.md,
    paddingHorizontal: space[4],
    boxShadow: '0 8px 24px rgba(20,32,26,0.12)',
  },
  grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: color.stone300, marginVertical: space[3] },
  title: { ...type.title, color: color.ink, marginBottom: space[3] },
  search: {
    ...type.body,
    minHeight: touch.min,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: color.stone300,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: space[4],
    color: color.ink,
    marginBottom: space[2],
  },
  row: {
    minHeight: touch.min + 4,
    paddingHorizontal: space[3],
    borderBottomWidth: 1,
    borderBottomColor: color.stone200,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowSelected: { backgroundColor: color.forest50 },
  rowPressed: { backgroundColor: color.stone100 },
  rowText: { ...type.body, color: color.ink },
  rowTextSelected: { fontFamily: font.semibold, color: color.forest900 },
  check: { ...type.bodyEmphasis, color: color.forest900 },
});
