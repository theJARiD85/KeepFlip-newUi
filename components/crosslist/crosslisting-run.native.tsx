import { useEffect, useMemo, useRef, useState } from 'react';
import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet, View } from 'react-native';

import { MarketplaceAuthModal } from '@/components/connections/marketplace-auth-modal';
import type { CrosslistingRunProps } from '@/components/crosslist/crosslisting-run.types';
import { KeepFlipText as Text } from '@/components/ui/keepflip-text';
import { keepFlipTheme as theme } from '@/constants/keepflip-theme';
import { dispatchToAutomationEngine } from '@/services/crosslisting-automation-dispatch.native';
import { CROSSLISTING_RUN_MARKETPLACES } from '@/services/crosslisting-automation-plan';
import {
  CROSSLISTING_DESTINATIONS,
  type CrosslistingMarketplace,
  type CrosslistingPayload,
} from '@/services/crosslisting-service';
import { confirmMarketplaceListing, parseSavedListingDraft } from '@/services/listing-draft-service';
import { getMarketplaceSelections } from '@/services/marketplace-selections-service';

const MARKETPLACES = CROSSLISTING_RUN_MARKETPLACES;

type RunStatus = 'prepared' | 'submit_tapped' | 'confirmed';

export function CrosslistingRun({ item, listing, userId, onDraftPrepared, onListingConfirmed, onBeforeStart, initialSelections }: CrosslistingRunProps) {
  const confirmedMarketplaces = useMemo(() => parseSavedListingDraft(item.listingJson)?.confirmedMarketplaces ?? {}, [item.listingJson]);
  const [selected, setSelected] = useState<CrosslistingMarketplace[]>(() => MARKETPLACES.filter((marketplace) => initialSelections?.includes(marketplace) && !confirmedMarketplaces[marketplace]));
  const selectedAvailable = selected.filter((marketplace) => !confirmedMarketplaces[marketplace]);
  const [runTargets, setRunTargets] = useState<CrosslistingMarketplace[]>([]);
  const [runIndex, setRunIndex] = useState(0);
  const [active, setActive] = useState<CrosslistingMarketplace | null>(null);
  const [statuses, setStatuses] = useState<Partial<Record<CrosslistingMarketplace, RunStatus>>>({});
  const [finished, setFinished] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [runPayloads, setRunPayloads] = useState<Partial<Record<CrosslistingMarketplace, CrosslistingPayload>>>({});
  const [runPhotoFileIds, setRunPhotoFileIds] = useState<string[]>([]);
  const preparedRef = useRef<Set<CrosslistingMarketplace>>(new Set());
  const transitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current);
  }, []);
  useEffect(() => {
    let active = true;
    if (initialSelections) return;
    void getMarketplaceSelections(userId).then((saved) => {
      if (active) setSelected(MARKETPLACES.filter((marketplace) => saved.includes(marketplace) && !confirmedMarketplaces[marketplace]));
    }).catch(() => undefined);
    return () => { active = false; };
  }, [confirmedMarketplaces, initialSelections, userId]);
  const payload = active ? runPayloads[active] ?? null : null;
  const next = runTargets[runIndex + 1] ?? null;

  function toggle(marketplace: CrosslistingMarketplace) {
    if (runTargets.length || confirmedMarketplaces[marketplace]) return;
    setSelected((current) => current.includes(marketplace)
      ? current.filter((value) => value !== marketplace)
      : MARKETPLACES.filter((value) => value === marketplace || current.includes(value)));
    void Haptics.selectionAsync().catch(() => undefined);
  }

  async function start() {
    if (!selectedAvailable.length || starting) return;
    setStarting(true);
    setRunError(null);
    try {
      if (onBeforeStart && !await onBeforeStart()) {
        throw new Error('Save the listing draft before starting this run.');
      }
      dispatchToAutomationEngine({ item, listing, marketplaces: selectedAvailable }, (plan) => {
        const targets = plan.jobs.map((job) => job.marketplace);
        setRunPayloads(Object.fromEntries(plan.jobs.map((job) => [job.marketplace, job.payload])));
        setRunPhotoFileIds(plan.photoFileIds);
        setRunTargets(targets);
        setRunIndex(0);
        setStatuses({});
        preparedRef.current = new Set();
        setFinished(false);
        setActive(targets[0]);
      });
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    } catch (caught) {
      setRunError(caught instanceof Error ? caught.message : 'Could not start the listing run.');
    } finally {
      setStarting(false);
    }
  }

  function continueRun() {
    if (transitionTimerRef.current) return;
    setActive(null);
    if (next) {
      setRunIndex((index) => index + 1);
      transitionTimerRef.current = setTimeout(() => {
        transitionTimerRef.current = null;
        setActive(next);
      }, 400);
      void Haptics.selectionAsync().catch(() => undefined);
      return;
    }
    setRunTargets([]);
    setRunIndex(0);
    setFinished(true);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
  }

  function markPrepared(marketplace: CrosslistingMarketplace) {
    if (preparedRef.current.has(marketplace)) return;
    preparedRef.current.add(marketplace);
    setStatuses((current) => ({ ...current, [marketplace]: 'prepared' }));
    onDraftPrepared?.(marketplace);
  }

  async function confirm(marketplace: CrosslistingMarketplace, externalUrl?: string) {
    setRunError(null);
    try {
      await confirmMarketplaceListing(userId, item.id, marketplace, externalUrl);
      setStatuses((current) => ({ ...current, [marketplace]: 'confirmed' }));
      onListingConfirmed?.(marketplace);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    } catch (caught) {
      setRunError(caught instanceof Error ? caught.message : 'KeepFlip could not record this live listing.');
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.headingRow}>
        <View style={styles.headingCopy}>
          <Text style={styles.eyebrow}>CROSSLISTING RUN</Text>
          <Text style={styles.title}>Pick where this item goes</Text>
        </View>
        <View style={styles.countBadge}><Text style={styles.countText}>{selectedAvailable.length} SELECTED</Text></View>
      </View>
      <Text style={styles.body}>One run, one marketplace at a time. KeepFlip opens each seller page, fills the draft and tries to attach saved photos. You can review each listing before submitting.</Text>
      {runError ? <Text accessibilityRole="alert" style={styles.finished}>{runError}</Text> : null}
      <View style={styles.marketplaces}>
        {MARKETPLACES.map((marketplace) => {
          const checked = selected.includes(marketplace);
          const status = statuses[marketplace];
          const alreadyListed = Boolean(confirmedMarketplaces[marketplace]);
          return (
            <Pressable
              key={marketplace}
              accessibilityLabel={`${CROSSLISTING_DESTINATIONS[marketplace].label}, ${alreadyListed || status === 'confirmed' ? 'live listing confirmed' : status === 'submit_tapped' ? 'submit tapped' : status === 'prepared' ? 'draft prepared' : checked ? 'selected' : 'not selected'}`}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: checked || alreadyListed, disabled: runTargets.length > 0 || alreadyListed }}
              disabled={runTargets.length > 0 || alreadyListed}
              onPress={() => toggle(marketplace)}
              style={[styles.marketplace, (checked || alreadyListed) && styles.marketplaceSelected]}
            >
              <Text style={[styles.check, (checked || alreadyListed) && styles.checkSelected]}>{checked || alreadyListed ? '✓' : '+'}</Text>
              <Text style={[styles.marketplaceName, (checked || alreadyListed) && styles.marketplaceNameSelected]}>{CROSSLISTING_DESTINATIONS[marketplace].label}</Text>
              {status || alreadyListed ? <Text style={styles.marketplaceStatus}>{alreadyListed || status === 'confirmed' ? 'LISTED' : status === 'submit_tapped' ? 'SUBMIT TAPPED' : 'DRAFT FILLED'}</Text> : null}
            </Pressable>
          );
        })}
      </View>
      {finished ? <Text accessibilityRole="alert" style={styles.finished}>You reached the end of this run. Check each marketplace page for its own posting confirmation.</Text> : null}
      {runTargets.length ? (
        <View style={styles.runControls}>
          <Text style={styles.progress}>STOP {runIndex + 1} OF {runTargets.length} · {CROSSLISTING_DESTINATIONS[runTargets[runIndex]].label}</Text>
          <Pressable accessibilityRole="button" onPress={() => setActive(runTargets[runIndex])} style={styles.startButton}>
            <Text style={styles.startText}>{active ? 'Marketplace open' : 'Return to marketplace'}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => {
            if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current);
            transitionTimerRef.current = null;
            setActive(null);
            setRunTargets([]);
          }} style={styles.endButton}>
            <Text style={styles.endText}>End run</Text>
          </Pressable>
        </View>
      ) : (
        <Pressable accessibilityRole="button" accessibilityState={{ disabled: selectedAvailable.length === 0 || starting }} disabled={selectedAvailable.length === 0 || starting} onPress={() => { void start(); }} style={[styles.startButton, (selectedAvailable.length === 0 || starting) && styles.disabled]}>
          <Text style={styles.startText}>{starting ? 'Preparing your run…' : 'Start crosslisting →'}</Text>
        </Pressable>
      )}
      {active && payload ? (
        <MarketplaceAuthModal
          key={active}
          nextLabel={next ? CROSSLISTING_DESTINATIONS[next].label : 'Finish run'}
          onClose={() => setActive(null)}
          onNext={continueRun}
          onPrepared={() => markPrepared(active)}
          onSubmitPressed={() => setStatuses((current) => ({ ...current, [active]: 'submit_tapped' }))}
          onConfirmed={(externalUrl) => { void confirm(active, externalUrl); }}
          payload={payload}
          photoFileIds={runPhotoFileIds}
          platform={active}
          progressLabel={`${runIndex + 1} of ${runTargets.length}`}
          userId={userId}
          visible
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 12, borderWidth: 1, borderColor: theme.colors.dividerStrong, borderRadius: 10, backgroundColor: theme.colors.card, padding: 15 },
  headingRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headingCopy: { flex: 1, gap: 4 },
  eyebrow: { color: theme.colors.scannerCyan, fontSize: 9, fontWeight: '900', letterSpacing: 1.1 },
  title: { color: theme.colors.text, fontSize: 17, fontWeight: '900' },
  countBadge: { borderRadius: 20, backgroundColor: theme.colors.iconSurfaceCyan, paddingHorizontal: 9, paddingVertical: 6 },
  countText: { color: theme.colors.scannerCyan, fontSize: 9, fontWeight: '900' },
  body: { color: theme.colors.textMuted, fontSize: 12, lineHeight: 18 },
  marketplaces: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  marketplace: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: theme.colors.dividerStrong, borderRadius: 8, backgroundColor: theme.colors.surfaceInset, paddingHorizontal: 10 },
  marketplaceSelected: { borderColor: theme.colors.scannerCyan, backgroundColor: theme.colors.iconSurfaceCyan },
  check: { color: theme.colors.textMuted, fontSize: 15, fontWeight: '900' },
  checkSelected: { color: theme.colors.scannerCyan },
  marketplaceName: { color: theme.colors.textMuted, fontSize: 11, fontWeight: '800' },
  marketplaceNameSelected: { color: theme.colors.text },
  marketplaceStatus: { color: theme.colors.scannerCyan, fontSize: 8, fontWeight: '900' },
  startButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: theme.colors.scannerCyan, paddingHorizontal: 12 },
  startText: { color: theme.colors.textOnAccent, fontSize: 13, fontWeight: '900' },
  disabled: { opacity: 0.5 },
  runControls: { gap: 8 },
  progress: { color: theme.colors.scannerCyan, fontSize: 10, fontWeight: '900', letterSpacing: 0.7 },
  endButton: { minHeight: 36, alignItems: 'center', justifyContent: 'center' },
  endText: { color: theme.colors.textMuted, fontSize: 11, fontWeight: '800' },
  finished: { color: theme.colors.scannerCyan, fontSize: 12, lineHeight: 18 },
});
