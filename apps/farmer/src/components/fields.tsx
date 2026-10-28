import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { color, font, motion, radius, space, touch, type } from '@/theme/tokens';

export function FieldLabel({ children, optional }: { children: ReactNode; optional?: string }) {
  return (
    <Text style={styles.label}>
      {children}
      {optional ? <Text style={styles.optional}> ({optional})</Text> : null}
    </Text>
  );
}

export function FieldMessage({ error, hint }: { error?: string | null; hint?: string }) {
  if (error)
    return (
      <Text style={styles.error} accessibilityLiveRegion="polite" role="alert">
        {error}
      </Text>
    );
  return hint ? <Text style={styles.hint}>{hint}</Text> : null;
}

/** Border colour eases between idle, focused and error (motion.color, 140 ms). */
function useFieldBorder(focused: boolean, invalid: boolean) {
  const focus = useSharedValue(0);
  useEffect(() => {
    focus.value = withTiming(focused ? 1 : 0, motion.color);
  }, [focused, focus]);
  return useAnimatedStyle(() => ({
    borderColor: invalid ? color.red700 : interpolateColor(focus.value, [0, 1], [color.stone300, color.forest900]),
    borderWidth: invalid || focus.value > 0.5 ? 2 : 1,
  }));
}

export function TextField({ invalid, ...props }: TextInputProps & { invalid?: boolean }) {
  const [focused, setFocused] = useState(false);
  const border = useFieldBorder(focused, !!invalid);
  return (
    <Animated.View style={[styles.box, border]}>
      <TextInput
        placeholderTextColor={color.stone500}
        {...props}
        onFocus={(e) => {
          setFocused(true);
          props.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          props.onBlur?.(e);
        }}
        style={styles.input}
      />
    </Animated.View>
  );
}

/** +254 is always visible and not editable (design.md §9). */
export function PhoneField({
  value,
  onChangeText,
  invalid,
  label,
  onSubmitEditing,
  autoFocus,
}: {
  value: string;
  onChangeText: (v: string) => void;
  invalid?: boolean;
  label: string;
  onSubmitEditing?: () => void;
  autoFocus?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const border = useFieldBorder(focused, !!invalid);
  return (
    <Animated.View style={[styles.box, styles.phoneBox, border]}>
      <View style={styles.prefix}>
        <Text style={styles.prefixText}>+254</Text>
      </View>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        keyboardType="phone-pad"
        inputMode="tel"
        autoComplete="tel"
        textContentType="telephoneNumber"
        placeholder="712 345 678"
        placeholderTextColor={color.stone500}
        accessibilityLabel={label}
        maxLength={12}
        autoFocus={autoFocus}
        returnKeyType="done"
        onSubmitEditing={onSubmitEditing}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[styles.input, styles.phoneInput]}
      />
    </Animated.View>
  );
}

/** Six cells over one hidden input, so Android SMS autofill and paste both work. */
export function CodeInput({
  value,
  onChange,
  invalid,
  disabled,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  invalid?: boolean;
  disabled?: boolean;
  label: string;
}) {
  const ref = useRef<React.ComponentRef<typeof TextInput>>(null);
  const [focused, setFocused] = useState(true);
  return (
    <Pressable onPress={() => ref.current?.focus()} accessible={false}>
      <View style={styles.codeRow}>
        {Array.from({ length: 6 }, (_, i) => {
          const active = focused && !disabled && (i === value.length || (i === 5 && value.length === 6));
          return (
            <CodeCell key={i} char={value[i] ?? ''} active={active} invalid={!!invalid} />
          );
        })}
      </View>
      <TextInput
        ref={ref}
        value={value}
        onChangeText={(t) => onChange(t.replace(/\D/g, '').slice(0, 6))}
        keyboardType="number-pad"
        inputMode="numeric"
        autoComplete="sms-otp"
        textContentType="oneTimeCode"
        autoFocus
        editable={!disabled}
        maxLength={6}
        caretHidden
        accessibilityLabel={label}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={styles.hiddenInput}
      />
    </Pressable>
  );
}

function CodeCell({ char, active, invalid }: { char: string; active: boolean; invalid: boolean }) {
  const border = useFieldBorder(active, invalid);
  return (
    <Animated.View style={[styles.cell, border, char ? styles.cellFilled : null]}>
      <Text style={styles.cellText}>{char}</Text>
    </Animated.View>
  );
}

export function Checkbox({ checked, onChange, children, invalid }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode; invalid?: boolean }) {
  const fill = useSharedValue(checked ? 1 : 0);
  useEffect(() => {
    fill.value = withTiming(checked ? 1 : 0, motion.color);
  }, [checked, fill]);
  const box = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(fill.value, [0, 1], [color.stone50, color.forest900]),
  }));
  return (
    <Pressable
      onPress={() => onChange(!checked)}
      role="checkbox"
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      style={styles.checkRow}>
      <Animated.View style={[styles.checkBox, invalid && !checked && { borderColor: color.red700 }, box]}>
        {checked ? (
          <Svg width={16} height={16} viewBox="0 0 16 16">
            <Path d="M3 8.5l3.2 3L13 4.5" stroke={color.onForest} strokeWidth={2.2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
        ) : null}
      </Animated.View>
      <Text style={styles.checkText}>{children}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  label: { ...type.meta, fontFamily: font.semibold, color: color.ink, marginBottom: space[2] },
  optional: { fontFamily: font.regular, color: color.stone600 },
  hint: { ...type.meta, fontFamily: font.regular, color: color.stone600, marginTop: space[2] },
  error: { ...type.meta, color: color.red700, marginTop: space[2] },
  box: {
    minHeight: touch.primary,
    borderRadius: radius.sm,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
  },
  input: { ...type.body, color: color.ink, paddingHorizontal: space[4], minHeight: touch.primary - 4 },
  phoneBox: { flexDirection: 'row', alignItems: 'stretch', overflow: 'hidden' },
  prefix: {
    justifyContent: 'center',
    paddingHorizontal: space[4],
    backgroundColor: color.stone100,
    borderRightWidth: 1,
    borderRightColor: color.stone200,
  },
  prefixText: { ...type.bodyEmphasis, color: color.ink, fontVariant: ['tabular-nums'] },
  phoneInput: { flex: 1, fontVariant: ['tabular-nums'], letterSpacing: 0.5 },
  codeRow: { flexDirection: 'row', justifyContent: 'space-between', gap: space[2] },
  cell: {
    flex: 1,
    maxWidth: 52,
    height: 60,
    borderRadius: radius.sm,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellFilled: { backgroundColor: color.forest50 },
  cellText: { ...type.title, color: color.ink, fontVariant: ['tabular-nums'] },
  hiddenInput: { position: 'absolute', width: 1, height: 1, opacity: 0 },
  checkRow: { flexDirection: 'row', gap: space[3], alignItems: 'flex-start', minHeight: touch.min, paddingVertical: space[1] },
  checkBox: {
    width: 26,
    height: 26,
    marginTop: 2,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: color.forest900,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkText: { ...type.meta, fontFamily: font.regular, fontSize: 15, lineHeight: 22, color: color.stone800, flex: 1 },
});
