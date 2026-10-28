import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { CalendarBlankIcon, CaretLeftIcon, CheckIcon } from '@/components/icons';
import { Enter, PressableScale } from '@/components/motion';
import { Card, SectionTitle } from '@/components/screen';
import { useAuth } from '@/lib/auth';
import { useCoops } from '@/lib/coops';
import { shortDate } from '@/lib/dates';
import { todayIso, useFarm } from '@/lib/farm-store';
import { useCoopTasks, type CoopTask } from '@/lib/tasks';
import { color, font, radius, space, type } from '@/theme/tokens';

/** Tasks and visits from the farmer's co-op. A tick is saved on the phone at once and sent when there is signal. */
export default function TasksScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { plots } = useFarm();
  const { tasks, waiting, refresh, setDone } = useCoopTasks();
  const { coops, loading } = useCoops(!!user?.id);
  const lang = i18n.language;
  const today = todayIso();
  const back = () => (router.canGoBack() ? router.back() : router.replace('/home'));

  useEffect(() => {
    refresh();
  }, [refresh]);

  const todo = tasks.filter((x) => x.kind === 'farmer' && x.status !== 'done');
  const visits = tasks.filter((x) => x.kind === 'visit' && x.status !== 'done' && x.dueOn >= today);
  const done = tasks.filter((x) => x.kind === 'farmer' && x.status === 'done').sort((a, b) => (b.doneAt ?? '').localeCompare(a.doneAt ?? ''));
  const plotName = (id: string | null) => (id ? plots.find((p) => p.id === id)?.name : undefined);
  const due = (x: CoopTask) => (x.dueOn === today ? t('tasks.dueToday') : x.dueOn < today ? t('tasks.overdue', { date: shortDate(x.dueOn, lang) }) : t('tasks.due', { date: shortDate(x.dueOn, lang) }));

  const row = (x: CoopTask, i: number) => {
    const isDone = x.status === 'done';
    const late = !isDone && x.dueOn < today;
    return (
      <View key={x.id} style={[styles.item, i > 0 && styles.divider]}>
        <PressableScale
          onPress={() => setDone(x.id, !isDone)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: isDone }}
          accessibilityLabel={isDone ? t('tasks.undo') : t('tasks.markDone')}
          scaleTo={0.9}
          style={[styles.box, isDone && styles.boxOn]}>
          {isDone ? <CheckIcon size={20} color="#FFFFFF" weight="bold" /> : null}
        </PressableScale>
        <View style={styles.flex}>
          <Text style={[styles.itemTitle, isDone && styles.struck]}>{x.title}</Text>
          {x.note && !isDone ? <Text style={styles.body}>{x.note}</Text> : null}
          <Text style={[styles.meta, late && styles.late]}>
            {[isDone && x.doneAt ? t('tasks.doneOn', { date: shortDate(x.doneAt.slice(0, 10), lang) }) : due(x), plotName(x.plotId)].filter(Boolean).join(' · ')}
          </Text>
          <Text style={styles.meta}>{t('tasks.from', { coop: x.coopName, name: x.assigneeName ?? '' })}</Text>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={[styles.scroll, { paddingTop: insets.top + space[3], paddingBottom: insets.bottom + space[6] }]} showsVerticalScrollIndicator={false}>
        <Enter step={0} style={styles.head}>
          <PressableScale onPress={back} accessibilityRole="button" accessibilityLabel={t('common.back')} scaleTo={0.92} style={styles.backBtn}>
            <CaretLeftIcon size={22} color={color.ink} weight="bold" />
          </PressableScale>
          <Text style={styles.title} role="heading">
            {t('tasks.title')}
          </Text>
        </Enter>
        <Enter step={0}>
          <Text style={styles.body}>{t('tasks.intro')}</Text>
          {waiting > 0 ? <Text style={[styles.meta, styles.sky]}>{t('tasks.waiting')}</Text> : null}
        </Enter>

        {!tasks.length ? (
          <Enter step={1}>
            <Card>
              <Text style={styles.body}>{!loading && !coops.length && user?.id ? t('tasks.noCoop') : t('tasks.none')}</Text>
            </Card>
          </Enter>
        ) : null}

        {visits.length ? (
          <Enter step={1}>
            <SectionTitle>{t('tasks.visits')}</SectionTitle>
            <Card style={styles.list}>
              {visits.map((x, i) => (
                <View key={x.id} style={[styles.item, i > 0 && styles.divider]}>
                  <View style={styles.visitIcon}>
                    <CalendarBlankIcon size={22} color={color.forest900} />
                  </View>
                  <View style={styles.flex}>
                    <Text style={styles.itemTitle}>{x.dueOn === today ? t('tasks.dueToday') : shortDate(x.dueOn, lang)}</Text>
                    <Text style={styles.body}>{t('tasks.visitBy', { name: x.assigneeName ?? '' })}</Text>
                    <Text style={styles.meta}>{x.coopName}</Text>
                  </View>
                </View>
              ))}
            </Card>
          </Enter>
        ) : null}

        {todo.length ? (
          <Enter step={2}>
            <SectionTitle>{t('tasks.toDo')}</SectionTitle>
            <Card style={styles.list}>{todo.map(row)}</Card>
          </Enter>
        ) : null}

        {done.length ? (
          <Enter step={3}>
            <SectionTitle>{t('tasks.done')}</SectionTitle>
            <Card style={styles.list}>{done.map(row)}</Card>
          </Enter>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.stone50 },
  scroll: { paddingHorizontal: space[4], gap: space[4] },
  flex: { flex: 1, gap: 2 },
  head: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  backBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: color.stone100 },
  title: { ...type.title, color: color.ink, flexShrink: 1 },
  body: { ...type.body, color: color.stone600 },
  meta: { ...type.meta, fontFamily: font.regular, color: color.stone600 },
  late: { color: color.amber800, fontFamily: font.semibold },
  sky: { color: color.sky700, marginTop: space[2] },
  list: { paddingVertical: space[1] },
  item: { flexDirection: 'row', gap: space[3], alignItems: 'flex-start', paddingVertical: space[3] },
  divider: { borderTopWidth: 1, borderTopColor: color.stone200 },
  itemTitle: { ...type.bodyEmphasis, color: color.ink },
  struck: { color: color.stone600, textDecorationLine: 'line-through' },
  box: { width: 48, height: 48, borderRadius: radius.sm, borderWidth: 2, borderColor: color.forest900, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },
  boxOn: { backgroundColor: color.forest900 },
  visitIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: color.forest50, alignItems: 'center', justifyContent: 'center' },
});
