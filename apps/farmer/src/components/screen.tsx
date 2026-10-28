import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { color, radius, space, type } from '@/theme/tokens';
import { Enter } from './motion';

/** Tab screen frame: stone ground, title row with an optional action, scrolling body above the tab bar. */
export function TabScreen({ title, action, top, children }: { title?: string; action?: ReactNode; top?: ReactNode; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + space[4] }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        {top}
        {title ? (
          <Enter step={0} style={styles.titleRow}>
            <Text style={styles.title} role="heading">
              {title}
            </Text>
            {action}
          </Enter>
        ) : null}
        {children}
      </ScrollView>
    </View>
  );
}

/** Small uppercase-free section heading with an optional trailing link. */
export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <View style={styles.sectionRow}>
      <Text style={styles.section} role="heading">
        {children}
      </Text>
      {action}
    </View>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: object }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.stone50 },
  content: { paddingHorizontal: space[4], paddingBottom: space[8] + space[6], gap: space[4] },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[3] },
  title: { ...type.display, color: color.ink, flexShrink: 1 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space[2], marginBottom: space[2], minHeight: 32 },
  section: { ...type.title, fontSize: 19, lineHeight: 24, color: color.ink },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.stone200,
    padding: space[4],
  },
});
