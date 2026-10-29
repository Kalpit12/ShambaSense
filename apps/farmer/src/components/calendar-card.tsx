import type { ComponentType } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/button';
import { BasketIcon, CheckIcon, LeafIcon, PackageIcon, PlantIcon, ShovelIcon } from '@/components/icons';
import { Card, SectionTitle } from '@/components/screen';
import { useAuth } from '@/lib/auth';
import { CALENDAR, plotSteps, useCalendarDone, type PlotStep, type StepKind } from '@/lib/calendar';
import { stepText } from '@/lib/calendar-text';
import { shortDate } from '@/lib/dates';
import { todayIso, useFarm, type Plot } from '@/lib/farm-store';
import { color, font, space, type } from '@/theme/tokens';

type IconProps = { size?: number; color?: string; weight?: 'regular' | 'fill' | 'bold' };

export const STEP_ICON: Record<StepKind, ComponentType<IconProps>> = {
  weed: ShovelIcon,
  topdress: PackageIcon,
  scout: LeafIcon,
  hill: ShovelIcon,
  stake: PlantIcon,
  harvest: BasketIcon,
};

/** Ticks a step and writes it in the journal as work on that plot, so the co-op sees it too. */
export function useMarkStepDone() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { addRecord } = useFarm();
  const { markDone } = useCalendarDone(user?.id ?? user?.phone);
  return (s: PlotStep) => {
    markDone(s.id);
    addRecord({ kind: 'work', plotId: s.plot.id, occurredOn: todayIso(), quantity: null, unit: null, amountKes: null, note: t('calendar.doneNote', { title: stepText(t, s).title }) });
  };
}

/** The plot's whole season: what to do and when, with the due steps ready to tick. */
export function CalendarCard({ plot }: { plot: Plot }) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { done } = useCalendarDone(user?.id ?? user?.phone);
  const markStepDone = useMarkStepDone();
  if (!CALENDAR[plot.crop]) return null;
  const steps = plotSteps(plot, todayIso(), done);

  return (
    <View>
      <SectionTitle>{t('calendar.title')}</SectionTitle>
      <Card style={styles.card}>
        {steps.length === 0 ? (
          <Text style={styles.empty}>{t('calendar.noDate')}</Text>
        ) : (
          steps.map((s, i) => {
            const { title, hint } = stepText(t, s);
            const Icon = STEP_ICON[s.kind];
            const quiet = s.state === 'done' || s.state === 'missed';
            return (
              <View key={s.key} style={[styles.row, i > 0 && styles.divider]}>
                <Text style={[styles.date, s.state === 'due' && styles.dateDue]}>{shortDate(s.date, i18n.language)}</Text>
                <View style={[styles.icon, s.state === 'due' && styles.iconDue, s.state === 'done' && styles.iconDone]}>
                  {s.state === 'done' ? <CheckIcon size={16} color={color.onForest} weight="bold" /> : <Icon size={18} color={s.state === 'due' ? color.onForest : color.forest900} />}
                </View>
                <View style={styles.flex}>
                  <Text style={[styles.title, quiet && styles.titleQuiet]}>{title}</Text>
                  {s.state === 'due' ? (
                    <>
                      <Text style={styles.hint}>{hint}</Text>
                      <View style={styles.action}>
                        <Button variant="secondary" label={t('calendar.markDone')} onPress={() => markStepDone(s)} />
                      </View>
                    </>
                  ) : s.state !== 'upcoming' ? (
                    <Text style={styles.state}>{t(`calendar.state.${s.state}`)}</Text>
                  ) : null}
                </View>
              </View>
            );
          })
        )}
        <Text style={styles.footnote}>{t('calendar.hint')}</Text>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { paddingVertical: space[2] },
  flex: { flex: 1, gap: 2 },
  empty: { ...type.body, color: color.stone600, paddingVertical: space[2] },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: space[3], paddingVertical: space[3] },
  divider: { borderTopWidth: 1, borderTopColor: color.stone200 },
  date: { ...type.meta, width: 52, color: color.stone600, paddingTop: 8, fontVariant: ['tabular-nums'] },
  dateDue: { fontFamily: font.semibold, color: color.forest900 },
  icon: { width: 36, height: 36, borderRadius: 18, backgroundColor: color.forest50, alignItems: 'center', justifyContent: 'center' },
  iconDue: { backgroundColor: color.forest900 },
  iconDone: { backgroundColor: color.stone500 },
  title: { ...type.bodyEmphasis, fontSize: 16, lineHeight: 22, color: color.ink, paddingTop: 6 },
  titleQuiet: { fontFamily: font.regular, color: color.stone500 },
  hint: { ...type.meta, fontFamily: font.regular, color: color.stone600 },
  state: { ...type.meta, color: color.stone500 },
  action: { marginTop: space[2], alignSelf: 'flex-start' },
  footnote: { fontFamily: font.regular, fontSize: 12, lineHeight: 16, color: color.stone500, marginTop: space[1], marginBottom: space[1] },
});
