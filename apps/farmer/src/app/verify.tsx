import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { AuthScaffold } from '@/components/auth-scaffold';
import { Button } from '@/components/button';
import { CodeInput, FieldMessage } from '@/components/fields';
import { useAuth } from '@/lib/auth';
import { messageFor } from '@/lib/auth-messages';
import { formatKenya } from '@/lib/phone';
import { color, space, type } from '@/theme/tokens';

const RESEND_SECONDS = 60;

export default function VerifyScreen() {
  const { t } = useTranslation();
  const { phone = '' } = useLocalSearchParams<{ phone: string }>();
  const { verifyCode, resendCode } = useAuth();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [seconds, setSeconds] = useState(RESEND_SECONDS);

  useEffect(() => {
    if (seconds <= 0) return;
    const id = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [seconds]);

  async function verify(value: string) {
    setBusy(true);
    setError(null);
    const result = await verifyCode(phone, value);
    setBusy(false);
    if (result) {
      setError(messageFor(result, t));
      setCode('');
    }
    // On success the auth guard in _layout swaps the stack to /home.
  }

  async function resend() {
    setNote(null);
    setError(null);
    const result = await resendCode(phone);
    if (result) return setError(messageFor(result, t));
    setSeconds(RESEND_SECONDS);
    setNote(t('verify.resent'));
  }

  return (
    <AuthScaffold title={t('verify.title')} subtitle={t('verify.subtitle', { phone: formatKenya(phone) })}>
      <View>
        <CodeInput
          label={t('verify.title')}
          value={code}
          invalid={!!error}
          disabled={busy}
          onChange={(v) => {
            setCode(v);
            if (error) setError(null);
            if (v.length === 6) verify(v);
          }}
        />
        <FieldMessage error={error} hint={busy ? t('verify.verifying') : note ?? undefined} />
      </View>

      <Button label={t('common.continue')} onPress={() => verify(code)} loading={busy} disabled={code.length < 6} />

      <View style={styles.row}>
        {seconds > 0 ? (
          <Text style={styles.timer} accessibilityLiveRegion="polite">
            {t('verify.resendIn', { seconds })}
          </Text>
        ) : (
          <Button variant="text" label={t('verify.resend')} onPress={resend} />
        )}
        <Button variant="text" label={t('verify.changeNumber')} onPress={() => router.back()} />
      </View>
    </AuthScaffold>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: space[2] },
  timer: { ...type.meta, color: color.stone600, fontVariant: ['tabular-nums'], paddingHorizontal: space[2] },
});
