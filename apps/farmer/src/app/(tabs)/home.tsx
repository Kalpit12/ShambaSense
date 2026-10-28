import { useRouter, type Href } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useMemo, type ComponentType } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { AreaChart, LegendDot, MeterBar, Rings } from '@/components/charts';
import { DarkHero, HeroBody } from '@/components/hero';
import { BookOpenTextIcon, CalendarBlankIcon, CameraIcon, CaretRightIcon, CloudSunIcon, NotebookIcon, PlantIcon } from '@/components/icons';
import { Enter, PressableScale } from '@/components/motion';
import { CheckRow, RecordRow } from '@/components/record-row';
import { Card, SectionTitle } from '@/components/screen';
import { SyncChip } from '@/components/sync-chip';
import { useAuth } from '@/lib/auth';
import { TYPICAL_DAYS } from '@/lib/crops';
import { parseIso, shiftDays, shortDate, todayLabel, weeksSince } from '@/lib/dates';
import { todayIso, useFarm, type JournalRecord, type Plot } from '@/lib/farm-store';
import { formatKes } from '@/lib/format';
import { followUpNeeded, followUpState } from '@/lib/follow-up';
import { expectedPlots } from '@/lib/onboarding';
import { color, font, radius, space, type } from '@/theme/tokens';

type IconProps = { size?: number; color?: string; weight?: 'regular' | 'fill' | 'bold' };
type Task = { key: string; title: string; hint: string; Icon: ComponentType<IconProps>; href: Href };

const WEEKS = 8;
const RING_COLORS = [color.forest900, '#4F9A6B', color.sky700];
const isOut = (r: JournalRecord) => r.kind === 'input' || r.kind === 'expense';

export default function HomeScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { user } = useAuth();
  const { plots, records, checks, followUps } = useFarm();
  const farm = user?.farm;
  const lang = i18n.language;
  const today = todayIso();

  // Money over the last 8 weeks in weekly steps, oldest first. Only real records count.
  const money = useMemo(() => {
    const start = shiftDays(today, -(WEEKS * 7 - 1));
    const sold = Array(WEEKS).fill(0) as number[];
    const spent = Array(WEEKS).fill(0) as number[];
    const inRange = records.filter((r) => r.amountKes != null && r.occurredOn >= start && r.occurredOn <= today);
    for (const r of inRange) {
      const w = Math.min(WEEKS - 1, Math.floor((parseIso(r.occurredOn).getTime() - parseIso(start).getTime()) / (7 * 86400000)));
      if (r.kind === 'sale') sold[w] += r.amountKes!;
      else if (isOut(r)) spent[w] += r.amountKes!;
    }
    const labels = sold.map((_, i) => (i === WEEKS - 1 ? t('home.thisWeek') : shortDate(shiftDays(start, i * 7), lang)));
    const byPlot = new Map<string | null, { sold: number; spent: number }>();
    for (const r of inRange) {
      if (r.kind !== 'sale' && !isOut(r)) continue;
      const row = byPlot.get(r.plotId) ?? { sold: 0, spent: 0 };
      if (r.kind === 'sale') row.sold += r.amountKes!;
      else row.spent += r.amountKes!;
      byPlot.set(r.plotId, row);
    }
    const totalSold = sold.reduce((a, b) => a + b, 0);
    const totalSpent = spent.reduce((a, b) => a + b, 0);
    // Running totals: two rising lines whose gap is the profit so far, easier to read than spiky weeks.
    const running = (xs: number[]) => xs.map((_, i) => xs.slice(0, i + 1).reduce((a, b) => a + b, 0));
    return { sold: running(sold), spent: running(spent), labels, totalSold, totalSpent, byPlot, any: inRange.length > 0 };
  }, [records, today, lang, t]);

  // Season rings: planted plots with a typical season length, furthest along first, at most three.
  const seasons = plots
    .filter((p): p is Plot & { plantedOn: string } => !!p.plantedOn && !!TYPICAL_DAYS[p.crop])
    .map((p) => {
      const days = (parseIso(today).getTime() - parseIso(p.plantedOn).getTime()) / 86400000;
      const typical = TYPICAL_DAYS[p.crop]!;
      return { plot: p, value: Math.min(1, days / typical), weeksLeft: Math.ceil((typical - days) / 7), week: weeksSince(p.plantedOn) + 1 };
    })
    .sort((a, b) => b.value - a.value)
    .slice(0, 3);

  const total = expectedPlots(farm?.plots);
  const tasks: Task[] = [];
  // Follow-up photos the agronomist is waiting for come first (architecture.md §10).
  for (const c of checks) {
    const s = followUpState(c, followUps, today);
    if (!followUpNeeded(s)) continue;
    const hint =
      s.kind === 'requested'
        ? t('followUp.taskRequested', { name: c.reply?.by ?? '' })
        : s.kind === 'overdue'
          ? t('followUp.taskOverdue', { date: shortDate(s.kind === 'overdue' ? s.due! : today, lang) })
          : t('followUp.taskDueToday');
    tasks.push({ key: `follow-${c.id}`, title: t('followUp.taskTitle', { crop: t(`onboarding.crops.${c.crop}`) }), hint, Icon: CameraIcon, href: `/check?followUp=${c.id}` });
  }
  if (plots.length < total)
    tasks.push({ key: 'plots', title: t('home.taskAddPlot'), hint: t('home.taskAddPlotHint', { done: plots.length, total }), Icon: PlantIcon, href: '/shamba?add=1' });
  if (plots.some((p) => !p.plantedOn))
    tasks.push({ key: 'planting', title: t('home.taskPlanting'), hint: t('home.taskPlantingHint'), Icon: CalendarBlankIcon, href: '/shamba' });
  if (checks.length === 0)
    tasks.push({ key: 'check', title: t('home.taskCheck'), hint: t('home.taskCheckHint'), Icon: CameraIcon, href: '/check' });
  if (!records.some((r) => r.occurredOn === today))
    tasks.push({ key: 'record', title: t('home.taskRecord'), hint: t('home.taskRecordHint'), Icon: NotebookIcon, href: '/journal?add=1' });

  const place = farm?.ward || farm?.county || user?.county;
  const net = money.totalSold - money.totalSpent;
  const plotRows = [...money.byPlot.entries()]
    .map(([id, v]) => ({ id, name: id ? (plots.find((p) => p.id === id)?.name ?? '') : t('home.wholeFarm'), ...v }))
    .filter((r) => r.name)
    .sort((a, b) => b.sold + b.spent - (a.sold + a.spent));
  const plotMax = Math.max(1, ...plotRows.flatMap((r) => [r.sold, r.spent]));

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {/* Hero: the tea photo under a deep forest wash, with the money chart on it. Lime appears only here, on dark. */}
        <DarkHero>
          <Enter step={0} style={styles.heroTop}>
            <SyncChip onDark />
            <Text style={styles.date}>{todayLabel(lang)}</Text>
          </Enter>
          <Enter step={0}>
            <Text style={styles.greeting} role="heading">
              {user?.name ? t('home.greeting', { name: user.name }) : t('home.greetingNoName')}
            </Text>
            {farm ? <Text style={styles.farm}>{[farm.farmName, farm.ward, farm.county].filter(Boolean).join(' · ')}</Text> : null}
            {place ? (
              <View style={styles.weather}>
                <CloudSunIcon size={18} color={color.onForest} />
                <Text style={styles.weatherText} numberOfLines={2}>
                  {t('home.weather', { place })}
                </Text>
              </View>
            ) : null}
          </Enter>

          <Enter step={1} style={styles.panel}>
            <Text style={styles.panelLabel}>{t('home.lastWeeks')}</Text>
            {money.any ? (
              <>
                <View style={styles.netRow}>
                  <Text style={styles.net}>
                    {net >= 0 ? '+' : '−'}
                    {formatKes(Math.abs(net))}
                  </Text>
                  <Text style={styles.netCaption}>{net >= 0 ? t('home.profit') : t('home.loss')}</Text>
                </View>
                <View style={styles.legend}>
                  <View style={styles.legendItem}>
                    <LegendDot c={color.lime} />
                    <Text style={styles.legendText}>
                      {t('home.sold')} <Text style={styles.legendValue}>{formatKes(money.totalSold)}</Text>
                    </Text>
                  </View>
                  <View style={styles.legendItem}>
                    <LegendDot c="rgba(244,241,230,0.7)" dashed />
                    <Text style={styles.legendText}>
                      {t('home.spent')} <Text style={styles.legendValue}>{formatKes(money.totalSpent)}</Text>
                    </Text>
                  </View>
                </View>
                <AreaChart
                  onDark
                  labels={money.labels}
                  format={formatKes}
                  series={[
                    { key: 'sold', label: t('home.sold'), values: money.sold, stroke: color.lime, fill: color.lime },
                    { key: 'spent', label: t('home.spent'), values: money.spent, stroke: 'rgba(244,241,230,0.7)', dashed: true },
                  ]}
                />
              </>
            ) : (
              <PressableScale onPress={() => router.push('/journal?add=1')} accessibilityRole="button" style={styles.moneyEmpty}>
                <Text style={styles.moneyEmptyText}>{t('home.moneyEmpty')}</Text>
                <CaretRightIcon size={18} color={color.onForest} />
              </PressableScale>
            )}
          </Enter>
        </DarkHero>

        <HeroBody>
          {tasks.length > 0 ? (
            <Enter step={2}>
              <SectionTitle>{t('home.today')}</SectionTitle>
              <Card style={styles.list}>
                {tasks.map((task, i) => (
                  <PressableScale
                    key={task.key}
                    onPress={() => router.push(task.href)}
                    accessibilityRole="button"
                    accessibilityLabel={`${task.title}. ${task.hint}`}
                    style={[styles.task, i > 0 && styles.divider]}>
                    <View style={styles.taskIcon}>
                      <task.Icon size={22} color={color.forest900} />
                    </View>
                    <View style={styles.flex}>
                      <Text style={styles.taskTitle}>{task.title}</Text>
                      <Text style={styles.taskHint}>{task.hint}</Text>
                    </View>
                    <CaretRightIcon size={20} color={color.stone500} />
                  </PressableScale>
                ))}
              </Card>
            </Enter>
          ) : null}

          <Enter step={3}>
            <SectionTitle>{t('home.season')}</SectionTitle>
            <Card>
              {seasons.length > 0 ? (
                <>
                  <View style={styles.seasonRow}>
                    <Rings
                      size={156}
                      stroke={12}
                      gap={5}
                      rings={seasons.map((s, i) => ({ key: s.plot.id, value: s.value, color: RING_COLORS[i] }))}
                      center={
                        <View style={styles.center}>
                          <Text style={styles.centerValue}>{plots.length}</Text>
                          <Text style={styles.centerLabel}>{t('home.plotsCenter')}</Text>
                        </View>
                      }
                    />
                  </View>
                  <View style={styles.seasonLegend}>
                    {seasons.map((s, i) => (
                      <View key={s.plot.id} style={[styles.seasonItem, i > 0 && styles.divider]}>
                        <View style={styles.seasonHead}>
                          <LegendDot c={RING_COLORS[i]} />
                          <Text style={styles.seasonName} numberOfLines={1}>
                            {s.plot.name}
                          </Text>
                          <Text style={styles.seasonWeek}>{t('home.week', { n: s.week })}</Text>
                        </View>
                        <Text style={styles.seasonMeta}>
                          {t(`onboarding.crops.${s.plot.crop}`)} ·{' '}
                          <Text style={s.weeksLeft <= 0 ? styles.ready : undefined}>
                            {s.weeksLeft > 0 ? t('home.weeksToGo', { count: s.weeksLeft }) : t('home.harvestTime')}
                          </Text>
                        </Text>
                      </View>
                    ))}
                  </View>
                  <Text style={[styles.footnote, styles.footnoteTight]}>{t('home.seasonHint')}</Text>
                </>
              ) : (
                <PressableScale onPress={() => router.push('/shamba')} accessibilityRole="button" style={styles.inlineEmpty}>
                  <Text style={[styles.empty, styles.flex]}>{t('home.seasonEmpty')}</Text>
                  <CaretRightIcon size={20} color={color.stone500} />
                </PressableScale>
              )}
            </Card>
          </Enter>

          {plotRows.length > 0 ? (
            <Enter step={3}>
              <SectionTitle>{t('home.byPlot')}</SectionTitle>
              <Card style={styles.plots}>
                <View style={[styles.legend, styles.legendTight]}>
                  <View style={styles.legendItem}>
                    <LegendDot c={color.forest900} />
                    <Text style={styles.legendTextLight}>{t('home.sold')}</Text>
                  </View>
                  <View style={styles.legendItem}>
                    <LegendDot c={color.stone300} />
                    <Text style={styles.legendTextLight}>{t('home.spent')}</Text>
                  </View>
                </View>
                {plotRows.map((r, i) => (
                  <View
                    key={r.id ?? 'farm'}
                    style={styles.plotRow}
                    accessible
                    accessibilityLabel={`${r.name}: ${t('home.sold')} ${formatKes(r.sold)}, ${t('home.spent')} ${formatKes(r.spent)}`}>
                    <View style={styles.plotHead}>
                      <Text style={styles.plotName} numberOfLines={1}>
                        {r.name}
                      </Text>
                      <Text style={[styles.plotNet, r.sold - r.spent >= 0 && styles.plotNetUp]}>
                        {r.sold - r.spent >= 0 ? '+' : '−'}
                        {formatKes(Math.abs(r.sold - r.spent))}
                      </Text>
                    </View>
                    <MeterBar value={r.sold / plotMax} barColor={color.forest900} delay={i * 80} />
                    <MeterBar value={r.spent / plotMax} barColor={color.stone300} delay={i * 80 + 40} />
                  </View>
                ))}
                <Text style={[styles.footnote, styles.footnoteTight]}>{t('home.byPlotHint')}</Text>
              </Card>
            </Enter>
          ) : null}

          {checks[0] ? (
            <Enter step={3}>
              <SectionTitle>{t('home.lastCheck')}</SectionTitle>
              <Card>
                <CheckRow check={checks[0]} showDate />
              </Card>
            </Enter>
          ) : null}

          {records.length > 0 ? (
            <Enter step={3}>
              <SectionTitle
                action={
                  <PressableScale onPress={() => router.push('/journal')} accessibilityRole="link" style={styles.link}>
                    <Text style={styles.linkText}>{t('home.seeAll')}</Text>
                  </PressableScale>
                }>
                {t('home.recent')}
              </SectionTitle>
              <Card style={styles.list}>
                {records.slice(0, 3).map((r, i) => (
                  <View key={r.id} style={i > 0 && styles.divider}>
                    <RecordRow record={r} plots={plots} showDate />
                  </View>
                ))}
              </Card>
            </Enter>
          ) : null}

          <Enter step={3}>
            <Card>
              <PressableScale onPress={() => router.push('/guides')} accessibilityRole="button" style={styles.task}>
                <View style={styles.taskIcon}>
                  <BookOpenTextIcon size={22} color={color.forest900} />
                </View>
                <View style={styles.flex}>
                  <Text style={styles.taskTitle}>{t('guides.entry')}</Text>
                  <Text style={styles.taskHint}>{t('guides.entryHint')}</Text>
                </View>
                <CaretRightIcon size={20} color={color.stone500} />
              </PressableScale>
            </Card>
          </Enter>
        </HeroBody>
      </ScrollView>
    </View>
  );
}

const onForestMuted = 'rgba(244,241,230,0.72)';

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.stone50 },
  scroll: { paddingBottom: space[8] + space[6] },
  flex: { flex: 1 },
  hero: { paddingHorizontal: space[4], paddingBottom: space[8], overflow: 'hidden', backgroundColor: color.forest950, gap: space[3] },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  date: { ...type.meta, color: onForestMuted },
  greeting: { ...type.display, fontSize: 30, lineHeight: 36, color: color.onForest, marginTop: space[2] },
  farm: { ...type.body, color: onForestMuted, marginTop: 2 },
  weather: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
    alignSelf: 'flex-start',
    marginTop: space[3],
    paddingHorizontal: space[3],
    paddingVertical: space[2],
    borderRadius: radius.full,
    backgroundColor: 'rgba(244,241,230,0.08)',
  },
  weatherText: { ...type.meta, fontFamily: font.regular, color: onForestMuted, flexShrink: 1 },
  panel: {
    marginTop: space[2],
    padding: space[4],
    paddingBottom: space[2],
    borderRadius: radius.md + 4,
    backgroundColor: 'rgba(244,241,230,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(244,241,230,0.12)',
  },
  panelLabel: { ...type.label, color: onForestMuted },
  netRow: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', columnGap: space[2], marginTop: space[1] },
  net: { fontFamily: font.semibold, fontSize: 32, lineHeight: 40, color: color.onForest, letterSpacing: -0.5 },
  netCaption: { ...type.meta, color: color.lime },
  legend: { flexDirection: 'row', flexWrap: 'wrap', columnGap: space[4], rowGap: space[1], marginTop: space[2], marginBottom: space[3] },
  legendTight: { marginTop: 0, marginBottom: 0 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  legendText: { ...type.meta, fontFamily: font.regular, color: onForestMuted },
  legendValue: { fontFamily: font.semibold, color: color.onForest },
  legendTextLight: { ...type.meta, fontFamily: font.regular, color: color.stone600 },
  moneyEmpty: { flexDirection: 'row', alignItems: 'center', gap: space[3], paddingVertical: space[3] },
  moneyEmptyText: { ...type.body, color: color.onForest, flex: 1 },
  body: {
    marginTop: -space[5],
    borderTopLeftRadius: radius.md + 8,
    borderTopRightRadius: radius.md + 8,
    backgroundColor: color.stone50,
    paddingHorizontal: space[4],
    paddingTop: space[3],
    gap: space[4],
  },
  list: { paddingVertical: space[1] },
  task: { flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 64, paddingVertical: space[2] },
  divider: { borderTopWidth: 1, borderTopColor: color.stone200 },
  taskIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: color.forest50, alignItems: 'center', justifyContent: 'center' },
  taskTitle: { ...type.bodyEmphasis, color: color.ink },
  taskHint: { ...type.meta, fontFamily: font.regular, color: color.stone600 },
  seasonRow: { alignItems: 'center', paddingVertical: space[2] },
  center: { alignItems: 'center' },
  centerValue: { fontFamily: font.semibold, fontSize: 24, lineHeight: 28, color: color.ink },
  centerLabel: { ...type.label, color: color.stone600 },
  seasonLegend: { marginTop: space[3] },
  seasonItem: { gap: 2, paddingVertical: space[3] },
  seasonHead: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  seasonName: { ...type.body, fontFamily: font.semibold, fontSize: 16, lineHeight: 22, color: color.ink, flex: 1 },
  seasonWeek: { ...type.meta, color: color.stone600 },
  seasonMeta: { fontFamily: font.regular, fontSize: 14, lineHeight: 20, color: color.stone600, marginLeft: 18 },
  ready: { fontFamily: font.semibold, color: color.forest900 },
  footnote: { fontFamily: font.regular, fontSize: 12, lineHeight: 16, color: color.stone500, marginTop: space[3] },
  footnoteTight: { marginTop: 0 },
  inlineEmpty: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  empty: { ...type.body, color: color.stone600 },
  plots: { gap: space[3] },
  plotRow: { gap: 6 },
  plotHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: space[3] },
  plotName: { ...type.body, fontFamily: font.medium, fontSize: 16, lineHeight: 22, color: color.ink, flexShrink: 1 },
  plotNet: { ...type.meta, fontFamily: font.semibold, color: color.stone600 },
  plotNetUp: { color: color.forest900 },
  link: { minHeight: 48, justifyContent: 'center', paddingHorizontal: space[1] },
  linkText: { ...type.meta, fontFamily: font.semibold, color: color.forest900, textDecorationLine: 'underline' },
});
