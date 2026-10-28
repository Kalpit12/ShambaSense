import type { ComponentType } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { CheckIcon, CloudIcon, CloudLightningIcon, CloudRainIcon, CloudSunIcon, DropIcon, LeafIcon, SunIcon, WarningIcon } from '@/components/icons';
import { Card, SectionTitle } from '@/components/screen';
import { shiftDays, shortDate, weekday } from '@/lib/dates';
import { todayIso } from '@/lib/farm-store';
import type { Crop } from '@/lib/onboarding';
import { useWeather, weatherTips, type Sky, type WeatherTip } from '@/lib/weather';
import { color, font, radius, space, type } from '@/theme/tokens';

type IconProps = { size?: number; color?: string; weight?: 'regular' | 'fill' | 'bold' };

const SKY_ICON: Record<Sky, ComponentType<IconProps>> = {
  clear: SunIcon,
  partly: CloudSunIcon,
  cloudy: CloudIcon,
  rain: CloudRainIcon,
  storm: CloudLightningIcon,
};
const TIP_ICON: Record<WeatherTip['key'], ComponentType<IconProps>> = {
  storm: WarningIcon,
  noSpray: DropIcon,
  blight: LeafIcon,
  hotDry: SunIcon,
  spray: CheckIcon,
};
const STALE_MS = 6 * 60 * 60 * 1000;

/** 3-day forecast for the farm's county with up to two farming tips. */
export function WeatherCard({ county, crops }: { county: string; crops: Crop[] }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { forecast, failed } = useWeather(county);
  const today = todayIso();

  const dayName = (iso: string) => (iso === today ? t('weather.today') : iso === shiftDays(today, 1) ? t('weather.tomorrow') : weekday(iso, lang));
  const when = (iso?: string) =>
    !iso || iso === today ? t('weather.when.today') : iso === shiftDays(today, 1) ? t('weather.when.tomorrow') : t('weather.when.on', { day: weekday(iso, lang) });
  const clock = (ts: string) => {
    const d = new Date(ts);
    const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return day === today ? hm : `${shortDate(day, lang)} ${hm}`;
  };

  const days = forecast?.days.slice(0, 3) ?? [];
  const tips = weatherTips(days, crops);
  const stale = forecast ? Date.now() - Date.parse(forecast.fetchedAt) > STALE_MS : false;

  return (
    <View>
      <SectionTitle action={<Text style={styles.place}>{county}</Text>}>{t('weather.title')}</SectionTitle>
      <Card>
        {days.length === 0 ? (
          <Text style={styles.empty}>{failed ? t('weather.failed') : t('weather.loading')}</Text>
        ) : (
          <>
            <View style={styles.days}>
              {days.map((d, i) => {
                const Icon = SKY_ICON[d.sky];
                const rain = d.rainMm >= 1 ? t('weather.rain', { mm: Math.round(d.rainMm) }) : t('weather.dry');
                return (
                  <View
                    key={d.date}
                    style={[styles.day, i > 0 && styles.dayDivider]}
                    accessible
                    accessibilityLabel={t('weather.a11yDay', { day: dayName(d.date), sky: t(`weather.sky.${d.sky}`), max: d.max, min: d.min, rain })}>
                    <Text style={styles.dayName} numberOfLines={1}>
                      {dayName(d.date)}
                    </Text>
                    <Icon size={30} color={d.sky === 'rain' || d.sky === 'storm' ? color.sky700 : color.forest900} />
                    <Text style={styles.sky} numberOfLines={1}>
                      {t(`weather.sky.${d.sky}`)}
                    </Text>
                    <Text style={styles.temps}>
                      {d.max}°<Text style={styles.min}> {d.min}°</Text>
                    </Text>
                    <View style={styles.rainRow}>
                      {d.rainMm >= 1 ? <DropIcon size={14} color={color.sky700} weight="fill" /> : null}
                      <Text style={[styles.rain, d.rainMm >= 1 && styles.rainWet]}>{rain}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
            {tips.map((tip) => {
              const Icon = TIP_ICON[tip.key];
              const warn = tip.key === 'storm' || tip.key === 'blight';
              return (
                <View key={tip.key} style={[styles.tip, warn ? styles.tipWarn : styles.tipCalm]}>
                  <Icon size={20} color={warn ? color.amber800 : color.forest900} />
                  <Text style={styles.tipText}>{t(`weather.tips.${tip.key}`, { day: when(tip.date) })}</Text>
                </View>
              );
            })}
            <Text style={styles.footnote}>
              {stale ? t('weather.saved', { time: clock(forecast!.fetchedAt) }) : t('weather.source', { county, time: clock(forecast!.updatedAt) })}
            </Text>
          </>
        )}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  place: { ...type.meta, color: color.stone600 },
  empty: { ...type.body, color: color.stone600 },
  days: { flexDirection: 'row' },
  day: { flex: 1, alignItems: 'center', gap: 2, paddingHorizontal: space[1] },
  dayDivider: { borderLeftWidth: 1, borderLeftColor: color.stone200 },
  dayName: { ...type.label, color: color.stone600, marginBottom: space[1] },
  sky: { fontFamily: font.regular, fontSize: 13, lineHeight: 18, color: color.stone600 },
  temps: { fontFamily: font.semibold, fontSize: 20, lineHeight: 26, color: color.ink },
  min: { fontFamily: font.regular, fontSize: 16, color: color.stone500 },
  rainRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  rain: { fontFamily: font.medium, fontSize: 13, lineHeight: 18, color: color.stone500 },
  rainWet: { color: color.sky700 },
  tip: { flexDirection: 'row', alignItems: 'flex-start', gap: space[2], marginTop: space[3], padding: space[3], borderRadius: radius.sm },
  tipWarn: { backgroundColor: color.amber50 },
  tipCalm: { backgroundColor: color.forest50 },
  tipText: { ...type.body, fontSize: 16, lineHeight: 22, color: color.ink, flex: 1 },
  footnote: { fontFamily: font.regular, fontSize: 12, lineHeight: 16, color: color.stone500, marginTop: space[3] },
});
