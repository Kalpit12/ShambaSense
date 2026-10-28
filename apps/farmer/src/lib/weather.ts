import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

import { isPreview, supabase } from './auth';
import { shiftDays } from './dates';
import { todayIso } from './farm-store';
import type { Crop } from './onboarding';

// 3-day forecast for the farm's county (supabase/functions/weather, data from MET Norway).
// The last forecast is kept on the phone, so Home still shows it without signal, marked with its age.

export type Sky = 'clear' | 'partly' | 'cloudy' | 'rain' | 'storm';
export type WeatherDay = { date: string; min: number; max: number; rainMm: number; sky: Sky; windMax: number };
export type Forecast = { county: string; updatedAt: string; fetchedAt: string; days: WeatherDay[] };

const REFRESH_MS = 3 * 60 * 60 * 1000;
const keyOf = (county: string) => `shambasense.weather.v1.${county}`;

/** Preview mode has no server: a made-up rainy spell so every part of the card shows. */
function previewForecast(county: string): Forecast {
  const today = todayIso();
  const now = new Date().toISOString();
  return {
    county,
    updatedAt: now,
    fetchedAt: now,
    days: [
      { date: today, min: 13, max: 24, rainMm: 0.4, sky: 'partly', windMax: 3.1 },
      { date: shiftDays(today, 1), min: 14, max: 21, rainMm: 8.2, sky: 'rain', windMax: 4.6 },
      { date: shiftDays(today, 2), min: 13, max: 22, rainMm: 3.5, sky: 'rain', windMax: 3.8 },
    ],
  };
}

export function useWeather(county: string | undefined) {
  const [forecast, setForecast] = useState<Forecast | null>(null);
  const [failed, setFailed] = useState(false);

  const refresh = useCallback(
    async (cached: Forecast | null) => {
      if (!county) return;
      if (isPreview) return setForecast(previewForecast(county));
      if (!supabase || (cached && Date.now() - Date.parse(cached.fetchedAt) < REFRESH_MS)) return;
      const { data, error } = await supabase.functions.invoke('weather', { body: { county } }).catch((e) => ({ data: null, error: e }));
      if (error || !Array.isArray(data?.days) || data.days.length === 0) return setFailed(true);
      const next: Forecast = { ...data, fetchedAt: new Date().toISOString() };
      setForecast(next);
      setFailed(false);
      AsyncStorage.setItem(keyOf(county), JSON.stringify(next)).catch(() => {});
    },
    [county],
  );

  useEffect(() => {
    if (!county) return;
    let live = true;
    AsyncStorage.getItem(keyOf(county))
      .then((raw) => (raw ? (JSON.parse(raw) as Forecast) : null))
      .catch(() => null)
      .then((cached) => {
        if (!live) return;
        // Days that have already passed are dropped from the saved copy.
        const today = todayIso();
        const kept = cached ? { ...cached, days: cached.days.filter((d) => d.date >= today) } : null;
        if (kept?.days.length) setForecast(kept);
        refresh(kept?.days.length ? kept : null);
      });
    return () => {
      live = false;
    };
  }, [county, refresh]);

  return { forecast, failed };
}

export type WeatherTip = { key: 'storm' | 'noSpray' | 'blight' | 'hotDry' | 'spray'; date?: string };

/**
 * At most two short tips from the forecast, most urgent first. Spraying advice follows the usual
 * extension rule: no spraying when rain is due within a day or wind is above about 4 m/s.
 */
export function weatherTips(days: WeatherDay[], crops: Crop[]): WeatherTip[] {
  if (days.length === 0) return [];
  const tips: WeatherTip[] = [];
  const soon = days.slice(0, 2);
  const storm = soon.find((d) => d.sky === 'storm');
  if (storm) tips.push({ key: 'storm', date: storm.date });
  const wet = soon.find((d) => d.rainMm >= 5);
  if (wet) tips.push({ key: 'noSpray', date: wet.date });
  if (crops.some((c) => c === 'tomatoes' || c === 'potatoes') && days.some((d) => d.max <= 24 && d.rainMm >= 2)) tips.push({ key: 'blight' });
  if (days.every((d) => d.rainMm < 1) && days.some((d) => d.max >= 28)) tips.push({ key: 'hotDry' });
  const [first, second] = days;
  if (tips.length === 0 && first.rainMm < 1 && (second?.rainMm ?? 0) < 2 && first.windMax < 4 && first.sky !== 'storm')
    tips.push({ key: 'spray', date: first.date });
  return tips.slice(0, 2);
}
