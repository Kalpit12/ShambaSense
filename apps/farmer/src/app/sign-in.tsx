import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { AuthScaffold } from '@/components/auth-scaffold';
import { Button } from '@/components/button';
import { FieldLabel, FieldMessage, PhoneField } from '@/components/fields';
import { useAuth } from '@/lib/auth';
import { messageFor } from '@/lib/auth-messages';
import { groupLocal, toE164Kenya } from '@/lib/phone';
import { color, space, type } from '@/theme/tokens';

export default function SignInScreen() {
  const { t } = useTranslation();
  const { sendCode } = useAuth();
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [noAccount, setNoAccount] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit() {
    const e164 = toE164Kenya(phone);
    setNoAccount(false);
    if (!e164) return setError(t('common.phoneInvalid'));
    setError(null);
    setBusy(true);
    const result = await sendCode(e164);
    setBusy(false);
    if (result === 'no_account') {
      setNoAccount(true);
      return setError(t('signIn.noAccount'));
    }
    if (result) return setError(messageFor(result, t));
    router.push({ pathname: '/verify', params: { phone: e164 } });
  }

  return (
    <AuthScaffold
      title={t('signIn.title')}
      subtitle={t('signIn.subtitle')}
      footer={
        <View style={styles.switchRow}>
          <Text style={styles.switchText}>{t('signIn.switchPrompt')}</Text>
          <Button variant="text" label={t('signIn.createInstead')} onPress={() => router.replace('/sign-up')} />
        </View>
      }>
      <View>
        <FieldLabel>{t('common.phoneLabel')}</FieldLabel>
        <PhoneField
          label={t('common.phoneLabel')}
          value={phone}
          onChangeText={(v) => {
            setPhone(groupLocal(v));
            if (error) setError(null);
          }}
          invalid={!!error}
          onSubmitEditing={submit}
        />
        <FieldMessage error={error} hint={t('common.phoneHint')} />
        {noAccount ? (
          <View style={styles.inlineAction}>
            <Button variant="secondary" label={t('signIn.createInstead')} onPress={() => router.replace('/sign-up')} />
          </View>
        ) : null}
      </View>
      <Button label={t('common.sendCode')} onPress={submit} loading={busy} />
    </AuthScaffold>
  );
}

const styles = StyleSheet.create({
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', marginTop: space[5] },
  switchText: { ...type.body, color: color.stone600 },
  inlineAction: { marginTop: space[3] },
});
