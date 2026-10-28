import { IBMPlexSans_400Regular } from '@expo-google-fonts/ibm-plex-sans/400Regular';
import { IBMPlexSans_500Medium } from '@expo-google-fonts/ibm-plex-sans/500Medium';
import { IBMPlexSans_600SemiBold } from '@expo-google-fonts/ibm-plex-sans/600SemiBold';
import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { initI18n } from '@/i18n';
import { native, ReplyAlerts } from '@/lib/alerts';
import { AuthProvider, useAuth } from '@/lib/auth';
import { FarmStoreProvider } from '@/lib/farm-store';
import { color } from '@/theme/tokens';

SplashScreen.preventAutoHideAsync();

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
    } else if (!['(tabs)', 'check', 'plot', 'result'].includes(top ?? '')) {
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
      </Stack.Protected>
    </Stack>
    {native && user?.onboarded ? <ReplyAlerts userId={user.id} /> : null}
    </FarmStoreProvider>
  );
}
