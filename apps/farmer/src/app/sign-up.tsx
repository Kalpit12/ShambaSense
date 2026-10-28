import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { AuthScaffold } from '@/components/auth-scaffold';
import { Button } from '@/components/button';
import { CountyPicker } from '@/components/county-picker';
import { Checkbox, FieldLabel, FieldMessage, PhoneField, TextField } from '@/components/fields';
import type { Language } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { messageFor } from '@/lib/auth-messages';
import { groupLocal, toE164Kenya } from '@/lib/phone';
import { color, space, type } from '@/theme/tokens';

export default function SignUpScreen() {
  const { t, i18n } = useTranslation();
  const { sendCode } = useAuth();
  const [name, setName] = useState('');
  const [county, setCounty] = useState<string | null>(null);
  const [phone, setPhone] = useState('');
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; phone?: string; county?: string; consent?: string }>({});
  const [exists, setExists] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit() {
    const e164 = toE164Kenya(phone);
    const cleanName = name.trim().replace(/\s+/g, ' ');
    const next = {
      name: cleanName.length >= 2 ? undefined : t('signUp.nameRequired'),
      county: county ? undefined : t('signUp.countyRequired'),
      phone: e164 ? undefined : t('common.phoneInvalid'),
      consent: consent ? undefined : t('signUp.consentRequired'),
    };
    setErrors(next);
    setExists(false);
    if (next.name || !e164 || !county || !consent) return;

    setBusy(true);
    const result = await sendCode(e164, { name: cleanName, county, language: i18n.language as Language });
    setBusy(false);
    if (result === 'account_exists') {
      setExists(true);
      return setErrors({ phone: t('signUp.exists') });
    }
    if (result) return setErrors({ phone: messageFor(result, t) });
    router.push({ pathname: '/verify', params: { phone: e164 } });
  }

  return (
    <AuthScaffold
      title={t('signUp.title')}
      subtitle={t('signUp.subtitle')}
      footer={
        <View style={styles.switchRow}>
          <Text style={styles.switchText}>{t('signUp.switchPrompt')}</Text>
          <Button variant="text" label={t('signUp.signInInstead')} onPress={() => router.replace('/sign-in')} />
        </View>
      }>
      <View>
        <FieldLabel>{t('signUp.nameLabel')}</FieldLabel>
        <TextField
          value={name}
          onChangeText={(v) => {
            setName(v);
            setErrors((e) => ({ ...e, name: undefined }));
          }}
          invalid={!!errors.name}
          placeholder={t('signUp.namePlaceholder')}
          accessibilityLabel={t('signUp.nameLabel')}
          autoComplete="name"
          textContentType="name"
          autoCapitalize="words"
          returnKeyType="next"
          maxLength={60}
        />
        <FieldMessage error={errors.name} />
      </View>

      <View>
        <FieldLabel>{t('signUp.countyLabel')}</FieldLabel>
        <CountyPicker
          value={county}
          onChange={(c) => {
            setCounty(c);
            setErrors((e) => ({ ...e, county: undefined }));
          }}
          label={t('signUp.countyLabel')}
          placeholder={t('signUp.countyPlaceholder')}
          searchLabel={t('signUp.countySearch')}
          invalid={!!errors.county}
        />
        <FieldMessage error={errors.county} />
      </View>

      <View>
        <FieldLabel>{t('common.phoneLabel')}</FieldLabel>
        <PhoneField
          label={t('common.phoneLabel')}
          value={phone}
          onChangeText={(v) => {
            setPhone(groupLocal(v));
            setErrors((e) => ({ ...e, phone: undefined }));
          }}
          invalid={!!errors.phone}
        />
        <FieldMessage error={errors.phone} hint={t('common.phoneHint')} />
        {exists ? (
          <View style={styles.inlineAction}>
            <Button variant="secondary" label={t('signUp.signInInstead')} onPress={() => router.replace('/sign-in')} />
          </View>
        ) : null}
      </View>

      <View>
        <Checkbox
          checked={consent}
          invalid={!!errors.consent}
          onChange={(v) => {
            setConsent(v);
            setErrors((e) => ({ ...e, consent: undefined }));
          }}>
          {t('signUp.consent')}
        </Checkbox>
        <FieldMessage error={errors.consent} />
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
