import { useCallback, useEffect, useRef, useState } from 'react';

import { supabase } from './auth';

// SMS case updates (architecture.md §10). Off until the farmer turns them on in Profile. The server
// texts the farmer's phone number when an agronomist answers, asks for another photo, or a follow-up
// photo is due. Changing the setting needs a connection, since the server keeps the consent record.

let previewOn = false;

export type SmsError = 'offline' | 'unknown';

export function useSmsUpdates(signedIn: boolean, language: string) {
  const [on, setOn] = useState(false);
  const [loading, setLoading] = useState(true);
  const lastLanguage = useRef(language);

  useEffect(() => {
    let live = true;
    if (!supabase) {
      setOn(previewOn);
      setLoading(false);
      return;
    }
    if (!signedIn) return;
    supabase.rpc('my_sms_updates').then(({ data, error }) => {
      if (!live) return;
      if (!error) setOn(!!data);
      setLoading(false);
    });
    return () => {
      live = false;
    };
  }, [signedIn]);

  const change = useCallback(
    async (next: boolean): Promise<SmsError | null> => {
      if (!supabase) {
        previewOn = next;
        setOn(next);
        return null;
      }
      const { error } = await supabase.rpc('set_sms_updates', { p_on: next, p_language: language === 'en' ? 'en' : 'sw' });
      if (error) return /fetch|network|timed? ?out/i.test(error.message) ? 'offline' : 'unknown';
      setOn(next);
      return null;
    },
    [language],
  );

  // Texts are written in the app's language: keep the server in step when the farmer switches.
  useEffect(() => {
    if (lastLanguage.current === language) return;
    lastLanguage.current = language;
    if (on && supabase) change(true).catch(() => {});
  }, [language, on, change]);

  return { on, loading, change };
}
