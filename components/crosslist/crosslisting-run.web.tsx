import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@react-native-vector-icons/ionicons';

import type { CrosslistingRunProps } from '@/components/crosslist/crosslisting-run.types';
import { KeepFlipText as Text } from '@/components/ui/keepflip-text';
import { keepFlipTheme as theme } from '@/constants/keepflip-theme';
import { dispatchToAutomationEngine } from '@/services/crosslisting-automation-dispatch.web';
import { CROSSLISTING_RUN_MARKETPLACES } from '@/services/crosslisting-automation-plan';
import {
  CROSSLISTING_DESTINATIONS,
  type CrosslistingMarketplace,
} from '@/services/crosslisting-service';
import {
  requestCrosslistingExtension,
  subscribeCrosslistingExtensionStatus,
  type ExtensionJob,
  type ExtensionStatus,
} from '@/services/crosslisting-extension-bridge.web';
import { confirmMarketplaceListing, parseSavedListingDraft } from '@/services/listing-draft-service';
import { getMarketplaceSelections } from '@/services/marketplace-selections-service';
import { useResponsiveLayout, useResponsiveStyles } from '@/hooks/use-responsive-layout';

const MARKETPLACES = CROSSLISTING_RUN_MARKETPLACES;

const STATUS_LABELS: Record<string, string> = {
  opening: 'OPENING', opened: 'OPEN', login_required: 'SIGN IN', filled: 'DRAFT READY',
  needs_review: 'CHECK FORM', submit_clicked: 'POSTING', confirmed: 'LISTED', error: 'NEEDS ATTENTION',
};

export function CrosslistingRun({ item, listing, userId, onDraftPrepared, onListingConfirmed, onBeforeStart, initialSelections }: CrosslistingRunProps) {
  const responsiveStyles = useResponsiveStyles(createStylesWebResponsive);
  const confirmed = useMemo(() => parseSavedListingDraft(item.listingJson)?.confirmedMarketplaces ?? {}, [item.listingJson]);
  const [selected, setSelected] = useState<CrosslistingMarketplace[]>(() => MARKETPLACES.filter((value) => initialSelections?.includes(value) && !confirmed[value]));
  const [extensionReady, setExtensionReady] = useState<boolean | null>(null);
  const [jobs, setJobs] = useState<ExtensionJob[]>([]);
  const [recorded, setRecorded] = useState<Set<CrosslistingMarketplace>>(() => new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const runIdRef = useRef<string | null>(null);
  const preparedRef = useRef<Set<CrosslistingMarketplace>>(new Set());
  const confirmedRef = useRef<Set<CrosslistingMarketplace>>(new Set());
  const available = selected.filter((marketplace) => !confirmed[marketplace] && !recorded.has(marketplace));

  useEffect(() => {
    let mounted = true;
    if (initialSelections) return;
    void getMarketplaceSelections(userId).then((saved) => {
      if (mounted) setSelected(MARKETPLACES.filter((marketplace) => saved.includes(marketplace) && !confirmed[marketplace]));
    }).catch(() => undefined);
    return () => { mounted = false; };
  }, [confirmed, initialSelections, userId]);

  useEffect(() => {
    let mounted = true;
    void requestCrosslistingExtension({ action: 'HELLO', ownerId: userId, itemId: item.id }).then((reply) => {
      if (!mounted) return;
      setExtensionReady(true);
      if (reply.run) {
        runIdRef.current = reply.run.id;
        setJobs(reply.run.jobs);
      }
    }).catch(() => { if (mounted) setExtensionReady(false); });
    return () => { mounted = false; };
  }, [item.id, userId]);

  const applyExtensionStatus = useCallback((status: ExtensionStatus) => {
    if (status.itemId !== item.id || status.runId !== runIdRef.current || !MARKETPLACES.includes(status.marketplace)) return;
    setJobs((current) => current.some((job) => job.marketplace === status.marketplace)
      ? current.map((job) => job.marketplace === status.marketplace
        ? { ...job, status: status.status, details: status } : job)
      : [...current, { marketplace: status.marketplace, tabId: null, status: status.status, details: status }]);
    if (status.status === 'filled' && !preparedRef.current.has(status.marketplace)) {
      preparedRef.current.add(status.marketplace);
      onDraftPrepared?.(status.marketplace);
    }
    if (status.status === 'confirmed' && !confirmedRef.current.has(status.marketplace)) {
      confirmedRef.current.add(status.marketplace);
      void confirmMarketplaceListing(userId, item.id, status.marketplace, status.externalUrl).then(() => {
        setRecorded((current) => new Set(current).add(status.marketplace));
        onListingConfirmed?.(status.marketplace);
      }).catch((caught: unknown) => {
        confirmedRef.current.delete(status.marketplace);
        setError(caught instanceof Error ? caught.message : 'KeepFlip could not record the listing.');
      });
    }
  }, [item.id, onDraftPrepared, onListingConfirmed, userId]);

  useEffect(() => subscribeCrosslistingExtensionStatus(applyExtensionStatus), [applyExtensionStatus]);

  useEffect(() => {
    if (!jobs.length) return;
    let mounted = true;
    const refreshRun = async () => {
      const currentRunId = runIdRef.current;
      if (!currentRunId) return;
      try {
        const reply = await requestCrosslistingExtension({ action: 'HELLO', ownerId: userId, itemId: item.id });
        if (!mounted || !reply.run || reply.run.id !== currentRunId) return;
        setJobs(reply.run.jobs);
        for (const job of reply.run.jobs) {
          if (!job.details) continue;
          applyExtensionStatus({
            ...job.details,
            runId: reply.run.id,
            itemId: item.id,
            marketplace: job.marketplace,
            status: job.status,
          });
        }
      } catch { /* Live status messages or the next poll will refresh the page. */ }
    };
    const timer = window.setInterval(() => void refreshRun(), 2500);
    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, [applyExtensionStatus, item.id, jobs.length, userId]);

  function toggle(marketplace: CrosslistingMarketplace) {
    if (jobs.length || confirmed[marketplace]) return;
    setSelected((current) => current.includes(marketplace)
      ? current.filter((value) => value !== marketplace)
      : MARKETPLACES.filter((value) => value === marketplace || current.includes(value)));
  }

  async function start() {
    if (!available.length || busy) return;
    setBusy(true);
    setError(null);
    setNotice('Preparing saved photos…');
    try {
      if (onBeforeStart && !await onBeforeStart()) {
        throw new Error('Save the listing draft before starting this run.');
      }
      const runId = globalThis.crypto?.randomUUID?.() ?? `run-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      runIdRef.current = runId;
      const dispatchedJobs = await dispatchToAutomationEngine({
        ownerId: userId, item, listing, marketplaces: available, runId,
        onPhotosReady: () => setNotice('Opening your marketplace tabs…'),
      });
      setJobs((current) => dispatchedJobs.map((job) => {
        const reported = current.find((candidate) => candidate.marketplace === job.marketplace);
        return reported ? { ...job, status: reported.status, details: reported.details } : job;
      }));
      setExtensionReady(true);
      setNotice('KeepFlip opened your listing tabs. Sign in if asked; each tab will fill when its form is ready.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not start the desktop listing run.');
      setNotice(null);
      runIdRef.current = null;
    } finally {
      setBusy(false);
    }
  }

  async function action(actionName: 'LISTING_FOCUS' | 'LISTING_RESUME' | 'LISTING_RETRY' | 'LISTING_SUBMIT', marketplace: CrosslistingMarketplace) {
    if (!runIdRef.current) return;
    setError(null);
    try {
      await requestCrosslistingExtension({ action: actionName, ownerId: userId, runId: runIdRef.current, marketplace });
      if (actionName === 'LISTING_RESUME') setNotice(`Returning to ${CROSSLISTING_DESTINATIONS[marketplace].label}'s listing form…`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The marketplace tab is unavailable.');
    }
  }

  async function markListed(marketplace: CrosslistingMarketplace) {
    if (confirmedRef.current.has(marketplace)) return;
    confirmedRef.current.add(marketplace);
    setError(null);
    try {
      await confirmMarketplaceListing(userId, item.id, marketplace);
      setRecorded((current) => new Set(current).add(marketplace));
      setJobs((current) => current.map((job) => job.marketplace === marketplace ? { ...job, status: 'confirmed' } : job));
      onListingConfirmed?.(marketplace);
    } catch (caught) {
      confirmedRef.current.delete(marketplace);
      setError(caught instanceof Error ? caught.message : 'KeepFlip could not record the live listing.');
    }
  }

  return <View style={responsiveStyles.card}>
    <View style={responsiveStyles.topline}><View style={responsiveStyles.heading}><Text style={responsiveStyles.eyebrow}>DESKTOP LISTING RUN</Text><Text style={responsiveStyles.title}>List where you sell</Text></View><Text style={responsiveStyles.count}>{available.length} SELECTED</Text></View>
    <Text style={responsiveStyles.body}>KeepFlip opens your marketplace tabs, fills the saved draft, and sends item photos to each upload control. Check each preview before posting.</Text>
    {extensionReady === false ? <Text accessibilityRole="alert" style={responsiveStyles.hint}>Load the KeepFlip Assistant extension in Chrome, then refresh this page.</Text> : null}
    <View style={responsiveStyles.choices}>{MARKETPLACES.map((marketplace) => {
      const listed = Boolean(confirmed[marketplace]) || recorded.has(marketplace);
      const checked = selected.includes(marketplace) || listed;
      return <Pressable key={marketplace} accessibilityRole="checkbox" accessibilityState={{ checked, disabled: listed || jobs.length > 0 }} disabled={listed || jobs.length > 0} onPress={() => toggle(marketplace)} style={[responsiveStyles.choice, checked && responsiveStyles.choiceSelected]}><Text style={[responsiveStyles.choiceText, checked && responsiveStyles.choiceTextSelected]}><Ionicons color={checked ? theme.colors.scannerCyan : theme.colors.textMuted} name={checked ? 'checkmark-circle' : 'add'} size={15} />{' '}{CROSSLISTING_DESTINATIONS[marketplace].label}</Text></Pressable>;
    })}</View>
    {error ? <Text accessibilityRole="alert" style={responsiveStyles.error}>{error}</Text> : null}
    {notice ? <Text style={responsiveStyles.notice}>{notice}</Text> : null}
    {!jobs.length ? <Pressable accessibilityRole="button" accessibilityState={{ disabled: !available.length || busy }} disabled={!available.length || busy} onPress={() => { void start(); }} style={[responsiveStyles.primary, (!available.length || busy) && responsiveStyles.disabled]}><Text style={responsiveStyles.primaryText}>{busy ? 'Preparing your run…' : <>Start listing <Ionicons color={theme.colors.textOnAccent} name="arrow-forward" size={14} /></>}</Text></Pressable> :
      <View style={responsiveStyles.jobs}>{jobs.map((job) => {
        const listed = Boolean(confirmed[job.marketplace]) || recorded.has(job.marketplace);
        const details = job.details as ExtensionStatus | null | undefined;
        return <View key={job.marketplace} style={responsiveStyles.job}>
          <View style={responsiveStyles.jobTop}><Text style={responsiveStyles.jobName}>{CROSSLISTING_DESTINATIONS[job.marketplace].label}</Text><Text style={responsiveStyles.jobStatus}>{listed ? 'LISTED' : job.status === 'confirmed' ? 'POST DETECTED' : STATUS_LABELS[job.status] ?? 'WORKING'}</Text></View>
          {details?.message ? <Text style={responsiveStyles.jobDetail}>{details.message}</Text> : null}
          {details?.missingFields?.length ? <Text style={responsiveStyles.jobDetail}>Check: {details.missingFields.join(', ')}</Text> : null}
          {details?.uploadedPhotoCount ? <Text style={responsiveStyles.jobDetail}>{details.uploadedPhotoCount} photo{details.uploadedPhotoCount === 1 ? '' : 's'} handed to the upload control. Check thumbnails in the marketplace tab.</Text> : null}
          {!listed ? <View style={responsiveStyles.jobActions}>
            <Pressable accessibilityRole="button" onPress={() => { void action('LISTING_FOCUS', job.marketplace); }} style={responsiveStyles.smallButton}><Text style={responsiveStyles.smallText}>Open tab</Text></Pressable>
            {job.status === 'login_required' ? <Pressable accessibilityRole="button" onPress={() => { void action('LISTING_RESUME', job.marketplace); }} style={responsiveStyles.smallButton}><Text style={responsiveStyles.smallText}>Resume form</Text></Pressable> : null}
            {job.status === 'needs_review' ? <Pressable accessibilityRole="button" onPress={() => { void action('LISTING_RETRY', job.marketplace); }} style={responsiveStyles.smallButton}><Text style={responsiveStyles.smallText}>Try filling again</Text></Pressable> : null}
            {job.status === 'filled' && job.marketplace !== 'facebookMarketplace' ? <Pressable accessibilityRole="button" onPress={() => { void action('LISTING_SUBMIT', job.marketplace); }} style={responsiveStyles.postButton}><Text style={responsiveStyles.postText}>Post listing</Text></Pressable> : null}
            {job.status === 'submit_clicked' || job.status === 'needs_review' || job.status === 'confirmed' ? <Pressable accessibilityRole="button" onPress={() => { void markListed(job.marketplace); }} style={responsiveStyles.smallButton}><Text style={responsiveStyles.smallText}>{job.status === 'confirmed' ? 'Save as listed' : 'I see it live'}</Text></Pressable> : null}
          </View> : null}
        </View>;
      })}</View>}
  </View>;
}

const styles = StyleSheet.create({
  card: { gap: 12, borderWidth: 1, borderColor: theme.colors.dividerStrong, borderRadius: 10, backgroundColor: theme.colors.card, padding: 15 },
  topline: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  heading: { flex: 1, gap: 4 },
  eyebrow: { color: theme.colors.scannerCyan, fontSize: 9, fontWeight: '900', letterSpacing: 1.1 },
  title: { color: theme.colors.text, fontSize: 17, fontWeight: '900' },
  count: { color: theme.colors.scannerCyan, fontSize: 9, fontWeight: '900' },
  body: { color: theme.colors.textMuted, fontSize: 12, lineHeight: 18 },
  hint: { color: theme.colors.goldBright, fontSize: 12, lineHeight: 18 },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choice: { minHeight: 38, justifyContent: 'center', borderWidth: 1, borderColor: theme.colors.dividerStrong, borderRadius: 8, backgroundColor: theme.colors.surfaceInset, paddingHorizontal: 10 },
  choiceSelected: { borderColor: theme.colors.scannerCyan, backgroundColor: theme.colors.iconSurfaceCyan },
  choiceText: { color: theme.colors.textMuted, fontSize: 11, fontWeight: '800' },
  choiceTextSelected: { color: theme.colors.text },
  error: { color: theme.colors.danger, fontSize: 12, lineHeight: 18 },
  notice: { color: theme.colors.scannerCyan, fontSize: 12, lineHeight: 18 },
  primary: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: theme.colors.scannerCyan },
  primaryText: { color: theme.colors.textOnAccent, fontSize: 13, fontWeight: '900' },
  disabled: { opacity: 0.5 },
  jobs: { gap: 9 },
  job: { gap: 7, borderWidth: 1, borderColor: theme.colors.dividerStrong, borderRadius: 8, backgroundColor: theme.colors.surfaceInset, padding: 10 },
  jobTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  jobName: { flex: 1, color: theme.colors.text, fontSize: 12, fontWeight: '800' },
  jobStatus: { color: theme.colors.scannerCyan, fontSize: 9, fontWeight: '900' },
  jobDetail: { color: theme.colors.textMuted, fontSize: 11, lineHeight: 16 },
  jobActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  smallButton: { minHeight: 34, justifyContent: 'center', borderWidth: 1, borderColor: theme.colors.dividerStrong, borderRadius: 6, paddingHorizontal: 10 },
  smallText: { color: theme.colors.text, fontSize: 10, fontWeight: '800' },
  postButton: { minHeight: 34, justifyContent: 'center', borderRadius: 6, backgroundColor: theme.colors.scannerCyan, paddingHorizontal: 10 },
  postText: { color: theme.colors.textOnAccent, fontSize: 10, fontWeight: '900' },
});

function createStylesWebResponsive(layout: ReturnType<typeof useResponsiveLayout>) {
  return StyleSheet.create({
    ...styles,
    card: {
      ...styles["card"],
      gap: layout.isWeb ? layout.webResponsiveWidth(12) : 12,
      borderRadius: layout.isWeb ? layout.webResponsiveWidth(10) : 10,
    },
    topline: {
      ...styles["topline"],
      gap: layout.isWeb ? layout.webResponsiveWidth(12) : 12,
    },
    heading: {
      ...styles["heading"],
      gap: layout.isWeb ? layout.webResponsiveWidth(4) : 4,
    },
    eyebrow: {
      ...styles["eyebrow"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(9) : 9,
    },
    title: {
      ...styles["title"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(17) : 17,
    },
    count: {
      ...styles["count"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(9) : 9,
    },
    body: {
      ...styles["body"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(12) : 12,
      lineHeight: layout.isWeb ? layout.webResponsiveFont(18) : 18,
    },
    hint: {
      ...styles["hint"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(12) : 12,
      lineHeight: layout.isWeb ? layout.webResponsiveFont(18) : 18,
    },
    choices: {
      ...styles["choices"],
      gap: layout.isWeb ? layout.webResponsiveWidth(8) : 8,
    },
    choice: {
      ...styles["choice"],
      minHeight: layout.isWeb ? layout.webResponsiveHeight(38) : 38,
      borderRadius: layout.isWeb ? layout.webResponsiveWidth(8) : 8,
      paddingHorizontal: layout.isWeb ? layout.webResponsiveWidth(10) : 10,
    },
    choiceText: {
      ...styles["choiceText"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(11) : 11,
    },
    error: {
      ...styles["error"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(12) : 12,
      lineHeight: layout.isWeb ? layout.webResponsiveFont(18) : 18,
    },
    notice: {
      ...styles["notice"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(12) : 12,
      lineHeight: layout.isWeb ? layout.webResponsiveFont(18) : 18,
    },
    primary: {
      ...styles["primary"],
      minHeight: layout.isWeb ? layout.webResponsiveHeight(48) : 48,
      borderRadius: layout.isWeb ? layout.webResponsiveWidth(8) : 8,
    },
    primaryText: {
      ...styles["primaryText"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(13) : 13,
    },
    jobs: {
      ...styles["jobs"],
      gap: layout.isWeb ? layout.webResponsiveWidth(9) : 9,
    },
    job: {
      ...styles["job"],
      gap: layout.isWeb ? layout.webResponsiveWidth(7) : 7,
      borderRadius: layout.isWeb ? layout.webResponsiveWidth(8) : 8,
    },
    jobTop: {
      ...styles["jobTop"],
      gap: layout.isWeb ? layout.webResponsiveWidth(8) : 8,
    },
    jobName: {
      ...styles["jobName"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(12) : 12,
    },
    jobStatus: {
      ...styles["jobStatus"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(9) : 9,
    },
    jobDetail: {
      ...styles["jobDetail"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(11) : 11,
      lineHeight: layout.isWeb ? layout.webResponsiveFont(16) : 16,
    },
    jobActions: {
      ...styles["jobActions"],
      gap: layout.isWeb ? layout.webResponsiveWidth(7) : 7,
    },
    smallButton: {
      ...styles["smallButton"],
      minHeight: layout.isWeb ? layout.webResponsiveHeight(34) : 34,
      borderRadius: layout.isWeb ? layout.webResponsiveWidth(6) : 6,
      paddingHorizontal: layout.isWeb ? layout.webResponsiveWidth(10) : 10,
    },
    smallText: {
      ...styles["smallText"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(10) : 10,
    },
    postButton: {
      ...styles["postButton"],
      minHeight: layout.isWeb ? layout.webResponsiveHeight(34) : 34,
      borderRadius: layout.isWeb ? layout.webResponsiveWidth(6) : 6,
      paddingHorizontal: layout.isWeb ? layout.webResponsiveWidth(10) : 10,
    },
    postText: {
      ...styles["postText"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(10) : 10,
    },
  });
}
