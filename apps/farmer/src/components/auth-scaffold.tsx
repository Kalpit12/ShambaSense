import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { isDemo, isPreview } from '@/lib/auth';
import { color, font, radius, space, touch, type } from '@/theme/tokens';
import { LockupOnDark } from './brand';
import { FieldBackground } from './field-background';
import { Enter, PressableScale } from './motion';

/**
 * Sign-in, sign-up and verify share this layout: the farm photo as a short header,
 * then a light stone sheet for the form, so inputs stay readable in sunlight.
 */
export function AuthScaffold({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: ReactNode; footer?: ReactNode }) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const { t } = useTranslation();
  const headerHeight = Math.max(170, Math.min(260, height * 0.28)) + insets.top;

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <View style={[styles.header, { height: headerHeight }]}>
        <FieldBackground strength="soft" />
        <View style={[styles.headerBar, { paddingTop: insets.top + space[2] }]}>
          {router.canGoBack() ? (
            <PressableScale
              onPress={() => router.back()}
              accessibilityRole="button"
              accessibilityLabel={t('common.back')}
              scaleTo={0.94}
              style={styles.back}>
              <Text style={styles.backArrow}>←</Text>
            </PressableScale>
          ) : (
            <View style={styles.back} />
          )}
        </View>
        <View style={styles.lockup}>
          <LockupOnDark height={30} />
        </View>
      </View>

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Enter style={[styles.sheet, { marginTop: -radius.md }]} from={0.6}>
          <ScrollView
            contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space[6] }]}
            keyboardShouldPersistTaps="handled">
            {isPreview || isDemo ? <Text style={styles.preview}>{t(isDemo ? 'common.demoAuthBanner' : 'common.demoBanner')}</Text> : null}
            <Enter step={1}>
              <Text style={styles.title} role="heading">
                {title}
              </Text>
              {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
            </Enter>
            <Enter step={2} style={styles.form}>
              {children}
            </Enter>
            {footer ? <Enter step={3}>{footer}</Enter> : null}
          </ScrollView>
        </Enter>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.stone50 },
  flex: { flex: 1 },
  header: { backgroundColor: color.forest900, overflow: 'hidden' },
  headerBar: { paddingHorizontal: space[2], flexDirection: 'row' },
  back: { width: touch.min, height: touch.min, alignItems: 'center', justifyContent: 'center', borderRadius: radius.full },
  backArrow: { fontSize: 26, lineHeight: 30, color: color.onForest, fontFamily: font.medium },
  lockup: { position: 'absolute', left: space[4], bottom: radius.md + space[5] },
  sheet: {
    flex: 1,
    backgroundColor: color.stone50,
    borderTopLeftRadius: radius.md,
    borderTopRightRadius: radius.md,
  },
  content: { paddingHorizontal: space[4], paddingTop: space[5], maxWidth: 560, width: '100%', alignSelf: 'center' },
  preview: {
    ...type.meta,
    color: color.stone800,
    backgroundColor: color.stone100,
    borderRadius: radius.sm,
    paddingHorizontal: space[3],
    paddingVertical: space[2],
    marginBottom: space[4],
  },
  title: { ...type.display, color: color.ink },
  subtitle: { ...type.body, color: color.stone600, marginTop: space[2] },
  form: { marginTop: space[5], gap: space[5] },
});
