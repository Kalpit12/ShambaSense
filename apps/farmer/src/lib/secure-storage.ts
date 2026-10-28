import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

// Supabase session storage. Tokens live in the Android keystore via expo-secure-store
// (architecture.md §3.1). SecureStore values are capped near 2 KB, so long values are chunked.
const CHUNK = 1800;

const native = {
  async getItem(key: string) {
    const count = await SecureStore.getItemAsync(`${key}.n`);
    if (!count) return SecureStore.getItemAsync(key);
    const parts = await Promise.all(
      Array.from({ length: Number(count) }, (_, i) => SecureStore.getItemAsync(`${key}.${i}`)),
    );
    return parts.join('');
  },
  async setItem(key: string, value: string) {
    await native.removeItem(key);
    if (value.length <= CHUNK) return SecureStore.setItemAsync(key, value);
    const parts = value.match(new RegExp(`.{1,${CHUNK}}`, 'gs')) ?? [];
    await Promise.all(parts.map((p, i) => SecureStore.setItemAsync(`${key}.${i}`, p)));
    await SecureStore.setItemAsync(`${key}.n`, String(parts.length));
  },
  async removeItem(key: string) {
    const count = await SecureStore.getItemAsync(`${key}.n`);
    await SecureStore.deleteItemAsync(key);
    if (!count) return;
    await Promise.all(
      Array.from({ length: Number(count) }, (_, i) => SecureStore.deleteItemAsync(`${key}.${i}`)),
    );
    await SecureStore.deleteItemAsync(`${key}.n`);
  },
};

const web = {
  getItem: async (key: string) => (typeof localStorage === 'undefined' ? null : localStorage.getItem(key)),
  setItem: async (key: string, value: string) => localStorage?.setItem(key, value),
  removeItem: async (key: string) => localStorage?.removeItem(key),
};

export const secureStorage = Platform.OS === 'web' ? web : native;
