import { IBMPlexSans_400Regular } from '@expo-google-fonts/ibm-plex-sans/400Regular';
import { IBMPlexSans_500Medium } from '@expo-google-fonts/ibm-plex-sans/500Medium';
import { IBMPlexSans_600SemiBold } from '@expo-google-fonts/ibm-plex-sans/600SemiBold';
import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments, type ErrorBoundaryProps } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { initI18n } from '@/i18n';
import { native, ReplyAlerts } from '@/lib/alerts';
import { CalendarAlerts } from '@/lib/calendar-alerts';
import { Button } from '@/components/button';
import { AuthProvider, useAuth } from '@/lib/auth';
import { installErrorReporting, reportError } from '@/lib/errors';
import { FarmStoreProvider } from '@/lib/farm-store';
import { installUpdateChecks } from '@/lib/updates';
import { color, font, space, type } from '@/theme/tokens';

SplashScreen.preventAutoHideAsync();
installErrorReporting();
installUpdateChecks();

/** A screen crashed: tell the team, and give the farmer a way back without losing saved work. */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const { t } = useTranslation();
  useEffect(() => {
    reportError(error, { kind: 'screen' });
  }, [error]);
  return (
    <View style={styles.crash}>
      <Text style={styles.crashText}>{t('common.genericError')}</Text>
      <Button label={t('common.tryAgain')} onPress={retry} />
    </View>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({ IBMPlexSans_400Regular, IBMPlexSans_500Medium, IBMPlexSans_600SemiBold });
  const [i18nReady, setI18nReady] = useState(false);

  useEffect(() => {
    initI18n().finally(() => setI18nReady(true));
  }, []);

  if (!fontsLoaded || !i18nReady) return null;

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <RootStack />
      </AuthProvider>
    </SafeAreaProvider>
  );
}

function RootStack() {
  const { ready, user } = useAuth();

  useEffect(() => {
    // The native splash (forest ground, lime mark) hands over to the start screen's identical
    // first frame, so the switch is invisible.
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  // The guards hide screens a person may not see; this sends them to the right place when sign-in
  // state changes (SDK 58's router no longer picks a fallback screen on its own).
  const router = useRouter();
  const segments = useSegments() as string[];
  const top = segments[0];
  useEffect(() => {
    if (!ready) return;
    if (!user) {
      if (top && !['sign-in', 'sign-up', 'verify'].includes(top)) router.replace('/');
    } else if (!user.onboarded) {
      if (top !== 'onboarding') router.replace('/onboarding');
    } else if (!['(tabs)', 'check', 'plot', 'result', 'guides', 'tasks'].includes(top ?? '')) {
      router.replace('/home');
    }
  }, [ready, user, top, router]);

  if (!ready) return null;

  // Each account gets its own store on the phone, keyed by phone number.
  return (
    <FarmStoreProvider owner={user?.phone ?? 'signed-out'} userId={user?.id}>
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'fade',
        animationDuration: 200,
        contentStyle: { backgroundColor: color.stone50 },
      }}>
      <Stack.Protected guard={!user}>
        <Stack.Screen name="index" options={{ contentStyle: { backgroundColor: color.forest900 } }} />
        <Stack.Screen name="sign-in" />
        <Stack.Screen name="sign-up" />
        <Stack.Screen name="verify" />
      </Stack.Protected>
      {/* A new sign-up answers the first-time questions before reaching Home. */}
      <Stack.Protected guard={!!user && !user.onboarded}>
        <Stack.Screen name="onboarding" />
      </Stack.Protected>
      <Stack.Protected guard={!!user?.onboarded}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="check" options={{ animation: 'slide_from_bottom', animationDuration: 240 }} />
        <Stack.Screen name="plot/[id]" options={{ animation: 'slide_from_right', animationDuration: 240 }} />
        <Stack.Screen name="result/[id]" options={{ animation: 'slide_from_right', animationDuration: 240 }} />
        <Stack.Screen name="tasks" options={{ animation: 'slide_from_right', animationDuration: 240 }} />
        <Stack.Screen name="guides/index" options={{ animation: 'slide_from_right', animationDuration: 240 }} />
        <Stack.Screen name="guides/[id]" options={{ animation: 'slide_from_right', animationDuration: 240 }} />
      </Stack.Protected>
    </Stack>
    {native && user?.onboarded ? <ReplyAlerts userId={user.id} /> : null}
    {native && user?.onboarded && (user.id ?? user.phone) ? <CalendarAlerts owner={(user.id ?? user.phone)!} /> : null}
    </FarmStoreProvider>
  );
}

const styles = StyleSheet.create({
  crash: { flex: 1, justifyContent: 'center', padding: space[6], gap: space[4], backgroundColor: color.stone50 },
  crashText: { ...type.body, fontFamily: font.medium, color: color.ink, textAlign: 'center' },
});
