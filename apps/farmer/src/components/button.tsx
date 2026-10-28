import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { color, radius, touch, type } from '@/theme/tokens';
import { PressableScale } from './motion';

type Variant = 'primary' | 'secondary' | 'onDarkPrimary' | 'onDarkSecondary' | 'text';

type Props = {
  label: string;
  onPress: () => void;
  variant?: Variant;
  loading?: boolean;
  disabled?: boolean;
  accessibilityHint?: string;
};

/**
 * Product button (design.md §11): 56 dp for primary submit, radius 8.
 * On photo or forest backgrounds the primary is cream with forest text; lime stays on the logo only.
 */
export function Button({ label, onPress, variant = 'primary', loading, disabled, accessibilityHint }: Props) {
  const s = variants[variant];
  const inactive = disabled || loading;
  return (
    <PressableScale
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      style={[styles.base, s.box, disabled && styles.disabled]}>
      <View style={styles.row}>
        {loading ? <ActivityIndicator color={s.text.color} /> : <Text style={[styles.label, s.text]}>{label}</Text>}
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: touch.primary,
    borderRadius: radius.sm,
    paddingHorizontal: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  row: { flexDirection: 'row', alignItems: 'center' },
  label: { ...type.bodyEmphasis, textAlign: 'center' },
  disabled: { opacity: 0.5 },
});

const variants: Record<Variant, { box: object; text: { color: string } }> = {
  primary: { box: { backgroundColor: color.forest900 }, text: { color: color.onForest } },
  secondary: {
    box: { backgroundColor: 'transparent', borderWidth: 1, borderColor: color.stone300 },
    text: { color: color.ink },
  },
  onDarkPrimary: { box: { backgroundColor: color.onForest }, text: { color: color.forest900 } },
  onDarkSecondary: {
    box: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: 'rgba(244,241,230,0.7)' },
    text: { color: color.onForest },
  },
  text: { box: { minHeight: touch.min, paddingHorizontal: 8 }, text: { color: color.forest900 } },
};
