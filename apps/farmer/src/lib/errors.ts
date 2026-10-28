import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { supabase } from './auth';

// Sends crashes to the app_errors table (supabase/migrations/20261028233000_app_errors.sql) so the
// team sees them without another service. Never throws, and repeats of the same error in a minute
// are sent once. Offline errors are dropped: there is nothing useful to learn from "no signal".

const version = Constants.expoConfig?.version ?? '';
const recent = new Map<string, number>();

export function reportError(error: unknown, context: Record<string, unknown> = {}) {
  if (!supabase) return;
  const e = error instanceof Error ? error : new Error(String(error));
  if (/network request failed|failed to fetch|load failed|offline/i.test(e.message)) return;
  const key = e.message.slice(0, 200);
  const now = Date.now();
  if ((recent.get(key) ?? 0) > now - 60_000) return;
  recent.set(key, now);
  supabase
    .rpc('log_app_error', {
      p_app: 'farmer',
      p_version: version,
      p_platform: Platform.OS,
      p_message: e.message || e.name,
      p_stack: e.stack ?? null,
      p_context: context,
    })
    .then(
      () => {},
      () => {},
    );
}

let installed = false;

/** Catches errors no screen handled: JS exceptions on phones, and errors and rejections on the web. */
export function installErrorReporting() {
  if (installed) return;
  installed = true;
  if (Platform.OS === 'web') {
    if (typeof window === 'undefined') return;
    window.addEventListener('error', (ev) => reportError(ev.error ?? ev.message, { kind: 'window.error' }));
    window.addEventListener('unhandledrejection', (ev) => reportError(ev.reason, { kind: 'unhandledrejection' }));
    return;
  }
  const g = globalThis as unknown as { ErrorUtils?: { getGlobalHandler(): (e: unknown, fatal?: boolean) => void; setGlobalHandler(h: (e: unknown, fatal?: boolean) => void): void } };
  const utils = g.ErrorUtils;
  if (!utils) return;
  const previous = utils.getGlobalHandler();
  utils.setGlobalHandler((e, fatal) => {
    reportError(e, { kind: 'global', fatal: !!fatal });
    previous(e, fatal);
  });
}
