import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState, type ComponentType, type ReactNode } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/button';
import { CheckMark } from '@/components/check-status';
import { CaretDownIcon, CaretLeftIcon, CheckIcon, InfoIcon, PersonIcon, ProhibitIcon, QuestionIcon, ShieldCheckIcon, WarningIcon, WifiSlashIcon } from '@/components/icons';
import { CheckPhoto, LeafArt } from '@/components/leaf-art';
import { Enter, PressableScale } from '@/components/motion';
import { OutcomeTag } from '@/components/outcome';
import { Card, SectionTitle } from '@/components/screen';
import { Sheet } from '@/components/sheet';
import { isPreview } from '@/lib/auth';
import { STEP_COUNT, type CheckResult } from '@/lib/check-results';
import { formatDate, localDay } from '@/lib/dates';
import { todayIso, useFarm, type CropCheck, type FollowUp } from '@/lib/farm-store';
import { followUpsOf, followUpState, type FollowUpState } from '@/lib/follow-up';
import { guideFor, useGuides } from '@/lib/guides';
import { color, font, radius, space, type } from '@/theme/tokens';

type IconProps = { size?: number; color?: string; weight?: 'regular' | 'fill' | 'bold' };

/**
 * Crop check result, the signature screen (design.md §9): evidence split, a state chip in words
 * (never a %), what we see, possible causes, "not a confirmed diagnosis", reviewed next steps,
 * Ask an agronomist, Save to journal and "Why this result?". Before the answer arrives it shows the
 * photo with the honest waiting or checking state (§12, §15).
 */
export default function ResultScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { checks, followUps, plots, offline, canSend, sendNow, progress, askAgronomist, saveCheckToJournal } = useFarm();
  const [asking, setAsking] = useState(false);
  const [why, setWhy] = useState(false);
  const { guides } = useGuides();
  const check = checks.find((c) => c.id === id);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/journal'));

  if (!check)
    return (
      <View style={[styles.root, styles.missing]}>
        <Text style={styles.body}>{t('result.notFound')}</Text>
        <Button variant="secondary" label={t('common.back')} onPress={back} />
      </View>
    );

  const crop = t(`onboarding.crops.${check.crop}`);
  const plot = plots.find((p) => p.id === check.plotId);
  const result = check.status === 'done' ? check.result : undefined;
  const top = result?.causes[0];
  // A guide the co-op reviewed and published replaces the built-in steps for the top cause.
  const guide = top ? guideFor(guides, top.id, i18n.language) : undefined;
  const steps = top ? (guide?.steps ?? Array.from({ length: STEP_COUNT[top.id] }, (_, i) => t(`causes.${top.id}.step${i + 1}`))) : [];
  const stateLabel = result
    ? result.state === 'possible_match'
      ? t(`result.likelihood.${top?.likelihood ?? 'possible'}`)
      : t(`result.states.${result.state}`)
    : undefined;
  const mine = followUpsOf(followUps, check.id);
  const follow = followUpState(check, followUps, todayIso());
  const takeFollowUp = () => router.push({ pathname: '/check', params: { followUp: check.id } });
  const retake = () => router.replace({ pathname: '/check', params: check.plotId ? { plot: check.plotId } : {} });

  const saveToJournal = () => {
    if (!top) return;
    saveCheckToJournal(check.id, t('result.journalNote', { crop: crop.toLowerCase(), cause: t(`causes.${top.id}.name`), likelihood: t(`result.likelihood.${top.likelihood}`).toLowerCase() }));
  };

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.scroll, { paddingTop: insets.top + space[2], paddingBottom: insets.bottom + space[8] }]}>
        <Enter step={0} style={styles.head}>
          <PressableScale onPress={back} accessibilityRole="button" accessibilityLabel={t('common.back')} scaleTo={0.92} style={styles.backBtn}>
            <CaretLeftIcon size={22} color={color.ink} weight="bold" />
          </PressableScale>
          <View style={styles.flex}>
            <Text style={styles.title} role="heading" numberOfLines={2}>
              {t('journal.checkTitle', { crop })}
            </Text>
            <Text style={styles.meta} numberOfLines={1}>
              {[plot?.name, formatDate(localDay(check.createdAt), i18n.language)].filter(Boolean).join(' · ')}
            </Text>
          </View>
        </Enter>

        {/* Evidence split: the farmer's photo beside a similar reviewed case. */}
        <Enter step={1} style={styles.split}>
          <View style={styles.pane}>
            <Text style={styles.paneLabel}>{t('result.whatWeSee')}</Text>
            <CheckPhoto uri={check.photoUri} radius={radius.md} style={styles.well} />
          </View>
          <View style={styles.pane}>
            <Text style={styles.paneLabel}>{t('result.similarCase')}</Text>
            <ReferencePane check={check} result={result} onRetake={retake} />
          </View>
        </Enter>

        {check.reply ? (
          <Enter step={2}>
            <ReplyCard check={check} follow={follow} onPhoto={takeFollowUp} />
          </Enter>
        ) : null}

        {mine.length ? (
          <Enter step={2}>
            <FollowUps first={check} list={mine} />
          </Enter>
        ) : null}

        {result ? (
          <Enter step={2} style={styles.stack}>
            <CheckMark check={{ ...check, askedAt: undefined, reply: undefined }} large label={stateLabel} />
            {result.state !== 'unsupported_crop' ? (
              <Banner Icon={WarningIcon} fg={color.amber800} bg={color.amber50} title={t('result.notConfirmed')} body={t('result.notConfirmedBody')} />
            ) : null}
            {check.askedAt && !check.reply ? (
              <Banner Icon={PersonIcon} fg={color.forest900} bg={color.forest50} title={t('result.askedTitle')} body={[t('result.askedBody'), isPreview ? t('result.askPreview') : null].filter(Boolean).join(' ')} />
            ) : null}
            {result.preview ? <Banner Icon={InfoIcon} fg={color.sky700} bg={color.sky50} title={t('result.previewTag')} body={t('result.previewBody')} /> : null}
          </Enter>
        ) : (
          <Enter step={2}>
            <Pending check={check} offline={!!offline} canSend={canSend} sending={!!progress} onSend={sendNow} />
          </Enter>
        )}

        {result?.state === 'possible_match' && top ? (
          <>
            <Enter step={3}>
              <SectionTitle>{t('result.observed')}</SectionTitle>
              <Card style={styles.list}>
                {[1, 2, 3].map((n) => (
                  <Bullet key={n}>{t(`causes.${top.id}.sign${n}`)}</Bullet>
                ))}
              </Card>
            </Enter>

            <Enter step={3}>
              <SectionTitle>{t('result.causes')}</SectionTitle>
              <Card style={styles.causes}>
                {result.causes.map((c, i) => (
                  <View key={c.id} style={[styles.cause, i > 0 && styles.divider]}>
                    <View style={styles.flex}>
                      <Text style={styles.causeName}>{t(`causes.${c.id}.name`)}</Text>
                      <Text style={styles.latin}>{t(`causes.${c.id}.latin`)}</Text>
                    </View>
                    <View style={[styles.likely, c.likelihood === 'more_likely' ? styles.likelyStrong : styles.likelySoft]}>
                      <Text style={styles.likelyText}>{t(`result.likelihood.${c.likelihood}`)}</Text>
                    </View>
                  </View>
                ))}
              </Card>
            </Enter>

            <Enter step={3}>
              <SectionTitle>{t('result.nextSteps')}</SectionTitle>
              <Card style={styles.steps}>
                {steps.map((step, i) => (
                  <View key={i} style={styles.step}>
                    <View style={styles.stepNum}>
                      <Text style={styles.stepNumText}>{i + 1}</Text>
                    </View>
                    <Text style={[styles.body, styles.flex, styles.ink]}>{step}</Text>
                  </View>
                ))}
                {guide?.warning ? <Text style={[styles.bodyStrong, styles.warnText]}>{guide.warning}</Text> : null}
                {guide ? (
                  <PressableScale onPress={() => router.push({ pathname: '/guides/[id]', params: { id: guide.id } })} accessibilityRole="link">
                    <Text style={styles.source}>
                      {guide.reviewerName && guide.reviewedOn ? t('guides.reviewed', { name: guide.reviewerName, date: formatDate(guide.reviewedOn, i18n.language) }) : t('result.guideReviewed')}
                      {guide.coopName ? ` · ${guide.coopName}` : ''}
                    </Text>
                  </PressableScale>
                ) : (
                  <Text style={styles.source}>{result.preview ? t('result.guidePreview') : t('result.guideReviewed')}</Text>
                )}
              </Card>
            </Enter>
          </>
        ) : null}

        {result ? (
          <Enter step={3} style={styles.actions}>
            {result.state === 'needs_more_information' ? <Button label={t('result.retake')} onPress={retake} /> : null}
            {!check.askedAt ? (
              <Button
                variant={result.state === 'possible_match' || result.state === 'needs_more_information' ? 'secondary' : 'primary'}
                label={t('result.askAgronomist')}
                onPress={() => setAsking(true)}
              />
            ) : null}
            {result.state === 'possible_match' ? (
              check.journalId ? (
                <View style={styles.savedRow}>
                  <CheckIcon size={18} color={color.ink} weight="bold" />
                  <Text style={styles.savedText}>{t('result.savedToJournal')}</Text>
                </View>
              ) : (
                <Button variant="secondary" label={t('result.saveToJournal')} onPress={saveToJournal} />
              )
            ) : null}
          </Enter>
        ) : null}

        {result ? (
          <Enter step={3}>
            <Card style={styles.why}>
              <PressableScale onPress={() => setWhy((w) => !w)} accessibilityRole="button" accessibilityState={{ expanded: why }} style={styles.whyHead}>
                <Text style={[styles.bodyStrong, styles.flex]}>{t('result.why')}</Text>
                <View style={why && styles.flip}>
                  <CaretDownIcon size={20} color={color.ink} />
                </View>
              </PressableScale>
              {why ? (
                <Enter step={0} style={styles.whyBody}>
                  {whyLines(result, crop, t).map((line) => (
                    <Bullet key={line}>{line}</Bullet>
                  ))}
                  <Text style={styles.source}>{t('result.library', { version: result.library })}</Text>
                </Enter>
              ) : null}
            </Card>
          </Enter>
        ) : null}
      </ScrollView>

      <Sheet
        open={asking}
        onClose={() => setAsking(false)}
        title={t('result.askTitle')}
        footer={
          <>
            <Button
              label={t('result.askSend')}
              onPress={() => {
                askAgronomist(check.id);
                setAsking(false);
              }}
            />
            <Button variant="text" label={t('profile.cancel')} onPress={() => setAsking(false)} />
          </>
        }>
        <Text style={styles.body}>{t('result.askBody')}</Text>
        {isPreview ? <Text style={styles.meta}>{t('result.askPreview')}</Text> : null}
      </Sheet>
    </View>
  );
}

/** Right half of the evidence split. Without a reviewed match it never shows a made-up picture. */
function ReferencePane({ check, result, onRetake }: { check: CropCheck; result?: CheckResult; onRetake: () => void }) {
  const { t } = useTranslation();
  const top = result?.causes[0];
  if (result?.state === 'possible_match' && top)
    return (
      <View>
        <LeafArt pattern={top.id} style={styles.well} />
        <Text style={styles.caption} numberOfLines={2}>
          {result.preview ? t('result.illustration') : t(`causes.${top.id}.name`)}
        </Text>
      </View>
    );
  if (result?.state === 'needs_more_information')
    return (
      <PressableScale onPress={onRetake} accessibilityRole="button" style={[styles.well, styles.emptyWell, styles.retakeWell]}>
        <QuestionIcon size={28} color={color.sky700} weight="fill" />
        <Text style={[styles.emptyText, styles.sky]}>{t('result.retakeShort')}</Text>
      </PressableScale>
    );
  const [Icon, text]: [ComponentType<IconProps>, string] =
    result?.state === 'unsupported_crop'
      ? [ProhibitIcon, t('result.noReference', { crop: t(`onboarding.crops.${check.crop}`).toLowerCase() })]
      : result?.state === 'expert_review_required'
        ? [PersonIcon, t('result.expertPane')]
        : [InfoIcon, t('result.afterCheck')];
  return (
    <View style={[styles.well, styles.emptyWell]}>
      <Icon size={26} color={color.stone600} />
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

/** The agronomist's answer. A person reviewed it, so it reads as an answer, unlike the library result. */
function ReplyCard({ check, follow, onPhoto }: { check: CropCheck; follow: FollowUpState; onPhoto: () => void }) {
  const { t, i18n } = useTranslation();
  const reply = check.reply!;
  const causes = reply.causeIds.map((id) => t(`causes.${id}.name`, { defaultValue: id })).join(', ');
  const due = 'due' in follow ? follow.due : undefined;
  const overdue = follow.kind === 'overdue';
  return (
    <View style={styles.reply}>
      <View style={styles.replyHead}>
        <View style={styles.replyIcon}>
          <PersonIcon size={20} color={color.onForest} weight="fill" />
        </View>
        <View style={styles.flex}>
          <Text style={styles.replyTitle}>{t('result.replyTitle')}</Text>
          <Text style={styles.meta}>{t('result.replyBy', { name: reply.by, date: formatDate(localDay(reply.at), i18n.language) })}</Text>
        </View>
      </View>
      <Text style={styles.replyKind}>
        {[t(`result.replyKinds.${reply.kind}`), causes || null].filter(Boolean).join(' · ')}
      </Text>
      <Text style={[styles.body, styles.ink]}>{reply.body}</Text>
      {follow.kind === 'requested' || follow.kind === 'due' || follow.kind === 'overdue' || follow.kind === 'upcoming' ? (
        <>
          {due ? (
            <Text style={[styles.meta, overdue && styles.overdue]}>
              {t(overdue ? 'result.followUpOverdue' : 'result.followUpDue', { date: formatDate(due, i18n.language) })}
            </Text>
          ) : null}
          <Button label={t('result.sendFollowUp')} onPress={onPhoto} />
        </>
      ) : null}
      {follow.kind === 'sent' ? (
        <View style={styles.replyNote}>
          <ActivityIndicator color={color.forest900} size="small" />
          <Text style={[styles.meta, styles.flex]}>{t('followUp.sentWaiting', { name: reply.by })}</Text>
        </View>
      ) : null}
      {follow.kind === 'closed' ? (
        <View style={styles.replyNote}>
          <ShieldCheckIcon size={20} color={color.forest900} weight="fill" />
          <View style={styles.flex}>
            <Text style={styles.bodyStrong}>{t('followUp.closed')}</Text>
            <Text style={styles.meta}>{t('followUp.closedBody', { name: reply.by })}</Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

/** The first photo beside the latest follow-up, then every follow-up with the farmer's own verdict. */
function FollowUps({ first, list }: { first: CropCheck; list: FollowUp[] }) {
  const { t, i18n } = useTranslation();
  const latest = list[0];
  return (
    <View style={styles.stack}>
      <SectionTitle>{t('followUp.sectionTitle')}</SectionTitle>
      <Card style={styles.stack}>
        <View style={styles.split}>
          <View style={styles.pane}>
            <Text style={styles.paneLabel}>{t('followUp.before')}</Text>
            <CheckPhoto uri={first.photoUri} radius={radius.md} style={styles.well} />
            <Text style={styles.caption}>{formatDate(localDay(first.createdAt), i18n.language)}</Text>
          </View>
          <View style={styles.pane}>
            <Text style={styles.paneLabel}>{t('followUp.latest')}</Text>
            <CheckPhoto uri={latest.photoUri} radius={radius.md} style={styles.well} />
            <Text style={styles.caption}>{formatDate(localDay(latest.createdAt), i18n.language)}</Text>
          </View>
        </View>
        {list.map((f, i) => (
          <View key={f.id} style={[styles.followRow, i > 0 && styles.divider]}>
            {list.length > 1 ? <CheckPhoto uri={f.photoUri} size={48} radius={radius.sm} /> : null}
            <View style={[styles.flex, styles.followText]}>
              <OutcomeTag outcome={f.outcome} />
              <Text style={styles.meta}>
                {[formatDate(localDay(f.createdAt), i18n.language), f.sent ? t('followUp.sent') : t('followUp.waitingSend')].join(' · ')}
              </Text>
            </View>
          </View>
        ))}
      </Card>
    </View>
  );
}

/** Before the answer: saved on the phone, sending, or being checked. */
function Pending({ check, offline, canSend, sending, onSend }: { check: CropCheck; offline: boolean; canSend: boolean; sending: boolean; onSend: () => void }) {
  const { t } = useTranslation();
  const checking = check.status === 'checking';
  return (
    <Card style={styles.pending}>
      <CheckMark check={check} large />
      <View style={styles.pendingRow}>
        {(checking && !check.askedAt) || sending ? <ActivityIndicator color={color.sky700} /> : offline ? <WifiSlashIcon size={22} color={color.sky700} /> : null}
        <Text style={[styles.body, styles.flex, styles.ink]}>
          {check.askedAt && check.sent ? t('result.askedBody') : checking ? t('result.checkingBody') : offline ? t('result.offlineBody') : t('result.waitingBody')}
        </Text>
      </View>
      {!checking && canSend && !sending ? <Button variant="secondary" label={t('sync.sendNow')} onPress={onSend} /> : null}
      <Text style={styles.meta}>{t('check.notDiagnosis')}</Text>
    </Card>
  );
}

function whyLines(result: CheckResult, crop: string, t: (k: string, o?: Record<string, unknown>) => string) {
  const lines: string[] = [];
  const lower = crop.toLowerCase();
  if (result.state === 'possible_match') {
    lines.push(t('result.whyLines.compared', { crop: lower }));
    lines.push(
      result.causes.length === 1
        ? t('result.whyLines.closest', { cause: t(`causes.${result.causes[0].id}.name`) })
        : t('result.whyLines.several', { causes: result.causes.map((c) => t(`causes.${c.id}.name`)).join(t('result.whyLines.and')) }),
    );
    lines.push(t('result.whyLines.words'));
  }
  if (result.state === 'needs_more_information') lines.push(t('result.whyLines.unclear'));
  if (result.state === 'expert_review_required') lines.push(t('result.whyLines.expert'));
  if (result.state === 'unsupported_crop') lines.push(t('result.whyLines.unsupported', { crop: lower }));
  lines.push(t('result.whyLines.noProducts'));
  if (result.preview) lines.push(t('result.whyLines.preview'));
  return lines;
}

function Banner({ Icon, fg, bg, title, body }: { Icon: ComponentType<IconProps>; fg: string; bg: string; title: string; body: string }) {
  return (
    <View style={[styles.banner, { backgroundColor: bg }]} accessible accessibilityLabel={`${title} ${body}`}>
      <Icon size={22} color={fg} weight="fill" />
      <View style={styles.flex}>
        <Text style={[styles.bannerTitle, { color: fg }]}>{title}</Text>
        <Text style={[styles.bannerBody, { color: color.stone800 }]}>{body}</Text>
      </View>
    </View>
  );
}

function Bullet({ children }: { children: ReactNode }) {
  return (
    <View style={styles.bullet}>
      <View style={styles.bulletDot} />
      <Text style={[styles.body, styles.flex, styles.ink]}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.stone50 },
  missing: { justifyContent: 'center', padding: space[5], gap: space[4] },
  scroll: { paddingHorizontal: space[4], gap: space[4] },
  flex: { flex: 1 },
  ink: { color: color.ink },
  head: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  backBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: color.stone100 },
  title: { ...type.title, color: color.ink },
  meta: { ...type.meta, fontFamily: font.regular, color: color.stone600 },
  split: { flexDirection: 'row', gap: space[3] },
  pane: { flex: 1, gap: space[2] },
  paneLabel: { ...type.label, color: color.stone600 },
  well: { width: '100%', aspectRatio: 1, borderRadius: radius.md, overflow: 'hidden' },
  emptyWell: { backgroundColor: color.stone100, alignItems: 'center', justifyContent: 'center', padding: space[3], gap: space[2] },
  retakeWell: { backgroundColor: color.sky50, borderWidth: 1, borderColor: '#BFD6E4', borderStyle: 'dashed' },
  emptyText: { ...type.meta, color: color.stone600, textAlign: 'center' },
  sky: { color: color.sky700 },
  caption: { ...type.meta, fontFamily: font.regular, fontSize: 12, lineHeight: 16, color: color.stone600, marginTop: space[1] },
  stack: { gap: space[3] },
  banner: { flexDirection: 'row', gap: space[3], padding: space[4], borderRadius: radius.md, alignItems: 'flex-start' },
  bannerTitle: { ...type.bodyEmphasis, fontSize: 16, lineHeight: 22 },
  bannerBody: { ...type.meta, fontFamily: font.regular, marginTop: 2 },
  list: { gap: space[3] },
  bullet: { flexDirection: 'row', gap: space[3], alignItems: 'flex-start' },
  bulletDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: color.stone600, marginTop: 10 },
  causes: { paddingVertical: space[1] },
  cause: { flexDirection: 'row', alignItems: 'center', gap: space[3], paddingVertical: space[3] },
  divider: { borderTopWidth: 1, borderTopColor: color.stone200 },
  causeName: { ...type.bodyEmphasis, color: color.ink },
  latin: { ...type.meta, fontFamily: font.regular, fontStyle: 'italic', color: color.stone600 },
  likely: { paddingHorizontal: space[3], paddingVertical: 6, borderRadius: radius.full, borderWidth: 1 },
  likelyStrong: { backgroundColor: color.amber50, borderColor: color.amber50 },
  likelySoft: { backgroundColor: '#FFFFFF', borderColor: '#E8D3AE' },
  likelyText: { fontFamily: font.semibold, fontSize: 14, lineHeight: 18, color: color.amber800 },
  steps: { gap: space[3] },
  step: { flexDirection: 'row', gap: space[3], alignItems: 'flex-start' },
  stepNum: { width: 28, height: 28, borderRadius: 14, backgroundColor: color.forest50, alignItems: 'center', justifyContent: 'center', marginTop: 0 },
  stepNumText: { fontFamily: font.semibold, fontSize: 14, lineHeight: 18, color: color.forest900 },
  source: { ...type.meta, fontFamily: font.regular, fontSize: 13, color: color.stone600 },
  actions: { gap: space[3] },
  savedRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space[2], minHeight: 48 },
  savedText: { ...type.bodyEmphasis, color: color.ink },
  why: { paddingVertical: space[1] },
  whyHead: { flexDirection: 'row', alignItems: 'center', minHeight: 48, gap: space[3] },
  flip: { transform: [{ rotate: '180deg' }] },
  whyBody: { gap: space[3], paddingBottom: space[3] },
  pending: { gap: space[3] },
  reply: { gap: space[3], padding: space[4], borderRadius: radius.md, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: color.forest100, borderLeftWidth: 4, borderLeftColor: color.forest900 },
  replyHead: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  replyIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: color.forest900, alignItems: 'center', justifyContent: 'center' },
  replyTitle: { ...type.bodyEmphasis, color: color.forest900 },
  replyKind: { ...type.meta, color: color.ink },
  overdue: { color: color.amber800 },
  replyNote: { flexDirection: 'row', alignItems: 'center', gap: space[3], padding: space[3], borderRadius: radius.sm, backgroundColor: color.forest50 },
  followRow: { flexDirection: 'row', alignItems: 'center', gap: space[3], paddingTop: space[3] },
  followText: { gap: space[1] },
  pendingRow: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  body: { ...type.body, color: color.stone600 },
  bodyStrong: { ...type.bodyEmphasis, color: color.ink },
  warnText: { fontSize: 16, lineHeight: 22, color: color.amber800 },
});
