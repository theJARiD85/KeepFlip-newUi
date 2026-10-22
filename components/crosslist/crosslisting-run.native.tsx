import { useEffect, useMemo, useRef, useState } from 'react';
import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@react-native-vector-icons/ionicons';

import { MarketplaceAuthModal } from '@/components/connections/marketplace-auth-modal';
import type { CrosslistingRunProps } from '@/components/crosslist/crosslisting-run.types';
import { ListingShippingReview } from '@/components/crosslist/marketplace-shipping-choice';
import { useListingShippingReview } from '@/components/crosslist/use-listing-shipping-review';
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
import { useResponsiveLayout, useResponsiveStyles } from '@/hooks/use-responsive-layout';

const MARKETPLACES = CROSSLISTING_RUN_MARKETPLACES;

type RunStatus = 'prepared' | 'submit_tapped' | 'confirmed';

export function CrosslistingRun({ item, listing, userId, onDraftPrepared, onListingConfirmed, onBeforeStart, initialSelections }: CrosslistingRunProps) {
  const responsiveStyles = useResponsiveStyles(createStylesWebResponsive);
  const confirmedMarketplaces = useMemo(() => parseSavedListingDraft(item.listingJson)?.confirmedMarketplaces ?? {}, [item.listingJson]);
  const [selected, setSelected] = useState<CrosslistingMarketplace[]>(() => MARKETPLACES.filter((marketplace) => initialSelections?.includes(marketplace) && !confirmedMarketplaces[marketplace]));
  const shipping = useListingShippingReview(userId);
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
    shipping.resetConfirmation();
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
      const shippingPreferences = await shipping.prepareForRun(selectedAvailable);
      dispatchToAutomationEngine({ item, listing, marketplaces: selectedAvailable, shippingPreferences }, (plan) => {
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
    <View style={responsiveStyles.container}>
      <View style={responsiveStyles.headingRow}>
        <View style={responsiveStyles.headingCopy}>
          <Text style={responsiveStyles.eyebrow}>CROSSLISTING RUN</Text>
          <Text style={responsiveStyles.title}>Pick where this item goes</Text>
        </View>
        <View style={responsiveStyles.countBadge}><Text style={responsiveStyles.countText}>{selectedAvailable.length} SELECTED</Text></View>
      </View>
      <Text style={responsiveStyles.body}>One run, one marketplace at a time. KeepFlip opens each seller page, fills the draft and tries to attach saved photos. You can review each listing before submitting.</Text>
      {runError ? <Text accessibilityRole="alert" style={responsiveStyles.finished}>{runError}</Text> : null}
      <View style={responsiveStyles.marketplaces}>
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
              style={[responsiveStyles.marketplace, (checked || alreadyListed) && responsiveStyles.marketplaceSelected]}
            >
              <Ionicons color={checked || alreadyListed ? theme.colors.scannerCyan : theme.colors.textMuted} name={checked || alreadyListed ? 'checkmark-circle' : 'add'} size={19} style={[responsiveStyles.check, (checked || alreadyListed) && responsiveStyles.checkSelected]} />
              <Text style={[responsiveStyles.marketplaceName, (checked || alreadyListed) && responsiveStyles.marketplaceNameSelected]}>{CROSSLISTING_DESTINATIONS[marketplace].label}</Text>
              {status || alreadyListed ? <Text style={responsiveStyles.marketplaceStatus}>{alreadyListed || status === 'confirmed' ? 'LISTED' : status === 'submit_tapped' ? 'SUBMIT TAPPED' : 'DRAFT FILLED'}</Text> : null}
            </Pressable>
          );
        })}
      </View>
      <ListingShippingReview
        selected={selectedAvailable}
        choices={shipping.choices}
        defaults={shipping.defaults}
        confirmed={shipping.confirmed}
        disabled={runTargets.length > 0 || starting}
        loading={shipping.loading}
        error={shipping.error}
        onChange={shipping.setChoice}
        onConfirm={shipping.toggleConfirmed}
        onRetry={() => { void shipping.reload(); }}
      />
      {finished ? <Text accessibilityRole="alert" style={responsiveStyles.finished}>You reached the end of this run. Check each marketplace page for its own posting confirmation.</Text> : null}
      {runTargets.length ? (
        <View style={responsiveStyles.runControls}>
          <Text style={responsiveStyles.progress}>STOP {runIndex + 1} OF {runTargets.length} · {CROSSLISTING_DESTINATIONS[runTargets[runIndex]].label}</Text>
          <Pressable accessibilityRole="button" onPress={() => setActive(runTargets[runIndex])} style={responsiveStyles.startButton}>
            <Text style={responsiveStyles.startText}>{active ? 'Marketplace open' : 'Return to marketplace'}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => {
            if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current);
            transitionTimerRef.current = null;
            setActive(null);
            setRunTargets([]);
          }} style={responsiveStyles.endButton}>
            <Text style={responsiveStyles.endText}>End run</Text>
          </Pressable>
        </View>
      ) : (
        <Pressable accessibilityRole="button" accessibilityState={{ disabled: selectedAvailable.length === 0 || starting }} disabled={selectedAvailable.length === 0 || starting} onPress={() => { void start(); }} style={[responsiveStyles.startButton, (selectedAvailable.length === 0 || starting) && responsiveStyles.disabled]}>
          <Text style={responsiveStyles.startText}>{starting ? 'Preparing your run…' : <>Start crosslisting <Ionicons color={theme.colors.textOnAccent} name="arrow-forward" size={14} /></>}</Text>
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

function createStylesWebResponsive(layout: ReturnType<typeof useResponsiveLayout>) {
  return StyleSheet.create({
    ...styles,
    container: {
      ...styles["container"],
      gap: layout.isWeb ? layout.webResponsiveWidth(12) : layout.responsiveWidth(12),
      borderRadius: layout.isWeb ? layout.webResponsiveWidth(10) : layout.responsiveWidth(10),
    },
    headingRow: {
      ...styles["headingRow"],
      gap: layout.isWeb ? layout.webResponsiveWidth(12) : layout.responsiveWidth(12),
    },
    headingCopy: {
      ...styles["headingCopy"],
      gap: layout.isWeb ? layout.webResponsiveWidth(4) : layout.responsiveWidth(4),
    },
    eyebrow: {
      ...styles["eyebrow"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(9) : layout.responsiveFont(9),
    },
    title: {
      ...styles["title"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(17) : layout.responsiveFont(17),
    },
    countBadge: {
      ...styles["countBadge"],
      borderRadius: layout.isWeb ? layout.webResponsiveWidth(20) : layout.responsiveWidth(20),
      paddingHorizontal: layout.isWeb ? layout.webResponsiveWidth(9) : layout.responsiveWidth(9),
      paddingVertical: layout.isWeb ? layout.webResponsiveHeight(6) : layout.responsiveHeight(6),
    },
    countText: {
      ...styles["countText"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(9) : layout.responsiveFont(9),
    },
    body: {
      ...styles["body"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(12) : layout.responsiveFont(12),
      lineHeight: layout.isWeb ? layout.webResponsiveFont(18) : layout.responsiveFont(18),
    },
    marketplaces: {
      ...styles["marketplaces"],
      gap: layout.isWeb ? layout.webResponsiveWidth(8) : layout.responsiveWidth(8),
    },
    marketplace: {
      ...styles["marketplace"],
      minHeight: layout.isWeb ? layout.webResponsiveHeight(42) : layout.responsiveHeight(42),
      gap: layout.isWeb ? layout.webResponsiveWidth(6) : layout.responsiveWidth(6),
      borderRadius: layout.isWeb ? layout.webResponsiveWidth(8) : layout.responsiveWidth(8),
      paddingHorizontal: layout.isWeb ? layout.webResponsiveWidth(10) : layout.responsiveWidth(10),
    },
    check: {
      ...styles["check"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(15) : layout.responsiveFont(15),
    },
    marketplaceName: {
      ...styles["marketplaceName"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(11) : layout.responsiveFont(11),
    },
    marketplaceStatus: {
      ...styles["marketplaceStatus"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(8) : layout.responsiveFont(8),
    },
    startButton: {
      ...styles["startButton"],
      minHeight: layout.isWeb ? layout.webResponsiveHeight(48) : layout.responsiveHeight(48),
      borderRadius: layout.isWeb ? layout.webResponsiveWidth(8) : layout.responsiveWidth(8),
      paddingHorizontal: layout.isWeb ? layout.webResponsiveWidth(12) : layout.responsiveWidth(12),
    },
    startText: {
      ...styles["startText"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(13) : layout.responsiveFont(13),
    },
    runControls: {
      ...styles["runControls"],
      gap: layout.isWeb ? layout.webResponsiveWidth(8) : layout.responsiveWidth(8),
    },
    progress: {
      ...styles["progress"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(10) : layout.responsiveFont(10),
    },
    endButton: {
      ...styles["endButton"],
      minHeight: layout.isWeb ? layout.webResponsiveHeight(36) : layout.responsiveHeight(36),
    },
    endText: {
      ...styles["endText"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(11) : layout.responsiveFont(11),
    },
    finished: {
      ...styles["finished"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(12) : layout.responsiveFont(12),
      lineHeight: layout.isWeb ? layout.webResponsiveFont(18) : layout.responsiveFont(18),
    },
  });
}
