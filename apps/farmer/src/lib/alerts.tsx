import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { useTranslation } from 'react-i18next';

import { supabase } from './auth';
import { useCoopTasks } from './tasks';
import { useFarm } from './farm-store';

// Reply alerts (architecture.md §10). The server sends a notification when an agronomist answers or
// asks for another photo, and on the morning a follow-up photo is due. The app asks for permission
// the first time the farmer sends a case to an agronomist, when the reason is obvious, registers the
// phone, and opens the right check when the farmer taps an alert.

export const native = Platform.OS === 'android' || Platform.OS === 'ios';
let registeredToken: string | null = null;

if (native) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
  });
}

/** Signing out: this phone stops getting alerts for the account. */
export async function forgetPushToken() {
  if (!supabase || !registeredToken) return;
  try {
    await supabase.rpc('forget_push_token', { p_token: registeredToken });
  } catch {
    // Offline: the token moves to the next account that signs in on this phone.
  }
  registeredToken = null;
}

async function register(language: string, title: string) {
  if (!supabase || !Device.isDevice) return;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('replies', {
      name: title,
      importance: Notifications.AndroidImportance.HIGH,
      lightColor: '#0F3D26',
    });
  }
  let { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
  if (status !== 'granted') return;
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) return;
  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
  const { error } = await supabase.rpc('register_push_token', { p_token: token, p_platform: Platform.OS, p_language: language === 'en' ? 'en' : 'sw' });
  if (!error) registeredToken = token;
}

/** Mounted once inside the farm store, on phones only. Renders nothing. */
export function ReplyAlerts({ userId }: { userId?: string }) {
  const { t, i18n } = useTranslation();
  const { checks, followUps, sendNow } = useFarm();
  const { tasks, refresh } = useCoopTasks();
  const router = useRouter();
  const sendRef = useRef(sendNow);
  sendRef.current = sendNow;
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  const asked = checks.some((c) => c.askedAt) || followUps.length > 0 || tasks.length > 0;

  // Register once the farmer has a case, and again when the language changes so alerts match it.
  useEffect(() => {
    if (!native || !userId || !asked) return;
    register(i18n.language, t('alerts.channel')).catch(() => {
      // No permission or no signal: the app still finds answers when it syncs.
    });
  }, [userId, asked, i18n.language, t]);

  // An alert while the app is open: fetch the answer now instead of waiting for the next round.
  // A tap on an alert: fetch, then open that check.
  const handled = useRef<string | null>(null);
  const last = Notifications.useLastNotificationResponse();
  useEffect(() => {
    if (!native || !userId) return;
    const sub = Notifications.addNotificationReceivedListener((n) => {
      if (n.request.content.data?.taskId) refreshRef.current();
      else sendRef.current();
    });
    return () => sub.remove();
  }, [userId]);
  useEffect(() => {
    if (!native || !userId || !last) return;
    const id = last.notification.request.identifier;
    if (handled.current === id) return;
    handled.current = id;
    const data = last.notification.request.content.data;
    if (data?.taskId) {
      refreshRef.current();
      router.push('/tasks');
      return;
    }
    sendRef.current();
    const checkId = data?.checkId;
    if (typeof checkId === 'string') router.push({ pathname: '/result/[id]', params: { id: checkId } });
  }, [last, userId, router]);

  return null;
}
