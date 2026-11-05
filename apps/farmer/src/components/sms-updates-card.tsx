import { useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { FieldMessage } from '@/components/fields';
import { Card, SectionTitle } from '@/components/screen';
import { formatKenya } from '@/lib/phone';
import { useSmsUpdates, type SmsError } from '@/lib/sms-updates';
import { color, font, space, type } from '@/theme/tokens';

/** Profile → Text messages. One switch, what it sends, and to which number. */
export function SmsUpdatesCard({ signedIn, phone }: { signedIn: boolean; phone?: string }) {
  const { t, i18n } = useTranslation();
  const { on, loading, change } = useSmsUpdates(signedIn, i18n.language);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<SmsError | null>(null);

  const toggle = async (next: boolean) => {
    setBusy(true);
    setError(null);
    setError(await change(next));
    setBusy(false);
  };

  return (
    <View>
      <SectionTitle>{t('sms.title')}</SectionTitle>
      <Card style={styles.card}>
        <View style={styles.row}>
          <View style={styles.flex}>
            <Text style={styles.label}>{t('sms.switch')}</Text>
            <Text style={styles.meta}>{t('sms.hint')}</Text>
          </View>
          <Switch
            value={on}
            disabled={loading || busy}
            onValueChange={toggle}
            accessibilityLabel={t('sms.switch')}
            trackColor={{ false: color.stone300, true: color.forest900 }}
            thumbColor="#FFFFFF"
          />
        </View>
        {on && phone ? <Text style={styles.meta}>{t('sms.sentTo', { phone: formatKenya(phone) })}</Text> : null}
        {on ? <Text style={styles.meta}>{t('sms.rules')}</Text> : null}
        <FieldMessage error={error ? t(`sms.error.${error}`) : null} />
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: space[3] },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  flex: { flex: 1, gap: 2 },
  label: { ...type.bodyEmphasis, color: color.ink },
  meta: { ...type.meta, fontFamily: font.regular, color: color.stone600 },
});
