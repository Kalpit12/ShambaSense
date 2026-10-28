import { createClient, type Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import type { Language } from '@/i18n';
import type { FarmAnswers } from './onboarding';
import { loadFarmAnswers, markOnboarded, PREVIEW_FARM, saveFarmAnswers } from './onboarding';
import { secureStorage } from './secure-storage';

// Farmers sign in with +254 phone + SMS code only (architecture.md R8). Supabase Auth sends the
// code through the `sms-hook` Edge Function, which calls Africa's Talking.
//
// With no EXPO_PUBLIC_SUPABASE_URL set, the app runs in preview mode: no SMS, code 123456.

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const supabase =
  url && anonKey
    ? createClient(url, anonKey, {
        auth: { storage: secureStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
      })
    : null;

export const isPreview = supabase === null;
const PREVIEW_CODE = '123456';

// Demo sign-in (dev only, EXPO_PUBLIC_DEMO_AUTH=1): no SMS is sent and the code is always 123456.
// Each number maps to a confirmed email account made by the demo_sign_up database function, and
// the app signs in with a shared password. Switch it off before real farmers use the app.
export const isDemo = !!supabase && process.env.EXPO_PUBLIC_DEMO_AUTH === '1';
const DEMO_PASSWORD = 'shamba-demo-123456';
const demoEmail = (phone: string) => `farmer.${phone.replace('+', '')}@example.com`;

export type SignUpDetails = { name: string; county: string; language: Language };
export type AuthError = 'no_account' | 'account_exists' | 'wrong_code' | 'expired' | 'rate_limited' | 'offline' | 'unknown';

export type User = {
  id?: string;
  phone: string;
  name?: string;
  county?: string;
  /** False right after sign-up until the first-time questions are answered. */
  onboarded: boolean;
  farm?: FarmAnswers;
};

type AuthContextValue = {
  user: User | null;
  ready: boolean;
  sendCode: (phone: string, signUp?: SignUpDetails) => Promise<AuthError | null>;
  resendCode: (phone: string) => Promise<AuthError | null>;
  verifyCode: (phone: string, code: string) => Promise<AuthError | null>;
  /** Saves the first-time answers. The user stays on the questions until finishOnboarding. */
  completeOnboarding: (answers: FarmAnswers) => Promise<AuthError | null>;
  finishOnboarding: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function mapError(message: string | undefined, status?: number): AuthError {
  const m = (message ?? '').toLowerCase();
  if (m.includes('signups not allowed') || m.includes('user not found')) return 'no_account';
  if (m.includes('expired')) return 'expired';
  if (m.includes('invalid') || m.includes('token')) return 'wrong_code';
  if (status === 429 || m.includes('rate')) return 'rate_limited';
  if (m.includes('network') || m.includes('fetch')) return 'offline';
  return 'unknown';
}

function userFromSession(session: Session | null): User | null {
  if (!session) return null;
  const meta = session.user.user_metadata ?? {};
  return {
    id: session.user.id,
    phone: `+${session.user.phone ?? ''}`,
    name: meta.display_name,
    county: meta.county,
    onboarded: !!meta.onboarded_at,
  };
}

// Preview mode keeps a pretend user list in memory so sign-in vs sign-up paths can be tried.
const previewAccounts = new Map<string, SignUpDetails>([['+254712345678', { name: 'Juma', county: 'Nakuru', language: 'sw' }]]);
let previewPending: { phone: string; details?: SignUpDetails } | null = null;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(isPreview);

  useEffect(() => {
    if (!supabase) return;
    const client = supabase;
    // The farm answers come from the server, so Home and Profile show them on a new phone too.
    const withFarm = async (session: Session | null) => {
      const u = userFromSession(session);
      if (u?.id && u.onboarded) u.farm = (await loadFarmAnswers(client, u.id).catch(() => null)) ?? undefined;
      return u;
    };
    client.auth.getSession().then(async ({ data }) => {
      setUser(await withFarm(data.session));
      setReady(true);
    });
    const { data } = client.auth.onAuthStateChange((event, session) => {
      // Token refreshes keep the farm already loaded; only a new sign-in or sign-out reloads it.
      if (event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') return;
      withFarm(session).then(setUser);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      ready,
      async sendCode(phone, signUp) {
        if (!supabase) {
          await delay(600);
          const exists = previewAccounts.has(phone);
          if (signUp && exists) return 'account_exists';
          if (!signUp && !exists) return 'no_account';
          previewPending = { phone, details: signUp };
          return null;
        }
        if (isDemo) {
          if (signUp) {
            const { error } = await supabase.rpc('demo_sign_up', {
              p_phone: phone,
              p_name: signUp.name,
              p_county: signUp.county,
              p_language: signUp.language,
            });
            if (error) return error.message.includes('account_exists') ? 'account_exists' : mapError(error.message);
            return null;
          }
          const { data, error } = await supabase.rpc('demo_has_account', { p_phone: phone });
          if (error) return mapError(error.message);
          return data ? null : 'no_account';
        }
        // Sign-up creates the user and stores profile basics in user metadata; a database trigger
        // copies them into `profiles`. Sign-in must not create a user by accident.
        const { error } = await supabase.auth.signInWithOtp({
          phone,
          options: signUp
            ? { shouldCreateUser: true, channel: 'sms', data: { display_name: signUp.name, county: signUp.county, language: signUp.language } }
            : { shouldCreateUser: false, channel: 'sms' },
        });
        return error ? mapError(error.message, error.status) : null;
      },
      async resendCode(phone) {
        if (!supabase || isDemo) {
          await delay(400);
          return null;
        }
        // Works for both flows: a new number stays a pending sign-up until the code is verified.
        const { error } = await supabase.auth.signInWithOtp({ phone, options: { shouldCreateUser: false, channel: 'sms' } });
        return error ? mapError(error.message, error.status) : null;
      },
      async verifyCode(phone, code) {
        if (!supabase) {
          await delay(700);
          if (code !== PREVIEW_CODE || previewPending?.phone !== phone) return 'wrong_code';
          const isNew = !!previewPending.details;
          const details = previewPending.details ?? previewAccounts.get(phone);
          if (isNew) previewAccounts.set(phone, previewPending.details!);
          previewPending = null;
          setUser({ phone, name: details?.name, county: details?.county, onboarded: !isNew, farm: isNew ? undefined : PREVIEW_FARM });
          return null;
        }
        if (isDemo) {
          if (code !== PREVIEW_CODE) return 'wrong_code';
          const { error } = await supabase.auth.signInWithPassword({ email: demoEmail(phone), password: DEMO_PASSWORD });
          return error ? mapError(error.message, error.status) : null;
        }
        const { error } = await supabase.auth.verifyOtp({ phone, token: code, type: 'sms' });
        return error ? mapError(error.message, error.status) : null;
      },
      async completeOnboarding(answers) {
        if (!user) return 'unknown';
        if (supabase && user.id) {
          const error = await saveFarmAnswers(supabase, user.id, answers);
          if (error) return mapError(error);
        } else {
          await delay(500);
        }
        setUser({ ...user, county: answers.county, farm: answers });
        return null;
      },
      async finishOnboarding() {
        if (!user) return;
        if (supabase) await markOnboarded(supabase);
        setUser({ ...user, onboarded: true });
      },
      async signOut() {
        // Once PowerSync is in, also wipe local SQLite and the photo cache here (design.md §7.10).
        if (supabase) await supabase.auth.signOut();
        setUser(null);
      },
    }),
    [user, ready],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
