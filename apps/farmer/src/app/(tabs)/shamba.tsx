import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/button';
import { LegendDot, MeterBar } from '@/components/charts';
import { ChoiceChip } from '@/components/choice';
import { Checkbox, FieldLabel, FieldMessage, TextField } from '@/components/fields';
import { DarkHero, GlassPanel, HeroBody, onForestMuted } from '@/components/hero';
import { CaretRightIcon, DropIcon, PlantIcon, PlusIcon, RulerIcon } from '@/components/icons';
import { Enter, PressableScale } from '@/components/motion';
import { KIND_ICON } from '@/components/record-row';
import { Card, SectionTitle } from '@/components/screen';
import { Sheet } from '@/components/sheet';
import { useAuth } from '@/lib/auth';
import { formatDate, parseDmy, relativeDay } from '@/lib/dates';
import { todayIso, useFarm, type Plot } from '@/lib/farm-store';
import { formatKes, formatQty, parseAmount } from '@/lib/format';
import { CROPS, expectedPlots, type Crop } from '@/lib/onboarding';
import { farmAcres, PLOT_COLORS, PLOT_TINTS, plotMoney, seasonOf } from '@/lib/plot-stats';
import { color, font, radius, space, type } from '@/theme/tokens';

export default function ShambaScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ add?: string }>();
  const { user } = useAuth();
  const { plots } = useFarm();
  const [adding, setAdding] = useState(false);
  const farm = user?.farm;
  const total = expectedPlots(farm?.plots);

  // Home's "Add your plots" task lands here with the form already open.
  useEffect(() => {
    if (params.add) {
      setAdding(true);
      router.setParams({ add: undefined });
    }
  }, [params.add, router]);

  const measured = plots.filter((p) => p.areaAcres != null);
  const used = measured.reduce((a, p) => a + (p.areaAcres ?? 0), 0);
  const farmTotal = farmAcres(farm?.size);
  const barTotal = Math.max(used, farmTotal ?? used, 0.0001);

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <DarkHero>
          <Enter step={0} style={styles.heroTop}>
            <Text style={styles.eyebrow}>{t('shamba.title')}</Text>
            <View style={styles.countChip}>
              <PlantIcon size={14} color={color.onForest} weight="fill" />
              <Text style={styles.countText}>{t('shamba.plotCount', { count: plots.length })}</Text>
            </View>
          </Enter>
          <Enter step={0}>
            <Text style={styles.farmName} role="heading">
              {farm?.farmName ?? t('shamba.title')}
            </Text>
            {farm ? <Text style={styles.place}>{[farm.ward, farm.county].filter(Boolean).join(', ')}</Text> : null}
            {farm ? (
              <View style={styles.facts}>
                <View style={styles.fact}>
                  <RulerIcon size={16} color={color.onForest} />
                  <Text style={styles.factText}>{t(`onboarding.size.${farm.size}`)}</Text>
                </View>
                {farm.water ? (
                  <View style={styles.fact}>
                    <DropIcon size={16} color={color.onForest} />
                    <Text style={styles.factText}>{t(`onboarding.water.${farm.water}`)}</Text>
                  </View>
                ) : null}
              </View>
            ) : null}
          </Enter>

          {measured.length > 0 ? (
            <Enter step={1}>
              <GlassPanel>
                <Text style={styles.panelLabel}>{t('shamba.landUse')}</Text>
                <Text style={styles.big}>
                  {farmTotal
                    ? t('shamba.acresUsed', { used: formatQty(used), total: farmTotal })
                    : t('shamba.acresUsedNoTotal', { used: formatQty(used) })}
                </Text>
                <View style={styles.landBar} accessibilityElementsHidden>
                  {plots.map((p, i) =>
                    p.areaAcres ? (
                      <View
                        key={p.id}
                        style={[styles.landSeg, { flex: p.areaAcres / barTotal, backgroundColor: PLOT_COLORS[i % PLOT_COLORS.length] }]}
                      />
                    ) : null,
                  )}
                  {barTotal > used ? <View style={{ flex: (barTotal - used) / barTotal }} /> : null}
                </View>
                <View style={styles.landLegend}>
                  {plots.map((p, i) => (
                    <View key={p.id} style={styles.landItem}>
                      <LegendDot c={PLOT_COLORS[i % PLOT_COLORS.length]} />
                      <Text style={styles.landName} numberOfLines={1}>
                        {p.name}
                      </Text>
                      <Text style={styles.landValue}>
                        {p.areaAcres != null ? t('shamba.acres', { count: Number(formatQty(p.areaAcres)) }) : t('shamba.sizeMissing')}
                      </Text>
                    </View>
                  ))}
                </View>
              </GlassPanel>
            </Enter>
          ) : null}
        </DarkHero>

        <HeroBody>
          <Enter step={2}>
            <SectionTitle
              action={
                plots.length > 0 ? (
                  <PressableScale onPress={() => setAdding(true)} accessibilityRole="button" accessibilityLabel={t('shamba.addPlot')} style={styles.addBtn}>
                    <PlusIcon size={18} color={color.onForest} weight="bold" />
                    <Text style={styles.addText}>{t('shamba.addPlot')}</Text>
                  </PressableScale>
                ) : undefined
              }>
              {t('shamba.plots')}
            </SectionTitle>
            {plots.length < total ? (
              <>
                <Text style={styles.progress}>{t('shamba.plotsProgress', { done: plots.length, total })}</Text>
                <View style={styles.bar}>
                  <View style={[styles.barFill, { width: `${Math.min(1, plots.length / total) * 100}%` }]} />
                </View>
              </>
            ) : null}
          </Enter>

          {plots.length === 0 ? (
            <Enter step={3}>
              <Card style={styles.emptyCard}>
                <View style={styles.emptyIcon}>
                  <PlantIcon size={32} color={color.forest900} />
                </View>
                <Text style={styles.emptyText}>{t('shamba.noPlots')}</Text>
                <Button label={t('shamba.addPlot')} onPress={() => setAdding(true)} />
              </Card>
            </Enter>
          ) : (
            plots.map((p, i) => (
              <Enter key={p.id} step={Math.min(3, i + 2)}>
                <PlotCard plot={p} index={i} onPress={() => router.push({ pathname: '/plot/[id]', params: { id: p.id } })} />
              </Enter>
            ))
          )}
        </HeroBody>
      </ScrollView>

      <AddPlotSheet open={adding} onClose={() => setAdding(false)} crops={farm?.crops} />
    </View>
  );
}

function PlotCard({ plot, index, onPress }: { plot: Plot; index: number; onPress: () => void }) {
  const { t, i18n } = useTranslation();
  const { records } = useFarm();
  const today = todayIso();
  const season = seasonOf(plot, today);
  const last = records.find((r) => r.plotId === plot.id);
  const money = plotMoney(records, plot.id, today);
  const net = money.sold - money.spent;
  const tint = PLOT_TINTS[index % PLOT_TINTS.length];
  const LastIcon = last ? KIND_ICON[last.kind] : null;

  return (
    <PressableScale onPress={onPress} accessibilityRole="button" accessibilityLabel={t('shamba.openPlot', { name: plot.name })}>
      <Card style={styles.plot}>
        <View style={styles.plotTop}>
          <View style={[styles.plotIcon, { backgroundColor: `${tint}1A` }]}>
            <PlantIcon size={24} color={tint} weight="fill" />
          </View>
          <View style={styles.flex}>
            <Text style={styles.plotName}>{plot.name}</Text>
            <Text style={styles.plotCrop}>
              {[t(`onboarding.crops.${plot.crop}`), plot.areaAcres != null ? t('shamba.acres', { count: plot.areaAcres }) : null].filter(Boolean).join(' · ')}
            </Text>
          </View>
          <CaretRightIcon size={20} color={color.stone500} />
        </View>

        {season ? (
          <View style={styles.season}>
            <MeterBar value={season.value} barColor={tint} delay={index * 80} />
            <View style={styles.seasonRow}>
              <Text style={styles.seasonText}>{t('shamba.seasonOf', { week: season.week, total: season.totalWeeks })}</Text>
              <Text style={[styles.seasonText, styles.seasonRight, season.weeksLeft <= 0 && styles.ready]}>
                {season.weeksLeft > 0 ? t('home.weeksToGo', { count: season.weeksLeft }) : t('shamba.pastSeason')}
              </Text>
            </View>
          </View>
        ) : (
          <Text style={styles.muted}>
            {plot.plantedOn && plot.plantedOn > todayIso()
              ? t('shamba.plannedFor', { date: formatDate(plot.plantedOn, i18n.language) })
              : plot.plantedOn
                ? t('shamba.perennial')
                : t('shamba.noSeason')}
          </Text>
        )}

        <View style={styles.plotFoot}>
          <View style={styles.lastRow}>
            {LastIcon ? <LastIcon size={16} color={color.stone600} /> : null}
            <Text style={styles.lastText} numberOfLines={1}>
              {last
                ? t('shamba.lastActivity', { what: last.note || t(`journal.${last.kind}`), when: relativeDay(last.occurredOn, i18n.language, t) })
                : t('shamba.noActivity')}
            </Text>
          </View>
          {money.sold || money.spent ? (
            <Text style={[styles.net, net >= 0 && styles.netUp]}>
              {net >= 0 ? '+' : '−'}
              {formatKes(Math.abs(net))}
            </Text>
          ) : null}
        </View>
      </Card>
    </PressableScale>
  );
}

function AddPlotSheet({ open, onClose, crops }: { open: boolean; onClose: () => void; crops?: Crop[] }) {
  const { t } = useTranslation();
  const { addPlot } = useFarm();
  const options = crops?.length ? crops : CROPS.filter((c) => c !== 'other');
  const [name, setName] = useState('');
  const [crop, setCrop] = useState<Crop | null>(null);
  const [date, setDate] = useState('');
  const [notPlanted, setNotPlanted] = useState(false);
  const [area, setArea] = useState('');
  const [tried, setTried] = useState(false);

  useEffect(() => {
    if (open) {
      setName('');
      setCrop(options[0] ?? null);
      setDate('');
      setNotPlanted(false);
      setArea('');
      setTried(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const plantedOn = notPlanted || !date.trim() ? null : parseDmy(date, 92);
  const nameError = tried && !name.trim() ? t('shamba.plotNameRequired') : null;
  const dateError = tried && !notPlanted && date.trim() && !plantedOn ? (parseDmy(date, 36500) ? t('shamba.plantedOnTooFar') : t('shamba.plantedOnInvalid')) : null;

  const save = () => {
    setTried(true);
    if (!name.trim() || !crop || (!notPlanted && date.trim() && !plantedOn)) return;
    addPlot({ name: name.trim(), crop, plantedOn, areaAcres: parseAmount(area) });
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('shamba.newPlot')}
      footer={
        <>
          <Button label={t('shamba.save')} onPress={save} />
          <Button variant="text" label={t('shamba.cancel')} onPress={onClose} />
        </>
      }>
      <FieldLabel>{t('shamba.plotName')}</FieldLabel>
      <TextField
        value={name}
        onChangeText={setName}
        placeholder={t('shamba.plotNamePlaceholder')}
        invalid={!!nameError}
        accessibilityLabel={t('shamba.plotName')}
        autoCapitalize="sentences"
      />
      <FieldMessage error={nameError} />

      <FieldLabel>{t('shamba.crop')}</FieldLabel>
      <View style={styles.chips} role="radiogroup">
        {options.map((c) => (
          <ChoiceChip key={c} single label={t(`onboarding.crops.${c}`)} selected={crop === c} onPress={() => setCrop(c)} />
        ))}
      </View>

      <View style={styles.gap} />
      <FieldLabel optional={t('common.optional')}>{t('shamba.plantedOn')}</FieldLabel>
      {!notPlanted ? (
        <TextField
          value={date}
          onChangeText={setDate}
          placeholder={t('shamba.plantedOnPlaceholder')}
          keyboardType="numbers-and-punctuation"
          invalid={!!dateError}
          accessibilityLabel={t('shamba.plantedOn')}
          maxLength={10}
        />
      ) : null}
      <FieldMessage error={dateError} />
      <Checkbox checked={notPlanted} onChange={setNotPlanted}>
        <Text style={styles.checkLabel}>{t('shamba.notPlantedYet')}</Text>
      </Checkbox>

      <View style={styles.gap} />
      <FieldLabel optional={t('common.optional')}>{t('shamba.area')}</FieldLabel>
      <TextField value={area} onChangeText={setArea} placeholder={t('shamba.areaPlaceholder')} keyboardType="decimal-pad" accessibilityLabel={t('shamba.area')} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.stone50 },
  scroll: { paddingBottom: space[8] + space[6] },
  flex: { flex: 1 },
  gap: { height: space[2] },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  eyebrow: { ...type.label, color: onForestMuted, letterSpacing: 0.4 },
  countChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: space[3],
    minHeight: 30,
    borderRadius: radius.full,
    backgroundColor: 'rgba(244,241,230,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(244,241,230,0.22)',
  },
  countText: { ...type.meta, color: color.onForest },
  farmName: { ...type.display, fontSize: 30, lineHeight: 36, color: color.onForest, marginTop: space[1] },
  place: { ...type.body, color: onForestMuted, marginTop: 2 },
  facts: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2], marginTop: space[3] },
  fact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: space[3],
    paddingVertical: 6,
    borderRadius: radius.full,
    backgroundColor: 'rgba(244,241,230,0.08)',
  },
  factText: { ...type.meta, fontFamily: font.regular, color: color.onForest },
  panelLabel: { ...type.label, color: onForestMuted },
  big: { fontFamily: font.semibold, fontSize: 22, lineHeight: 28, color: color.onForest, marginTop: space[1] },
  landBar: {
    flexDirection: 'row',
    height: 12,
    borderRadius: 6,
    overflow: 'hidden',
    gap: 3,
    marginTop: space[3],
    backgroundColor: 'rgba(244,241,230,0.12)',
  },
  landSeg: { height: 12, borderRadius: 6 },
  landLegend: { marginTop: space[3], gap: space[2] },
  landItem: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  landName: { ...type.meta, fontFamily: font.regular, color: color.onForest, flex: 1 },
  landValue: { ...type.meta, color: onForestMuted },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[1],
    minHeight: 40,
    paddingHorizontal: space[3],
    borderRadius: radius.full,
    backgroundColor: color.forest900,
  },
  addText: { ...type.meta, fontFamily: font.semibold, color: color.onForest },
  progress: { ...type.meta, fontFamily: font.regular, color: color.stone600 },
  bar: { height: 6, borderRadius: 3, backgroundColor: color.stone200, marginTop: space[2], overflow: 'hidden' },
  barFill: { height: 6, borderRadius: 3, backgroundColor: color.forest900 },
  emptyCard: { alignItems: 'center', gap: space[3], paddingVertical: space[6] },
  emptyIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: color.forest50, alignItems: 'center', justifyContent: 'center' },
  emptyText: { ...type.body, color: color.stone600, textAlign: 'center', marginBottom: space[2] },
  plot: { gap: space[3] },
  plotTop: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  plotIcon: { width: 48, height: 48, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  plotName: { ...type.bodyEmphasis, color: color.ink },
  plotCrop: { ...type.meta, fontFamily: font.regular, color: color.stone600 },
  season: { gap: 6 },
  seasonRow: { flexDirection: 'row', justifyContent: 'space-between', gap: space[3] },
  seasonText: { fontFamily: font.medium, fontSize: 13, lineHeight: 18, color: color.stone600, flexShrink: 1 },
  seasonRight: { textAlign: 'right' },
  ready: { fontFamily: font.semibold, color: color.forest900 },
  muted: { ...type.meta, fontFamily: font.regular, color: color.stone500 },
  plotFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space[3],
    paddingTop: space[3],
    borderTopWidth: 1,
    borderTopColor: color.stone200,
  },
  lastRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  lastText: { ...type.meta, fontFamily: font.regular, color: color.stone600, flexShrink: 1 },
  net: { ...type.meta, fontFamily: font.semibold, color: color.stone600 },
  netUp: { color: color.forest900 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: space[2] },
  checkLabel: { ...type.body, color: color.ink },
});
