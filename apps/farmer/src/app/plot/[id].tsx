import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/button';
import { CalendarCard } from '@/components/calendar-card';
import { LegendDot, MeterBar, Rings } from '@/components/charts';
import { DarkHero, GlassPanel, HeroBody, onForestMuted } from '@/components/hero';
import { CameraIcon, CaretLeftIcon, NotebookIcon } from '@/components/icons';
import { Enter, PressableScale } from '@/components/motion';
import { CheckRow, RecordRow } from '@/components/record-row';
import { Card, SectionTitle } from '@/components/screen';
import { formatDate, localDay } from '@/lib/dates';
import { todayIso, useFarm, type CropCheck, type JournalRecord } from '@/lib/farm-store';
import { formatKes } from '@/lib/format';
import { PLOT_COLORS, plotMoney, seasonOf } from '@/lib/plot-stats';
import { color, font, radius, space, type } from '@/theme/tokens';

type Entry = { day: string; key: string; record?: JournalRecord; check?: CropCheck };

/** One plot: its season, money and everything recorded on it, with shortcuts to add more. */
export default function PlotScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { plots, records, checks } = useFarm();
  const index = plots.findIndex((p) => p.id === id);
  const plot = plots[index];
  const today = todayIso();
  const back = () => (router.canGoBack() ? router.back() : router.replace('/shamba'));

  if (!plot)
    return (
      <View style={[styles.root, styles.missing]}>
        <Text style={styles.body}>{t('shamba.notFound')}</Text>
        <Button variant="secondary" label={t('common.back')} onPress={back} />
      </View>
    );

  const season = seasonOf(plot, today);
  const money = plotMoney(records, plot.id, today);
  const net = money.sold - money.spent;
  const max = Math.max(1, money.sold, money.spent);
  const ring = PLOT_COLORS[index % PLOT_COLORS.length];

  const history: Entry[] = [
    ...records.filter((r) => r.plotId === plot.id).map((r) => ({ day: r.occurredOn, key: r.id, record: r })),
    ...checks.filter((c) => c.plotId === plot.id).map((c) => ({ day: localDay(c.createdAt), key: c.id, check: c })),
  ].sort((a, b) => (a.day === b.day ? (b.key > a.key ? 1 : -1) : b.day > a.day ? 1 : -1));

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <DarkHero>
          <Enter step={0} style={styles.heroTop}>
            <PressableScale onPress={back} accessibilityRole="button" accessibilityLabel={t('common.back')} scaleTo={0.92} style={styles.backBtn}>
              <CaretLeftIcon size={22} color={color.onForest} weight="bold" />
            </PressableScale>
          </Enter>
          <Enter step={0}>
            <Text style={styles.name} role="heading">
              {plot.name}
            </Text>
            <Text style={styles.sub}>
              {[t(`onboarding.crops.${plot.crop}`), plot.areaAcres != null ? t('shamba.acres', { count: plot.areaAcres }) : null].filter(Boolean).join(' · ')}
            </Text>
          </Enter>

          <Enter step={1}>
            <GlassPanel style={styles.seasonPanel}>
              {season ? (
                <>
                  <Rings
                    size={116}
                    stroke={12}
                    trackColor="rgba(244,241,230,0.14)"
                    rings={[{ key: plot.id, value: season.value, color: ring }]}
                    center={
                      <View style={styles.center}>
                        <Text style={styles.centerValue}>{season.week}</Text>
                        <Text style={styles.centerLabel}>{t('home.week', { n: '' }).trim()}</Text>
                      </View>
                    }
                  />
                  <View style={styles.flex}>
                    <Text style={styles.panelLabel}>{t('home.season')}</Text>
                    <Text style={styles.seasonBig}>
                      {season.weeksLeft > 0 ? t('home.weeksToGo', { count: season.weeksLeft }) : t('shamba.pastSeason')}
                    </Text>
                    <Text style={styles.seasonSmall}>{t('shamba.seasonOf', { week: season.week, total: season.totalWeeks })}</Text>
                  </View>
                </>
              ) : (
                <Text style={styles.seasonSmall}>{plot.plantedOn ? t('shamba.perennial') : t('shamba.noSeason')}</Text>
              )}
            </GlassPanel>
          </Enter>
        </DarkHero>

        <HeroBody>
          <Enter step={2} style={styles.actions}>
            <PressableScale
              onPress={() => router.push({ pathname: '/journal', params: { add: '1', plot: plot.id } })}
              accessibilityRole="button"
              containerStyle={styles.flex}
              style={styles.action}>
              <NotebookIcon size={22} color={color.forest900} />
              <Text style={styles.actionText}>{t('shamba.addRecord')}</Text>
            </PressableScale>
            <PressableScale
              onPress={() => router.push({ pathname: '/check', params: { plot: plot.id } })}
              accessibilityRole="button"
              containerStyle={styles.flex}
              style={[styles.action, styles.actionDark]}>
              <CameraIcon size={22} color={color.lime} weight="fill" />
              <Text style={[styles.actionText, styles.actionTextDark]}>{t('shamba.checkPlot')}</Text>
            </PressableScale>
          </Enter>

          <Enter step={2}>
            <CalendarCard plot={plot} />
          </Enter>

          <Enter step={2}>
            <SectionTitle>{t('shamba.details')}</SectionTitle>
            <Card style={styles.details}>
              <Detail label={t('shamba.cropLabel')} value={t(`onboarding.crops.${plot.crop}`)} />
              <Detail label={t('shamba.plantedLabel')} value={plot.plantedOn ? formatDate(plot.plantedOn, i18n.language) : t('shamba.notPlanted')} />
              <Detail label={t('shamba.sizeLabel')} value={plot.areaAcres != null ? t('shamba.acres', { count: plot.areaAcres }) : t('shamba.sizeMissing')} />
            </Card>
          </Enter>

          {money.sold || money.spent ? (
            <Enter step={3}>
              <SectionTitle>{t('shamba.money')}</SectionTitle>
              <Card style={styles.money}>
                <Text style={[styles.net, net >= 0 && styles.netUp]}>
                  {net >= 0 ? '+' : '−'}
                  {formatKes(Math.abs(net))}
                </Text>
                <View style={styles.moneyRow}>
                  <View style={styles.moneyHead}>
                    <LegendDot c={color.forest900} />
                    <Text style={styles.moneyLabel}>{t('home.sold')}</Text>
                    <Text style={styles.moneyValue}>{formatKes(money.sold)}</Text>
                  </View>
                  <MeterBar value={money.sold / max} barColor={color.forest900} />
                </View>
                <View style={styles.moneyRow}>
                  <View style={styles.moneyHead}>
                    <LegendDot c={color.stone300} />
                    <Text style={styles.moneyLabel}>{t('home.spent')}</Text>
                    <Text style={styles.moneyValue}>{formatKes(money.spent)}</Text>
                  </View>
                  <MeterBar value={money.spent / max} barColor={color.stone300} delay={60} />
                </View>
              </Card>
            </Enter>
          ) : null}

          <Enter step={3}>
            <SectionTitle>{t('shamba.history')}</SectionTitle>
            <Card style={styles.list}>
              {history.length === 0 ? (
                <Text style={styles.empty}>{t('shamba.noHistory')}</Text>
              ) : (
                history.map((e, i) => (
                  <View key={e.key} style={i > 0 && styles.divider}>
                    {e.record ? <RecordRow record={e.record} plots={plots} showDate hidePlot /> : <CheckRow check={e.check!} showDate />}
                  </View>
                ))
              )}
            </Card>
          </Enter>
        </HeroBody>
      </ScrollView>
    </View>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detail}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.stone50 },
  missing: { justifyContent: 'center', padding: space[5], gap: space[4] },
  scroll: { paddingBottom: space[8] },
  flex: { flex: 1 },
  heroTop: { flexDirection: 'row' },
  backBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(244,241,230,0.12)' },
  name: { ...type.display, fontSize: 30, lineHeight: 36, color: color.onForest, marginTop: space[2] },
  sub: { ...type.body, color: onForestMuted, marginTop: 2 },
  seasonPanel: { flexDirection: 'row', alignItems: 'center', gap: space[4], marginTop: space[2] },
  center: { alignItems: 'center' },
  centerValue: { fontFamily: font.semibold, fontSize: 28, lineHeight: 32, color: color.onForest },
  centerLabel: { ...type.label, color: onForestMuted },
  panelLabel: { ...type.label, color: onForestMuted },
  seasonBig: { fontFamily: font.semibold, fontSize: 18, lineHeight: 24, color: color.onForest, marginTop: space[1] },
  seasonSmall: { ...type.meta, fontFamily: font.regular, color: onForestMuted, marginTop: space[1] },
  actions: { flexDirection: 'row', gap: space[3] },
  action: {
    minHeight: 56,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.stone200,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space[2],
    paddingHorizontal: space[3],
  },
  actionDark: { backgroundColor: color.forest900, borderColor: color.forest900 },
  actionText: { ...type.meta, fontFamily: font.semibold, color: color.forest900, flexShrink: 1 },
  actionTextDark: { color: color.onForest },
  details: { paddingVertical: space[1] },
  detail: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: space[3], gap: space[3] },
  detailLabel: { ...type.body, color: color.stone600 },
  detailValue: { ...type.body, fontFamily: font.medium, color: color.ink, flexShrink: 1, textAlign: 'right' },
  money: { gap: space[3] },
  net: { fontFamily: font.semibold, fontSize: 26, lineHeight: 32, color: color.ink },
  netUp: { color: color.forest900 },
  moneyRow: { gap: 6 },
  moneyHead: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  moneyLabel: { ...type.meta, fontFamily: font.regular, color: color.stone600, flex: 1 },
  moneyValue: { ...type.meta, fontFamily: font.semibold, color: color.ink },
  list: { paddingVertical: space[1] },
  divider: { borderTopWidth: 1, borderTopColor: color.stone200 },
  empty: { ...type.body, color: color.stone600, paddingVertical: space[2] },
  body: { ...type.body, color: color.stone600, textAlign: 'center' },
});
