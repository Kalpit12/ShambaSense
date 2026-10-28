import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocales } from 'expo-localization';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import { en } from './en';
import { sw } from './sw';

export type Language = 'sw' | 'en';
const STORAGE_KEY = 'shambasense.language';

// Language is chosen before sign-in and kept on the phone (architecture.md §8).
export async function initI18n() {
  let stored: string | null = null;
  try {
    stored = await AsyncStorage.getItem(STORAGE_KEY);
  } catch {}
  const device = getLocales()[0]?.languageCode;
  const lng: Language = stored === 'en' || stored === 'sw' ? stored : device === 'en' ? 'en' : 'sw';

  await i18n.use(initReactI18next).init({
    resources: { en: { translation: en }, sw: { translation: sw } },
    lng,
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
  });
}

export async function setLanguage(lng: Language) {
  await i18n.changeLanguage(lng);
  try {
    await AsyncStorage.setItem(STORAGE_KEY, lng);
  } catch {}
}

export default i18n;
