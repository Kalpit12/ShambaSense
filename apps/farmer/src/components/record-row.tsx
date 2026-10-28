import { useRouter } from 'expo-router';
import type { ComponentType } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { relativeDay, localDay } from '@/lib/dates';
import type { CropCheck, JournalRecord, Plot, RecordKind } from '@/lib/farm-store';
import { formatKes, formatQty } from '@/lib/format';
import { color, font, radius, space, type } from '@/theme/tokens';
import { CheckMark } from './check-status';
import { BasketIcon, CaretRightIcon, CoinsIcon, PackageIcon, ReceiptIcon, ShovelIcon } from './icons';
import { CheckPhoto } from './leaf-art';
import { PressableScale } from './motion';

type IconProps = { size?: number; color?: string; weight?: 'regular' | 'fill' | 'bold' };
export const KIND_ICON: Record<RecordKind, ComponentType<IconProps>> = {
  work: ShovelIcon,
  input: PackageIcon,
  expense: ReceiptIcon,
  harvest: BasketIcon,
  sale: CoinsIcon,
};

/** One journal line: icon, what happened, quantity and money. Money in is forest, money out is ink. */
export function RecordRow({ record, plots, showDate, hidePlot }: { record: JournalRecord; plots: Plot[]; showDate?: boolean; hidePlot?: boolean }) {
  const { t, i18n } = useTranslation();
  const Icon = KIND_ICON[record.kind];
  const plot = plots.find((p) => p.id === record.plotId);
  const title = record.note || t(`journal.${record.kind}`);
  const meta = [
    showDate ? relativeDay(record.occurredOn, i18n.language, t) : null,
    hidePlot ? null : (plot?.name ?? null),
    record.quantity != null ? `${formatQty(record.quantity)} ${t(`journal.units.${record.unit ?? 'kg'}`)}` : null,
  ].filter(Boolean);
  return (
    <View style={styles.row} accessible accessibilityLabel={[t(`journal.${record.kind}`), title, ...meta].join(', ')}>
      <View style={styles.icon}>
        <Icon size={22} color={color.forest900} />
      </View>
      <View style={styles.text}>
        <Text style={styles.title} numberOfLines={2}>
          {title}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {[record.note ? t(`journal.${record.kind}`) : null, ...meta].filter(Boolean).join(' · ')}
        </Text>
      </View>
      {record.amountKes != null ? (
        <Text style={[styles.amount, record.kind === 'sale' && styles.amountIn]}>
          {record.kind === 'sale' ? '+' : '−'}
          {formatKes(record.amountKes)}
        </Text>
      ) : null}
    </View>
  );
}

/** A crop check in the journal, on Home or on a plot: the photo, the crop and its honest status. Opens the result. */
export function CheckRow({ check, showDate }: { check: CropCheck; showDate?: boolean }) {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const crop = t(`onboarding.crops.${check.crop}`);
  const top = check.result?.state === 'possible_match' ? check.result.causes[0] : undefined;
  const meta = [
    showDate ? relativeDay(localDay(check.createdAt), i18n.language, t) : null,
    top ? t(`causes.${top.id}.name`) : check.symptoms.map((s) => t(`check.symptoms.${s}`)).join(', ') || null,
  ].filter(Boolean);
  return (
    <PressableScale
      onPress={() => router.push({ pathname: '/result/[id]', params: { id: check.id } })}
      accessibilityRole="button"
      accessibilityLabel={`${t('journal.checkTitle', { crop })}, ${meta.join(', ')}`}
      style={styles.row}>
      <CheckPhoto uri={check.photoUri} size={44} />
      <View style={styles.text}>
        <Text style={styles.title} numberOfLines={2}>
          {t('journal.checkTitle', { crop })}
        </Text>
        <View style={styles.checkMeta}>
          <CheckMark check={check} />
          <Text style={[styles.meta, styles.flex]} numberOfLines={1}>
            {meta.join(' · ')}
          </Text>
        </View>
      </View>
      <CaretRightIcon size={18} color={color.stone500} />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 64, paddingVertical: space[2] },
  icon: { width: 44, height: 44, borderRadius: 22, backgroundColor: color.forest50, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1 },
  flex: { flex: 1 },
  checkMeta: { flexDirection: 'row', alignItems: 'center', gap: space[2], marginTop: 4 },
  title: { ...type.body, fontFamily: font.medium, color: color.ink },
  meta: { ...type.meta, fontFamily: font.regular, color: color.stone600 },
  amount: { ...type.meta, fontFamily: font.semibold, color: color.ink },
  amountIn: { color: color.forest900 },
});
