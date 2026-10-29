import * as Notifications from 'expo-notifications';
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { useTranslation } from 'react-i18next';

import { plotSteps, useCalendarDone } from './calendar';
import { stepText } from './calendar-text';
import { shiftDays } from './dates';
import { todayIso, useFarm } from './farm-store';

// Crop calendar alerts, scheduled on the phone itself: they arrive at 7 am on the day a step is due,
// with no signal and no SMS cost. Rescheduled whenever plots, ticks or the language change. Only the
// next 60 days are booked, which keeps well under Android's limit on waiting alarms.

const PREFIX = 'cal:';
const HORIZON_DAYS = 60;
const MAX_ALERTS = 30;

/** Mounted once on phones, next to ReplyAlerts. Renders nothing. */
export function CalendarAlerts({ owner }: { owner: string }) {
  const { t, i18n } = useTranslation();
  const { plots } = useFarm();
  const { done } = useCalendarDone(owner);
  const last = useRef('');

  // Signing out: this account's reminders leave the phone with it.
  useEffect(
    () => () => {
      Notifications.getAllScheduledNotificationsAsync()
        .then((booked) => Promise.all(booked.filter((n) => n.identifier.startsWith(PREFIX)).map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier))))
        .catch(() => {});
    },
    [owner],
  );

  useEffect(() => {
    const today = todayIso();
    const until = shiftDays(today, HORIZON_DAYS);
    const steps = plots
      .flatMap((p) => plotSteps(p, today, done))
      .filter((s) => s.state !== 'done' && s.date > today && s.date <= until)
      .sort((a, b) => (a.date < b.date ? -1 : 1))
      .slice(0, MAX_ALERTS);
    const signature = `${i18n.language}|${steps.map((s) => `${s.id}@${s.date}`).join(',')}`;
    if (signature === last.current) return;
    last.current = signature;

    (async () => {
      const booked = await Notifications.getAllScheduledNotificationsAsync();
      await Promise.all(booked.filter((n) => n.identifier.startsWith(PREFIX)).map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)));
      if (steps.length === 0) return;
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('calendar', { name: t('calendar.channel'), importance: Notifications.AndroidImportance.DEFAULT, lightColor: '#0F3D26' });
      }
      let { status } = await Notifications.getPermissionsAsync();
      if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
      if (status !== 'granted') return;
      for (const s of steps) {
        const [y, m, d] = s.date.split('-').map(Number);
        const { title, hint } = stepText(t, s);
        await Notifications.scheduleNotificationAsync({
          identifier: `${PREFIX}${s.id}`,
          content: { title, body: hint, data: { plotId: s.plot.id } },
          trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(y, m - 1, d, 7, 0), channelId: 'calendar' },
        });
      }
    })().catch(() => {
      // No permission or the phone refused: steps still show on Home and on the plot.
      last.current = '';
    });
  }, [plots, done, i18n.language, t]);

  return null;
}
