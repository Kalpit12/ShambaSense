import type { ComponentType } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import type { CropCheck } from '@/lib/farm-store';
import { color, font, radius, space } from '@/theme/tokens';
import { CircleHalfIcon, PersonIcon, ProhibitIcon, QuestionIcon } from './icons';

type Mark = 'answered' | 'waiting' | 'checking' | 'possible_match' | 'needs_more_information' | 'unsupported_crop' | 'expert_review_required' | 'asked';
type IconProps = { size?: number; color?: string; weight?: 'regular' | 'fill' | 'bold' };

// Status is shape + colour + word, never colour alone, and never lime (design.md §5.5).
const LOOK: Record<Mark, { fg: string; bg: string; Icon?: ComponentType<IconProps> }> = {
  answered: { fg: color.forest900, bg: color.forest50, Icon: PersonIcon },
  waiting: { fg: color.sky700, bg: color.sky50 },
  checking: { fg: color.sky700, bg: color.sky50 },
  possible_match: { fg: color.amber800, bg: color.amber50, Icon: CircleHalfIcon },
  needs_more_information: { fg: color.sky700, bg: color.sky50, Icon: QuestionIcon },
  unsupported_crop: { fg: color.stone600, bg: color.stone100, Icon: ProhibitIcon },
  expert_review_required: { fg: color.forest900, bg: color.forest50, Icon: PersonIcon },
  asked: { fg: color.forest900, bg: color.forest50, Icon: PersonIcon },
};

export function markOf(check: CropCheck): Mark {
  if (check.reply) return 'answered';
  if (check.askedAt) return 'asked';
  if (check.status !== 'done' || !check.result) return check.status === 'checking' ? 'checking' : 'waiting';
  return check.result.state;
}

/** Small status tag for a crop check: rows, Home and the result screen. */
export function CheckMark({ check, large, label }: { check: CropCheck; large?: boolean; label?: string }) {
  const { t } = useTranslation();
  const mark = markOf(check);
  const { fg, bg, Icon } = LOOK[mark];
  return (
    <View style={[styles.tag, large && styles.large, { backgroundColor: bg }]}>
      {Icon ? <Icon size={large ? 18 : 14} color={fg} weight="fill" /> : <View style={[styles.dot, { backgroundColor: fg }]} />}
      <Text style={[styles.text, large && styles.textLarge, { color: fg }]} numberOfLines={1}>
        {label ?? t(`result.marks.${mark}`)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tag: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: space[2], paddingVertical: 4, borderRadius: radius.full, alignSelf: 'flex-start', flexShrink: 1 },
  large: { paddingHorizontal: space[3], paddingVertical: 6, gap: space[2] },
  dot: { width: 6, height: 6, borderRadius: 3 },
  text: { fontFamily: font.semibold, fontSize: 12, lineHeight: 16 },
  textLarge: { fontSize: 15, lineHeight: 20 },
});
