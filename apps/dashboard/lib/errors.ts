import { supabase } from './remote';

// Sends dashboard crashes to the app_errors table (supabase/migrations/20261028233000_app_errors.sql).
// Never throws; repeats of the same error within a minute are sent once.

const recent = new Map<string, number>();

export function reportError(error: unknown, context: Record<string, unknown> = {}) {
  if (!supabase) return;
  const e = error instanceof Error ? error : new Error(String(error));
  if (/failed to fetch|load failed|networkerror/i.test(e.message)) return;
  const key = e.message.slice(0, 200);
  const now = Date.now();
  if ((recent.get(key) ?? 0) > now - 60_000) return;
  recent.set(key, now);
  supabase
    .rpc('log_app_error', {
      p_app: 'dashboard',
      p_version: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? '',
      p_platform: 'web',
      p_message: e.message || e.name,
      p_stack: e.stack ?? null,
      p_context: { ...context, view: window.location.hash.slice(1, 60) },
    })
    .then(
      () => {},
      () => {},
    );
}

let installed = false;

export function installErrorReporting() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  window.addEventListener('error', (ev) => reportError(ev.error ?? ev.message, { kind: 'window.error' }));
  window.addEventListener('unhandledrejection', (ev) => reportError(ev.reason, { kind: 'unhandledrejection' }));
}
