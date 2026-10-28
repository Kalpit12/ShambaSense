import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/button';
import { ChoiceChip, ChoiceRow } from '@/components/choice';
import { FieldLabel, FieldMessage, TextField } from '@/components/fields';
import { PlusIcon } from '@/components/icons';
import { Enter, PressableScale } from '@/components/motion';
import { CheckRow, RecordRow } from '@/components/record-row';
import { LegendDot } from '@/components/charts';
import { DarkHero, GlassPanel, HeroBody, onForestMuted } from '@/components/hero';
import { Card } from '@/components/screen';
import { Sheet } from '@/components/sheet';
import { formatDate, localDay, parseDmy, relativeDay, shiftDays, shortDate } from '@/lib/dates';
import { todayIso, UNITS, useFarm, type CropCheck, type JournalRecord, type RecordKind, type Unit } from '@/lib/farm-store';
import { formatKes, parseAmount } from '@/lib/format';
import { color, font, radius, space, type } from '@/theme/tokens';

type Filter = 'all' | RecordKind | 'check';
const FILTERS: Filter[] = ['all', 'work', 'input', 'expense', 'harvest', 'sale', 'check'];
const KINDS: RecordKind[] = ['work', 'input', 'expense', 'harvest', 'sale'];

type Entry = { day: string; key: string; record?: JournalRecord; check?: CropCheck };

export default function JournalScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ add?: string; plot?: string }>();
  const { records, checks, plots } = useFarm();
  const [filter, setFilter] = useState<Filter>('all');
  const [adding, setAdding] = useState(false);
  const [presetPlot, setPresetPlot] = useState<string | null>(null);

  // Home and the plot page open the form directly, the plot page with its plot already picked.
  useEffect(() => {
    if (params.add) {
      setPresetPlot(params.plot ?? null);
      setAdding(true);
      router.setParams({ add: undefined, plot: undefined });
    }
  }, [params.add, params.plot, router]);

  // Records and crop checks share one ledger, newest day first.
  const groups = useMemo(() => {
    const entries: Entry[] = [];
    if (filter !== 'check')
      for (const r of records) if (filter === 'all' || r.kind === filter) entries.push({ day: r.occurredOn, key: r.id, record: r });
    if (filter === 'all' || filter === 'check') for (const c of checks) entries.push({ day: localDay(c.createdAt), key: c.id, check: c });
    entries.sort((a, b) => (a.day === b.day ? (b.key > a.key ? 1 : -1) : b.day > a.day ? 1 : -1));
    const out: { day: string; items: Entry[] }[] = [];
    for (const e of entries) {
      const last = out[out.length - 1];
      if (last?.day === e.day) last.items.push(e);
      else out.push({ day: e.day, items: [e] });
    }
    return out;
  }, [records, checks, filter]);

  const today = todayIso();
  const month = today.slice(0, 7);
  const monthRecords = records.filter((r) => r.occurredOn.startsWith(month) && r.amountKes != null);
  const spent = monthRecords.filter((r) => r.kind !== 'sale').reduce((s, r) => s + (r.amountKes ?? 0), 0);
  const sold = monthRecords.filter((r) => r.kind === 'sale').reduce((s, r) => s + (r.amountKes ?? 0), 0);
  const net = sold - spent;
  const isEmpty = records.length === 0 && checks.length === 0;

  // Four weeks of activity, one square per day, oldest first.
  const days = Array.from({ length: 28 }, (_, i) => shiftDays(today, i - 27));
  const perDay = new Map<string, number>();
  for (const r of records) perDay.set(r.occurredOn, (perDay.get(r.occurredOn) ?? 0) + 1);
  for (const c of checks) perDay.set(localDay(c.createdAt), (perDay.get(localDay(c.createdAt)) ?? 0) + 1);
  const activeDays = days.filter((d) => perDay.get(d)).length;

  const openAdd = () => {
    setPresetPlot(null);
    setAdding(true);
  };

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <DarkHero>
          <Enter step={0} style={styles.heroTop}>
            <Text style={styles.title} role="heading">
              {t('journal.title')}
            </Text>
            <PressableScale onPress={openAdd} accessibilityRole="button" accessibilityLabel={t('journal.add')} style={styles.addBtn}>
              <PlusIcon size={18} color={color.forest900} weight="bold" />
              <Text style={styles.addText}>{t('journal.add')}</Text>
            </PressableScale>
          </Enter>

          <Enter step={1}>
            <GlassPanel>
              <Text style={styles.panelLabel}>{t('journal.thisMonth')}</Text>
              <View style={styles.moneyRow}>
                <View style={styles.flex}>
                  <View style={styles.moneyHead}>
                    <LegendDot c={color.lime} />
                    <Text style={styles.moneyLabel}>{t('journal.sold')}</Text>
                  </View>
                  <Text style={styles.moneyValue}>{formatKes(sold)}</Text>
                </View>
                <View style={styles.flex}>
                  <View style={styles.moneyHead}>
                    <LegendDot c="rgba(244,241,230,0.7)" dashed />
                    <Text style={styles.moneyLabel}>{t('journal.spent')}</Text>
                  </View>
                  <Text style={styles.moneyValue}>{formatKes(spent)}</Text>
                </View>
              </View>
              {monthRecords.length > 0 ? (
                <MoneySplit sold={sold} spent={spent} />
              ) : null}
              <Text style={[styles.net, net < 0 && styles.netDown]}>
                {t('journal.net')} {net >= 0 ? '+' : '−'}
                {formatKes(Math.abs(net))}
              </Text>
            </GlassPanel>
          </Enter>

          <Enter step={2}>
            <GlassPanel>
              <View style={styles.activityHead}>
                <Text style={styles.panelLabel}>{t('journal.activity')}</Text>
                <Text style={styles.activityCount}>{t('journal.activeDays', { count: activeDays })}</Text>
              </View>
              <View style={styles.grid} accessible accessibilityLabel={t('journal.activeDays', { count: activeDays })}>
                {days.map((d) => {
                  const n = perDay.get(d) ?? 0;
                  return (
                    <View
                      key={d}
                      style={[
                        styles.cell,
                        { backgroundColor: n === 0 ? 'rgba(244,241,230,0.08)' : n === 1 ? 'rgba(196,239,90,0.4)' : n === 2 ? 'rgba(196,239,90,0.7)' : color.lime },
                        d === today && styles.cellToday,
                      ]}
                    />
                  );
                })}
              </View>
              <View style={styles.gridFoot}>
                <Text style={styles.gridLabel}>{shortDate(days[0], i18n.language)}</Text>
                <Text style={styles.gridLabel}>{t('dates.today')}</Text>
              </View>
            </GlassPanel>
          </Enter>
        </DarkHero>

        <HeroBody>
          {!isEmpty ? (
            <Enter step={2}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters} style={styles.filterScroll}>
                {FILTERS.map((f) => (
                  <FilterChip key={f} label={t(`journal.${f}`)} selected={filter === f} onPress={() => setFilter(f)} />
                ))}
              </ScrollView>
            </Enter>
          ) : null}

          {isEmpty ? (
            <Enter step={2}>
              <Card style={styles.emptyCard}>
                <Text style={styles.emptyText}>{t('journal.empty')}</Text>
                <Button label={t('journal.add')} onPress={openAdd} />
              </Card>
            </Enter>
          ) : groups.length === 0 ? (
            <Text style={styles.emptyText}>{t('journal.emptyFilter')}</Text>
          ) : (
            groups.map((g, i) => {
              const dayNet = g.items.reduce(
                (s, e) => s + (e.record?.amountKes == null ? 0 : e.record.kind === 'sale' ? e.record.amountKes : e.record.kind === 'harvest' || e.record.kind === 'work' ? 0 : -e.record.amountKes),
                0,
              );
              return (
                <Enter key={g.day} step={Math.min(3, i + 2)}>
                  <View style={styles.dayRow}>
                    <Text style={styles.day}>{relativeDay(g.day, i18n.language, t)}</Text>
                    {dayNet !== 0 ? (
                      <Text style={[styles.dayNet, dayNet > 0 && styles.dayNetUp]}>
                        {dayNet > 0 ? '+' : '−'}
                        {formatKes(Math.abs(dayNet))}
                      </Text>
                    ) : null}
                  </View>
                  <Card style={styles.list}>
                    {g.items.map((e, j) => (
                      <View key={e.key} style={j > 0 && styles.divider}>
                        {e.record ? <RecordRow record={e.record} plots={plots} /> : <CheckRow check={e.check!} />}
                      </View>
                    ))}
                  </Card>
                </Enter>
              );
            })
          )}
        </HeroBody>
      </ScrollView>

      <AddRecordSheet open={adding} onClose={() => setAdding(false)} presetPlot={presetPlot} />
    </View>
  );
}

/** Sold against spent as one split bar: lime for money in, cream for money out. */
function MoneySplit({ sold, spent }: { sold: number; spent: number }) {
  const total = Math.max(1, sold + spent);
  return (
    <View style={styles.split} accessibilityElementsHidden>
      {sold > 0 ? <View style={[styles.splitSeg, { flex: sold / total, backgroundColor: color.lime }]} /> : null}
      {spent > 0 ? <View style={[styles.splitSeg, { flex: spent / total, backgroundColor: 'rgba(244,241,230,0.55)' }]} /> : null}
    </View>
  );
}

function FilterChip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <PressableScale
      onPress={onPress}
      role="radio"
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      style={[styles.filter, selected && styles.filterOn]}>
      <Text style={[styles.filterText, selected && styles.filterTextOn]}>{label}</Text>
    </PressableScale>
  );
}

const NEEDS_QTY: RecordKind[] = ['input', 'harvest', 'sale'];
const NEEDS_MONEY: RecordKind[] = ['input', 'expense', 'sale'];

/** Two steps in one sheet: what happened, then the few details that kind needs. */
function AddRecordSheet({ open, onClose, presetPlot }: { open: boolean; onClose: () => void; presetPlot: string | null }) {
  const { t, i18n } = useTranslation();
  const { plots, addRecord } = useFarm();
  const [kind, setKind] = useState<RecordKind | null>(null);
  const [plotId, setPlotId] = useState<string | null>(null);
  const [when, setWhen] = useState<'today' | 'yesterday' | 'other'>('today');
  const [otherDate, setOtherDate] = useState('');
  const [qty, setQty] = useState('');
  const [unit, setUnit] = useState<Unit>('kg');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setKind(null);
      setPlotId(presetPlot && plots.some((p) => p.id === presetPlot) ? presetPlot : plots.length === 1 ? plots[0].id : null);
      setWhen('today');
      setOtherDate('');
      setQty('');
      setUnit('kg');
      setAmount('');
      setNote('');
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const today = todayIso();
  const occurredOn = when === 'today' ? today : when === 'yesterday' ? shiftDays(today, -1) : parseDmy(otherDate);

  const save = () => {
    if (!kind) return;
    if (!occurredOn) return setError(t('journal.dateInvalid'));
    const quantity = NEEDS_QTY.includes(kind) ? parseAmount(qty) : null;
    const amountKes = NEEDS_MONEY.includes(kind) ? parseAmount(amount) : null;
    if (!note.trim() && quantity == null && amountKes == null) return setError(t('journal.needsSomething'));
    addRecord({ kind, plotId, occurredOn, quantity, unit: quantity != null ? unit : null, amountKes, note: note.trim() });
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={kind ? t(`journal.${kind}`) : t('journal.whatHappened')}
      footer={
        kind ? (
          <>
            <FieldMessage error={error} />
            <Button label={t('journal.save')} onPress={save} />
            <Button variant="text" label={t('journal.change')} onPress={() => setKind(null)} />
          </>
        ) : undefined
      }>
      {!kind ? (
        KINDS.map((k) => <ChoiceRow key={k} label={t(`journal.${k}`)} hint={t(`journal.${k}Hint`)} selected={false} onPress={() => setKind(k)} />)
      ) : (
        renderForm(kind)
      )}
    </Sheet>
  );

  // A plain render function, not a component, so typing does not remount the inputs.
  function renderForm(kind: RecordKind) {
    return (
      <>
      {plots.length > 0 ? (
        <>
          <FieldLabel>{t('journal.plot')}</FieldLabel>
          <View style={styles.chips} role="radiogroup">
            <ChoiceChip single label={t('journal.noPlot')} selected={plotId === null} onPress={() => setPlotId(null)} />
            {plots.map((p) => (
              <ChoiceChip key={p.id} single label={p.name} selected={plotId === p.id} onPress={() => setPlotId(p.id)} />
            ))}
          </View>
          <View style={styles.gap} />
        </>
      ) : null}

      <FieldLabel>{t('journal.date')}</FieldLabel>
      <View style={styles.chips} role="radiogroup">
        <ChoiceChip single label={t('dates.today')} selected={when === 'today'} onPress={() => setWhen('today')} />
        <ChoiceChip single label={t('dates.yesterday')} selected={when === 'yesterday'} onPress={() => setWhen('yesterday')} />
        <ChoiceChip single label={t('journal.earlier')} selected={when === 'other'} onPress={() => setWhen('other')} />
      </View>
      {when === 'other' ? (
        <TextField value={otherDate} onChangeText={setOtherDate} placeholder={t('shamba.plantedOnPlaceholder')} keyboardType="numbers-and-punctuation" maxLength={10} accessibilityLabel={t('journal.date')} />
      ) : (
        <Text style={styles.dateEcho}>{formatDate(occurredOn ?? today, i18n.language)}</Text>
      )}

      {NEEDS_QTY.includes(kind) ? (
        <>
          <View style={styles.gap} />
          <FieldLabel optional={t('common.optional')}>{t('journal.quantity')}</FieldLabel>
          <TextField value={qty} onChangeText={setQty} placeholder="0" keyboardType="decimal-pad" accessibilityLabel={t('journal.quantity')} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
            {UNITS.map((u) => (
              <FilterChip key={u} label={t(`journal.units.${u}`)} selected={unit === u} onPress={() => setUnit(u)} />
            ))}
          </ScrollView>
        </>
      ) : null}

      {NEEDS_MONEY.includes(kind) ? (
        <>
          <View style={styles.gap} />
          <FieldLabel optional={t('common.optional')}>{t('journal.amount')}</FieldLabel>
          <TextField value={amount} onChangeText={setAmount} placeholder="0" keyboardType="number-pad" accessibilityLabel={t('journal.amount')} />
        </>
      ) : null}

      <View style={styles.gap} />
      <FieldLabel optional={t('common.optional')}>{t('journal.note')}</FieldLabel>
      <TextField
        value={note}
        onChangeText={setNote}
        placeholder={kind === 'work' ? t('journal.notePlaceholderWork') : t('journal.notePlaceholder')}
        accessibilityLabel={t('journal.note')}
        autoCapitalize="sentences"
      />
      </>
    );
  }
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gap: { height: space[2] },
  root: { flex: 1, backgroundColor: color.stone50 },
  scroll: { paddingBottom: space[8] + space[6] },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[3] },
  title: { ...type.display, fontSize: 30, lineHeight: 36, color: color.onForest, flexShrink: 1 },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[1],
    minHeight: 40,
    paddingHorizontal: space[3],
    borderRadius: radius.full,
    backgroundColor: color.onForest,
  },
  addText: { ...type.meta, fontFamily: font.semibold, color: color.forest900 },
  panelLabel: { ...type.label, color: onForestMuted },
  moneyRow: { flexDirection: 'row', gap: space[4], marginTop: space[3] },
  moneyHead: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  moneyLabel: { ...type.meta, fontFamily: font.regular, color: onForestMuted },
  moneyValue: { fontFamily: font.semibold, fontSize: 24, lineHeight: 30, color: color.onForest, marginTop: 2 },
  split: { flexDirection: 'row', height: 10, gap: 3, marginTop: space[3], borderRadius: 5, overflow: 'hidden' },
  splitSeg: { height: 10, borderRadius: 5 },
  net: { ...type.meta, color: color.lime, marginTop: space[3] },
  netDown: { color: color.onForest },
  activityHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  activityCount: { ...type.meta, color: color.onForest },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: space[3] },
  cell: { width: '12%', aspectRatio: 1, flexGrow: 1, borderRadius: 6 },
  cellToday: { borderWidth: 2, borderColor: color.onForest },
  gridFoot: { flexDirection: 'row', justifyContent: 'space-between', marginTop: space[2] },
  gridLabel: { fontFamily: font.medium, fontSize: 12, lineHeight: 16, color: onForestMuted },
  dayRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space[2] },
  dayNet: { ...type.label, color: color.stone600 },
  dayNetUp: { color: color.forest900 },
  filterScroll: { marginHorizontal: -space[4] },
  filters: { gap: space[2], paddingHorizontal: space[4], paddingVertical: space[1] },
  filter: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: space[4],
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: color.stone300,
    backgroundColor: '#FFFFFF',
  },
  filterOn: { backgroundColor: color.forest900, borderColor: color.forest900 },
  filterText: { ...type.meta, color: color.ink },
  filterTextOn: { fontFamily: font.semibold, color: color.onForest },
  day: { ...type.label, color: color.stone600 },
  list: { paddingVertical: space[1] },
  divider: { borderTopWidth: 1, borderTopColor: color.stone200 },
  emptyCard: { alignItems: 'stretch', gap: space[4], paddingVertical: space[5] },
  emptyText: { ...type.body, color: color.stone600, textAlign: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: space[2] },
  dateEcho: { ...type.meta, fontFamily: font.regular, color: color.stone600 },
});
