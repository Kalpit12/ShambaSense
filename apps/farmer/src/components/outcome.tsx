import type { ComponentType } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import type { Outcome } from '@/lib/farm-store';
import { color, font, radius, space } from '@/theme/tokens';
import { EqualsIcon, TrendDownIcon, TrendUpIcon } from './icons';

type IconProps = { size?: number; color?: string; weight?: 'regular' | 'fill' | 'bold' };

// The farmer's own words on a follow-up: shape + colour + word, like every status (design.md §5.5).
export const OUTCOME_LOOK: Record<Outcome, { fg: string; bg: string; Icon: ComponentType<IconProps> }> = {
  better: { fg: color.forest900, bg: color.forest50, Icon: TrendUpIcon },
  same: { fg: color.stone800, bg: color.stone100, Icon: EqualsIcon },
  worse: { fg: color.amber800, bg: color.amber50, Icon: TrendDownIcon },
};

export function OutcomeTag({ outcome }: { outcome: Outcome }) {
  const { t } = useTranslation();
  const { fg, bg, Icon } = OUTCOME_LOOK[outcome];
  return (
    <View style={[styles.tag, { backgroundColor: bg }]}>
      <Icon size={16} color={fg} weight="bold" />
      <Text style={[styles.text, { color: fg }]}>{t(`followUp.outcomes.${outcome}`)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tag: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: space[3], paddingVertical: 4, borderRadius: radius.full },
  text: { fontFamily: font.semibold, fontSize: 14, lineHeight: 18 },
});
