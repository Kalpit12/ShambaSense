import { useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/button';
import { FieldLabel, FieldMessage, TextField } from '@/components/fields';
import { CheckIcon, StorefrontIcon } from '@/components/icons';
import { Card, SectionTitle } from '@/components/screen';
import { Sheet } from '@/components/sheet';
import { useCoops, type Coop, type CoopError } from '@/lib/coops';
import { formatDate } from '@/lib/dates';
import { color, font, space, type } from '@/theme/tokens';

type Step = 'code' | 'consent' | 'done';

/**
 * Profile → Co-op. The farmer joins with the code their co-op gives them, sees the co-op's name and
 * what it will see before agreeing, and can leave at any time.
 */
export function CoopCard({ signedIn }: { signedIn: boolean }) {
  const { t, i18n } = useTranslation();
  const { coops, loading, find, join, leave } = useCoops(signedIn);
  const [step, setStep] = useState<Step | null>(null);
  const [code, setCode] = useState('');
  const [found, setFound] = useState<Coop | null>(null);
  const [error, setError] = useState<CoopError | null>(null);
  const [busy, setBusy] = useState(false);
  const [leaving, setLeaving] = useState<Coop | null>(null);

  const close = () => {
    setStep(null);
    setCode('');
    setFound(null);
    setError(null);
  };

  const lookUp = async () => {
    setBusy(true);
    setError(null);
    const r = await find(code.trim());
    setBusy(false);
    if ('error' in r) return setError(r.error);
    setFound(r.coop);
    setStep('consent');
  };

  const agree = async () => {
    setBusy(true);
    setError(null);
    const e = await join(code.trim());
    setBusy(false);
    if (e) return setError(e);
    setStep('done');
  };

  const doLeave = async () => {
    if (!leaving) return;
    setBusy(true);
    const e = await leave(leaving.id);
    setBusy(false);
    if (e) return setError(e);
    setLeaving(null);
  };

  if (loading) return null;

  return (
    <>
      <SectionTitle>{t('coop.title')}</SectionTitle>
      <Card style={styles.card}>
        {coops.length === 0 ? <Text style={styles.body}>{t('coop.none')}</Text> : null}
        {coops.map((c, i) => (
          <View key={c.id} style={[styles.row, i > 0 && styles.divider]}>
            <View style={styles.icon}>
              <StorefrontIcon size={20} color={color.forest900} />
            </View>
            <View style={styles.flex}>
              <Text style={styles.name}>{c.name}</Text>
              {c.joinedAt ? <Text style={styles.meta}>{t('coop.joined', { date: formatDate(c.joinedAt, i18n.language) })}</Text> : null}
              {c.contactPhone ? (
                <Text style={styles.call} role="link" onPress={() => Linking.openURL(`tel:${c.contactPhone}`).catch(() => {})}>
                  {t('coop.call', { phone: `0${c.contactPhone.slice(4, 7)} ${c.contactPhone.slice(7, 10)} ${c.contactPhone.slice(10)}` })}
                </Text>
              ) : null}
            </View>
            <Button variant="text" label={t('coop.leave')} onPress={() => (setError(null), setLeaving(c))} />
          </View>
        ))}
        <Button variant="secondary" label={t('coop.join')} onPress={() => setStep('code')} />
      </Card>

      <Sheet
        open={step === 'code'}
        onClose={close}
        title={t('coop.codeTitle')}
        footer={
          <>
            <Button label={t('coop.continue')} onPress={lookUp} loading={busy} disabled={code.replace(/[^A-Za-z0-9]/g, '').length < 4} />
            <Button variant="text" label={t('coop.cancel')} onPress={close} />
          </>
        }>
        <FieldLabel>{t('coop.codeLabel')}</FieldLabel>
        <TextField
          value={code}
          onChangeText={(v) => (setCode(v.toUpperCase()), setError(null))}
          autoCapitalize="characters"
          autoCorrect={false}
          placeholder="NJR-4821"
          maxLength={16}
          invalid={!!error}
          accessibilityLabel={t('coop.codeLabel')}
          onSubmitEditing={lookUp}
        />
        <FieldMessage error={error ? t(`coop.errors.${error}`) : null} hint={t('coop.codeHint')} />
      </Sheet>

      <Sheet
        open={step === 'consent'}
        onClose={close}
        title={t('coop.consentTitle', { name: found?.name ?? '' })}
        footer={
          <>
            <Button label={t('coop.agree')} onPress={agree} loading={busy} />
            <Button variant="text" label={t('coop.cancel')} onPress={close} />
          </>
        }>
        <Text style={styles.body}>{t('coop.consentIntro', { name: found?.name ?? '' })}</Text>
        {(['shareName', 'shareFarm', 'shareChecks'] as const).map((k) => (
          <View key={k} style={styles.share}>
            <CheckIcon size={18} color={color.forest900} weight="bold" />
            <Text style={[styles.name, styles.flex]}>{t(`coop.${k}`)}</Text>
          </View>
        ))}
        <Text style={styles.body}>{t('coop.notShared')}</Text>
        {error ? <FieldMessage error={t(`coop.errors.${error}`)} /> : null}
      </Sheet>

      <Sheet open={step === 'done'} onClose={close} title={t('coop.doneTitle', { name: found?.name ?? '' })} footer={<Button label={t('coop.done')} onPress={close} />}>
        <Text style={styles.body}>{t('coop.doneBody')}</Text>
      </Sheet>

      <Sheet
        open={!!leaving}
        onClose={() => setLeaving(null)}
        title={t('coop.leaveTitle', { name: leaving?.name ?? '' })}
        footer={
          <>
            <Button label={t('coop.leaveConfirm')} onPress={doLeave} loading={busy} />
            <Button variant="text" label={t('coop.cancel')} onPress={() => setLeaving(null)} />
          </>
        }>
        <Text style={styles.body}>{t('coop.leaveBody')}</Text>
        {error ? <FieldMessage error={t(`coop.errors.${error}`)} /> : null}
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  card: { gap: space[3] },
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[3], paddingVertical: space[1] },
  divider: { borderTopWidth: 1, borderTopColor: color.stone200, paddingTop: space[3] },
  icon: { width: 40, height: 40, borderRadius: 20, backgroundColor: color.forest50, alignItems: 'center', justifyContent: 'center' },
  name: { ...type.bodyEmphasis, color: color.ink },
  meta: { ...type.meta, fontFamily: font.regular, color: color.stone600 },
  call: { ...type.meta, fontFamily: font.semibold, color: color.forest900, textDecorationLine: 'underline', paddingVertical: space[2] },
  body: { ...type.body, color: color.stone600 },
  share: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
});
