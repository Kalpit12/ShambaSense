import Constants from 'expo-constants';
import { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { LockupOnLight } from '@/components/brand';
import { CoopCard } from '@/components/coop-card';
import { Button } from '@/components/button';
import { DarkHero, GlassPanel, HeroBody, onForestMuted } from '@/components/hero';
import { SignOutIcon } from '@/components/icons';
import { Enter, PressableScale } from '@/components/motion';
import { LanguageTiles } from '@/components/language-tiles';
import { Card, SectionTitle } from '@/components/screen';
import { Sheet } from '@/components/sheet';
import { SyncChip, syncTime } from '@/components/sync-chip';
import { forgetPushToken } from '@/lib/alerts';
import { forgetGuides } from '@/lib/guides';
import { forgetTasks } from '@/lib/tasks';
import { isPreview, useAuth } from '@/lib/auth';
import { useFarm } from '@/lib/farm-store';
import { formatKenya } from '@/lib/phone';
import { color, font, radius, space, type } from '@/theme/tokens';

export default function ProfileScreen() {
  const { t, i18n } = useTranslation();
  const { user, signOut } = useAuth();
  const { waiting, clear, plots, records, checks, followUps, canSend, sendNow, progress, offline, setOffline, lastSyncAt } = useFarm();
  const [confirming, setConfirming] = useState(false);
  const farm = user?.farm;

  const label = (ns: string, v: string) => t(`onboarding.${ns}.${v}`);
  const rows: [string, string][] = farm
    ? [
        [t('profile.crops'), farm.crops.map((c) => label('crops', c)).join(', ')],
        [t('profile.size'), label('size', farm.size)],
        [t('profile.place'), [farm.farmName, farm.ward, farm.county].filter(Boolean).join(', ')],
        [t('profile.water'), farm.water ? label('water', farm.water) : ''],
        [t('profile.animals'), farm.livestock.filter((l) => l !== 'none').map((l) => label('livestock', l)).join(', ')],
        [t('profile.group'), farm.coop ? farm.coopName || t('onboarding.coop.yes') : ''],
        [t('profile.goals'), farm.goals.map((g) => label('goals', g)).join(', ')],
      ].filter((r): r is [string, string] => !!r[1])
    : [];

  const doSignOut = async () => {
    setConfirming(false);
    await forgetPushToken();
    await forgetGuides(user?.id ?? user?.phone);
    await forgetTasks(user?.id ?? user?.phone);
    await clear();
    await signOut();
  };

  const pending = <T extends { sent?: boolean }>(rows: T[]) => rows.filter((r) => !r.sent).length;
  const queueRows = ([['checks', pending([...checks, ...followUps])], ['records', pending(records)], ['plots', pending(plots)]] as const).filter(([, n]) => n > 0);

  const stats = [
    { key: 'plots', value: plots.length, label: t('profile.statPlots') },
    { key: 'records', value: records.length, label: t('profile.statRecords') },
    { key: 'checks', value: checks.length, label: t('profile.statChecks') },
  ];

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <DarkHero>
          <Enter step={0}>
            <Text style={styles.eyebrow}>{t('profile.title')}</Text>
          </Enter>
          <Enter step={0} style={styles.who}>
            <View style={styles.avatarRing}>
              <View style={styles.avatar}>
                <Text style={styles.initial}>{(user?.name ?? '?').trim().charAt(0).toUpperCase()}</Text>
              </View>
            </View>
            <View style={styles.flex}>
              <Text style={styles.name} role="heading">
                {user?.name}
              </Text>
              {user?.phone ? <Text style={styles.phone}>{formatKenya(user.phone)}</Text> : null}
              {farm ? (
                <Text style={styles.farmLine} numberOfLines={1}>
                  {[farm.farmName, farm.county].filter(Boolean).join(' · ')}
                </Text>
              ) : null}
            </View>
          </Enter>
          <Enter step={1}>
            <GlassPanel style={styles.stats}>
              {stats.map((st, i) => (
                <View key={st.key} style={[styles.stat, i > 0 && styles.statDivider]}>
                  <Text style={styles.statValue}>{st.value}</Text>
                  <Text style={styles.statLabel}>{st.label}</Text>
                </View>
              ))}
            </GlassPanel>
          </Enter>
        </DarkHero>

        <HeroBody>
          <Enter step={2}>
            <SectionTitle>{t('profile.language')}</SectionTitle>
            <LanguageTiles light />
          </Enter>

          {rows.length > 0 ? (
            <Enter step={3}>
              <SectionTitle>{t('profile.farm')}</SectionTitle>
              <Card style={styles.list}>
                {rows.map(([k, v], i) => (
                  <View key={k} style={[styles.row, i > 0 && styles.divider]}>
                    <Text style={styles.rowLabel}>{k}</Text>
                    <Text style={styles.rowValue}>{v}</Text>
                  </View>
                ))}
              </Card>
            </Enter>
          ) : null}

          <Enter step={3}>
            <CoopCard signedIn={!!user?.id} />
          </Enter>

          <Enter step={3}>
            <SectionTitle>{t('profile.sync')}</SectionTitle>
            <Card style={styles.sync}>
              <SyncChip />
              {waiting > 0 ? (
                <View style={styles.queue}>
                  {queueRows.map(([k, n]) => (
                    <View key={k} style={styles.queueRow}>
                      <View style={styles.queueDot} />
                      <Text style={[styles.rowValue, styles.flex]}>{t(`sync.queue.${k}`)}</Text>
                      <Text style={styles.queueCount}>{n}</Text>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={styles.meta}>{t('sync.allSent')}</Text>
              )}
              {waiting > 0 && canSend && !progress ? <Button variant="secondary" label={t('sync.sendNow')} onPress={sendNow} /> : null}
              {lastSyncAt ? <Text style={styles.meta}>{t('sync.lastSent', { time: syncTime(lastSyncAt, t, i18n.language) })}</Text> : null}
              {isPreview ? (
                <View style={[styles.toggle, styles.divider]}>
                  <View style={styles.flex}>
                    <Text style={styles.rowValue}>{t('sync.pretendOffline')}</Text>
                    <Text style={styles.meta}>{t('sync.previewNote')}</Text>
                  </View>
                  <Switch
                    value={!!offline}
                    onValueChange={setOffline}
                    accessibilityLabel={t('sync.pretendOffline')}
                    trackColor={{ false: color.stone300, true: color.forest900 }}
                    thumbColor="#FFFFFF"
                  />
                </View>
              ) : null}
            </Card>
          </Enter>

          <Enter step={3}>
            <SectionTitle>{t('profile.about')}</SectionTitle>
            <Card style={styles.about}>
              <LockupOnLight height={28} />
              <Text style={styles.meta}>{t('profile.version', { version: Constants.expoConfig?.version ?? '0.1.0' })}</Text>
            </Card>
          </Enter>

          <PressableScale onPress={() => setConfirming(true)} accessibilityRole="button" accessibilityLabel={t('profile.signOut')} style={styles.signOut}>
            <SignOutIcon size={22} color={color.red700} />
            <Text style={styles.signOutText}>{t('profile.signOut')}</Text>
          </PressableScale>
        </HeroBody>
      </ScrollView>

      <Sheet
        open={confirming}
        onClose={() => setConfirming(false)}
        title={t('profile.signOutTitle')}
        footer={
          <>
            <Button label={t('profile.signOutConfirm')} onPress={doSignOut} />
            <Button variant="text" label={t('profile.cancel')} onPress={() => setConfirming(false)} />
          </>
        }>
        <Text style={styles.body}>{t('profile.signOutBody')}</Text>
        {waiting > 0 ? <Text style={styles.warn}>{t('sync.waitingLong', { count: waiting })}</Text> : null}
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.stone50 },
  scroll: { paddingBottom: space[8] + space[6] },
  flex: { flex: 1 },
  eyebrow: { ...type.label, color: onForestMuted, letterSpacing: 0.4 },
  who: { flexDirection: 'row', alignItems: 'center', gap: space[4], marginTop: space[1] },
  avatarRing: { width: 76, height: 76, borderRadius: 38, borderWidth: 2, borderColor: color.lime, alignItems: 'center', justifyContent: 'center' },
  avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: color.onForest, alignItems: 'center', justifyContent: 'center' },
  initial: { fontFamily: font.semibold, fontSize: 28, lineHeight: 34, color: color.forest900 },
  name: { ...type.display, color: color.onForest },
  phone: { ...type.body, color: onForestMuted },
  farmLine: { ...type.meta, fontFamily: font.regular, color: onForestMuted, marginTop: 2 },
  stats: { flexDirection: 'row', paddingVertical: space[3], paddingHorizontal: 0, marginTop: space[2] },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  statDivider: { borderLeftWidth: 1, borderLeftColor: 'rgba(244,241,230,0.14)' },
  statValue: { fontFamily: font.semibold, fontSize: 24, lineHeight: 30, color: color.onForest },
  statLabel: { ...type.label, color: onForestMuted },
  list: { paddingVertical: space[1] },
  row: { paddingVertical: space[3], gap: 2 },
  divider: { borderTopWidth: 1, borderTopColor: color.stone200 },
  rowLabel: { ...type.label, color: color.stone600 },
  rowValue: { ...type.body, color: color.ink },
  sync: { gap: space[3] },
  queue: { gap: space[2] },
  queueRow: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  queueDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: color.sky700 },
  queueCount: { ...type.bodyEmphasis, color: color.sky700 },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: space[3], paddingTop: space[3] },
  about: { gap: space[3] },
  meta: { ...type.meta, fontFamily: font.regular, color: color.stone600 },
  signOut: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space[2],
    minHeight: 56,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#F1C9C5',
    backgroundColor: color.red50,
  },
  signOutText: { ...type.bodyEmphasis, color: color.red700 },
  body: { ...type.body, color: color.stone600 },
  warn: { ...type.bodyEmphasis, color: color.red700 },
});
