import { type Href, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ComponentProps } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';

import { useKeepFlipAuth } from '@/components/auth/keepflip-auth-context';
import { useKeepFlipAppearance } from '@/components/settings/keepflip-appearance-context';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { KeepFlipText as Text } from '@/components/ui/keepflip-text';
import { getKeepFlipThemeColors, keepFlipTheme as theme } from '@/constants/keepflip-theme';
import {
  buildResellerBusinessOverview,
  type ResellerBusinessOverview,
} from '@/services/reseller-business-overview';
import {
  listInventoryItems,
  type InventoryItem,
} from '@/services/inventory-service';
import { listResellerLedgerEntries } from '@/services/reseller-ledger-service';

function money(cents: number) {
  const sign = cents < 0 ? '-' : '';
  return `${sign}$${(Math.abs(cents) / 100).toLocaleString(undefined, {
    maximumFractionDigits: 0,
  })}`;
}

function dollars(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return '—';
  return value.toLocaleString(undefined, {
    currency: 'USD',
    style: 'currency',
    maximumFractionDigits: 0,
  });
}

function firstName(name: string | null | undefined) {
  return name?.trim().split(/\s+/)[0] || 'seller';
}

function statusLabel(item: InventoryItem) {
  if (item.status === 'flip') return 'READY TO FLIP';
  if (item.status === 'keep') return 'KEEP';
  return 'UNDECIDED';
}

function statusColor(
  item: InventoryItem,
  colors: ReturnType<typeof getKeepFlipThemeColors>,
) {
  if (item.status === 'flip') return colors.scannerCyan;
  if (item.status === 'keep') return colors.scannerViolet;
  return colors.goldBright;
}

function MetricCard({
  label,
  value,
  detail,
  icon,
  accent,
  colors,
  compact,
}: {
  label: string;
  value: string;
  detail: string;
  icon: ComponentProps<typeof IconSymbol>['name'];
  accent: string;
  colors: ReturnType<typeof getKeepFlipThemeColors>;
  compact?: boolean;
}) {
  return (
    <View style={[styles.metricCard, { backgroundColor: colors.card, borderColor: colors.divider }]}>
      <View style={styles.metricTopline}>
        <View style={[styles.metricIcon, { backgroundColor: `${accent}1A`, borderColor: `${accent}55` }]}>
          <IconSymbol color={accent} name={icon} size={17} />
        </View>
        <Text style={[styles.metricLabel, { color: colors.textMuted }]}>{label}</Text>
      </View>
      <Text selectable style={[styles.metricValue, compact && styles.metricValueCompact, { color: colors.text }]}>{value}</Text>
      <Text style={[styles.metricDetail, { color: colors.textMuted }]}>{detail}</Text>
    </View>
  );
}

function ActionButton({
  label,
  detail,
  icon,
  accent,
  onPress,
  colors,
  primary = false,
}: {
  label: string;
  detail: string;
  icon: ComponentProps<typeof IconSymbol>['name'];
  accent: string;
  onPress: () => void;
  colors: ReturnType<typeof getKeepFlipThemeColors>;
  primary?: boolean;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionButton,
        {
          backgroundColor: primary ? accent : colors.card,
          borderColor: primary ? accent : colors.divider,
        },
        pressed && styles.pressed,
      ]}>
      <View style={[styles.actionIcon, { backgroundColor: primary ? 'rgba(0,0,0,0.16)' : `${accent}1A` }]}>
        <IconSymbol color={primary ? colors.textOnAccent : accent} name={icon} size={18} />
      </View>
      <View style={styles.actionCopy}>
        <Text style={[styles.actionLabel, { color: primary ? colors.textOnAccent : colors.text }]}>{label}</Text>
        <Text style={[styles.actionDetail, { color: primary ? `${colors.textOnAccent}B3` : colors.textMuted }]}>{detail}</Text>
      </View>
      <IconSymbol color={primary ? colors.textOnAccent : colors.textMuted} name="chevron.right" size={16} />
    </Pressable>
  );
}

function PanelHeader({
  eyebrow,
  title,
  action,
  colors,
  onAction,
}: {
  eyebrow: string;
  title: string;
  action?: string;
  colors: ReturnType<typeof getKeepFlipThemeColors>;
  onAction?: () => void;
}) {
  return (
    <View style={styles.panelHeader}>
      <View style={styles.panelHeadingCopy}>
        <Text style={[styles.panelEyebrow, { color: colors.goldBright }]}>{eyebrow}</Text>
        <Text style={[styles.panelTitle, { color: colors.text }]}>{title}</Text>
      </View>
      {action && onAction ? (
        <Pressable
          accessibilityRole="button"
          onPress={onAction}
          style={({ pressed }) => [styles.panelAction, { borderColor: colors.divider }, pressed && styles.pressed]}>
          <Text style={[styles.panelActionText, { color: colors.scannerCyan }]}>{action}</Text>
          <IconSymbol color={colors.scannerCyan} name="arrow.right" size={14} />
        </Pressable>
      ) : null}
    </View>
  );
}

export function CommandCenterScreen() {
  const { width } = useWindowDimensions();
  const isWide = width >= 1180;
  const isMedium = width >= 720;
  const router = useRouter();
  const { user } = useKeepFlipAuth();
  const { effectiveColorScheme } = useKeepFlipAppearance();
  const colors = getKeepFlipThemeColors(effectiveColorScheme);
  const [overview, setOverview] = useState<ResellerBusinessOverview | null>(null);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const ownerId = user?.$id ?? null;

  const loadWorkspace = useCallback(async () => {
    if (!ownerId) {
      setOverview(null);
      setInventory([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setErrorMessage(null);
    try {
      const [nextInventory, ledger] = await Promise.all([
        listInventoryItems(ownerId),
        listResellerLedgerEntries(ownerId),
      ]);
      setInventory(nextInventory);
      setOverview(
        buildResellerBusinessOverview({
          entries: ledger,
          inventory: nextInventory,
        }),
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'KeepFlip could not load your workspace numbers yet.',
      );
    } finally {
      setLoading(false);
    }
  }, [ownerId]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      void loadWorkspace();
    });

    return () => cancelAnimationFrame(frame);
  }, [loadWorkspace]);

  const chartData = useMemo(() => overview?.moneyFlow.slice(-6) ?? [], [overview]);
  const chartMax = Math.max(
    ...chartData.flatMap((bucket) => [bucket.moneyInCents, bucket.moneyOutCents]),
    1,
  );
  const attentionCount =
    (overview?.inventory.missingCostCount ?? 0) +
    (overview?.attention.unlinkedSaleCount ?? 0);

  const navigate = (href: Href) => router.push(href);

  return (
    <View style={[styles.root, { backgroundColor: colors.backgroundDeep }]}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingHorizontal: isWide ? 42 : isMedium ? 28 : 18,
            paddingTop: isWide ? 38 : 26,
            paddingBottom: 48,
          },
        ]}
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}>
        <View style={[styles.hero, isWide && styles.heroWide]}>
          <View style={styles.heroCopy}>
            <View style={styles.heroEyebrowRow}>
              <Text style={[styles.heroEyebrow, { color: colors.scannerCyan }]}>KEEPFLIP / COMMAND CENTER</Text>
              <View style={[styles.livePill, { backgroundColor: colors.successSurface, borderColor: `${colors.success}66` }]}>
                <View style={[styles.liveDot, { backgroundColor: colors.success }]} />
                <Text style={[styles.livePillText, { color: colors.success }]}>LIVE WORKSPACE</Text>
              </View>
            </View>
            <Text selectable style={[styles.heroTitle, { color: colors.text }]}>Good morning, {firstName(user?.name)}.</Text>
            <Text style={[styles.heroSubtitle, { color: colors.textMuted }]}>Make the next buy with the numbers, evidence, and work queue in view.</Text>
          </View>
          <View style={styles.heroActions}>
            <ActionButton
              accent={colors.scannerCyan}
              colors={colors}
              detail="Use the Android app for live capture"
              icon="viewfinder"
              label="Scan an item"
              onPress={() => navigate('/scanner')}
              primary
            />
            <ActionButton
              accent={colors.goldBright}
              colors={colors}
              detail="Record a real sale or cost"
              icon="chart.bar.fill"
              label="Open Books"
              onPress={() => navigate('/books')}
            />
          </View>
        </View>

        {errorMessage ? (
          <View style={[styles.errorBanner, { backgroundColor: colors.dangerSurface, borderColor: `${colors.danger}66` }]}>
            <IconSymbol color={colors.danger} name="exclamationmark.triangle.fill" size={18} />
            <View style={styles.errorCopy}>
              <Text style={[styles.errorTitle, { color: colors.text }]}>Your workspace needs a quick check</Text>
              <Text style={[styles.errorBody, { color: colors.textMuted }]}>{errorMessage}</Text>
            </View>
            <Pressable accessibilityRole="button" onPress={() => void loadWorkspace()} style={[styles.retryButton, { borderColor: `${colors.danger}66` }]}>
              <Text style={[styles.retryText, { color: colors.danger }]}>RETRY</Text>
            </Pressable>
          </View>
        ) : null}

        <View style={[styles.metricGrid, !isMedium && styles.metricGridCompact]}>
          <MetricCard
            accent={colors.scannerCyan}
            colors={colors}
            detail="Realized income this month"
            icon="arrow.right"
            label="MONEY IN"
            value={loading ? '—' : money(overview?.currentMonth.moneyInCents ?? 0)}
          />
          <MetricCard
            accent={colors.goldBright}
            colors={colors}
            detail="Purchases, fees, and expenses"
            icon="chart.bar.fill"
            label="COSTS"
            value={loading ? '—' : money(overview?.currentMonth.moneyOutCents ?? 0)}
          />
          <MetricCard
            accent={colors.scannerViolet}
            colors={colors}
            detail="Money in minus recorded costs"
            icon="dollarsign.circle.fill"
            label="LEFT AFTER COSTS"
            value={loading ? '—' : money(overview?.currentMonth.leftAfterCostsCents ?? 0)}
          />
          <MetricCard
            accent={colors.textMuted}
            colors={colors}
            detail="Actual cash tied to on-hand items"
            icon="shippingbox.fill"
            label="CASH TIED UP"
            value={loading ? '—' : money(overview?.inventory.cashTiedUpCents ?? 0)}
            compact
          />
        </View>

        <View style={[styles.dashboardGrid, isWide ? styles.dashboardGridWide : styles.dashboardGridStacked]}>
          <View style={[styles.panel, { backgroundColor: colors.card, borderColor: colors.divider }, isWide && styles.flowPanelWide]}>
            <PanelHeader action="OPEN BOOKS" colors={colors} eyebrow="MONEY MOVEMENT" onAction={() => navigate('/books')} title="Realized cash flow" />
            <Text style={[styles.panelDescription, { color: colors.textMuted }]}>Income and costs from reconciled Books records. Estimated item value stays out of this chart.</Text>
            {loading ? (
              <View style={styles.loadingState}>
                <ActivityIndicator color={colors.scannerCyan} />
                <Text style={[styles.loadingText, { color: colors.textMuted }]}>Loading your saved numbers…</Text>
              </View>
            ) : chartData.length ? (
              <View style={styles.chartWrap}>
                <View style={styles.chartLegend}>
                  <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: colors.scannerCyan }]} /><Text style={[styles.legendText, { color: colors.textMuted }]}>Money in</Text></View>
                  <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: colors.goldBright }]} /><Text style={[styles.legendText, { color: colors.textMuted }]}>Costs</Text></View>
                </View>
                <View style={styles.chartBars}>
                  {chartData.map((bucket) => {
                    const inHeight = Math.max(3, (bucket.moneyInCents / chartMax) * 132);
                    const outHeight = Math.max(3, (bucket.moneyOutCents / chartMax) * 132);
                    return (
                      <View key={bucket.key} style={styles.chartColumn}>
                        <View style={styles.chartBarPair}>
                          <View style={[styles.chartBar, { height: inHeight, backgroundColor: colors.scannerCyan }]} />
                          <View style={[styles.chartBar, { height: outHeight, backgroundColor: colors.goldBright }]} />
                        </View>
                        <Text style={[styles.chartLabel, { color: colors.textMuted }]}>{bucket.label}</Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            ) : (
              <View style={[styles.emptyState, { borderColor: colors.divider }]}>
                <IconSymbol color={colors.goldBright} name="chart.bar.fill" size={20} />
                <Text style={[styles.emptyTitle, { color: colors.text }]}>Your realized numbers will land here</Text>
                <Text style={[styles.emptyBody, { color: colors.textMuted }]}>Record an actual sale, purchase, fee, or expense in Books to make this view useful.</Text>
                <Pressable accessibilityRole="button" onPress={() => navigate('/books')} style={[styles.inlineAction, { borderColor: colors.accentGoldBorder, backgroundColor: colors.iconSurfaceGold }]}>
                  <Text style={[styles.inlineActionText, { color: colors.goldBright }]}>ADD A BOOKS RECORD</Text>
                </Pressable>
              </View>
            )}
          </View>

          <View style={[styles.panel, { backgroundColor: colors.card, borderColor: colors.divider }]}>
            <PanelHeader action="VIEW INVENTORY" colors={colors} eyebrow="WORK QUEUE" onAction={() => navigate('/inventory')} title="What needs your attention" />
            <Text style={[styles.panelDescription, { color: colors.textMuted }]}>Small cleanup tasks keep your margin and buying decisions honest.</Text>
            <View style={styles.focusList}>
              {overview?.inventory.missingCostCount ? (
                <Pressable accessibilityRole="button" onPress={() => navigate('/inventory')} style={({ pressed }) => [styles.focusRow, { borderColor: colors.divider }, pressed && styles.pressed]}>
                  <View style={[styles.focusIcon, { backgroundColor: colors.iconSurfaceGold }]}><IconSymbol color={colors.goldBright} name="tag.fill" size={17} /></View>
                  <View style={styles.focusCopy}><Text style={[styles.focusTitle, { color: colors.text }]}>{overview.inventory.missingCostCount} item{overview.inventory.missingCostCount === 1 ? '' : 's'} missing a real cost</Text><Text style={[styles.focusDetail, { color: colors.textMuted }]}>Add acquisition cost before calling profit realized.</Text></View>
                  <IconSymbol color={colors.textMuted} name="chevron.right" size={15} />
                </Pressable>
              ) : null}
              {overview?.attention.unlinkedSaleCount ? (
                <Pressable accessibilityRole="button" onPress={() => navigate('/books')} style={({ pressed }) => [styles.focusRow, { borderColor: colors.divider }, pressed && styles.pressed]}>
                  <View style={[styles.focusIcon, { backgroundColor: colors.dangerSurface }]}><IconSymbol color={colors.danger} name="exclamationmark.triangle.fill" size={17} /></View>
                  <View style={styles.focusCopy}><Text style={[styles.focusTitle, { color: colors.text }]}>{overview.attention.unlinkedSaleCount} sale{overview.attention.unlinkedSaleCount === 1 ? '' : 's'} needs an item match</Text><Text style={[styles.focusDetail, { color: colors.textMuted }]}>Linking it lets Books calculate realized margin.</Text></View>
                  <IconSymbol color={colors.textMuted} name="chevron.right" size={15} />
                </Pressable>
              ) : null}
              {overview?.attention.unlinkedInventoryCostCents ? (
                <Pressable accessibilityRole="button" onPress={() => navigate('/books')} style={({ pressed }) => [styles.focusRow, { borderColor: colors.divider }, pressed && styles.pressed]}>
                  <View style={[styles.focusIcon, { backgroundColor: colors.iconSurfaceViolet }]}><IconSymbol color={colors.scannerViolet} name="dollarsign.circle.fill" size={17} /></View>
                  <View style={styles.focusCopy}><Text style={[styles.focusTitle, { color: colors.text }]}>{money(overview.attention.unlinkedInventoryCostCents)} of costs need an item link</Text><Text style={[styles.focusDetail, { color: colors.textMuted }]}>Tie working capital to inventory for a cleaner picture.</Text></View>
                  <IconSymbol color={colors.textMuted} name="chevron.right" size={15} />
                </Pressable>
              ) : null}
              {!loading && attentionCount === 0 && !(overview?.attention.unlinkedInventoryCostCents) ? (
                <View style={[styles.clearState, { backgroundColor: colors.successSurface, borderColor: `${colors.success}55` }]}>
                  <IconSymbol color={colors.success} name="checkmark.circle.fill" size={19} />
                  <View style={styles.focusCopy}><Text style={[styles.focusTitle, { color: colors.text }]}>Nothing urgent in the queue</Text><Text style={[styles.focusDetail, { color: colors.textMuted }]}>Keep sourcing, then record the next real transaction.</Text></View>
                </View>
              ) : null}
              {loading ? <View style={styles.loadingState}><ActivityIndicator color={colors.scannerCyan} /></View> : null}
            </View>
            <View style={[styles.queueFooter, { borderTopColor: colors.divider }]}>
              <Text style={[styles.queueFooterLabel, { color: colors.textMuted }]}>ON HAND</Text>
              <Text style={[styles.queueFooterValue, { color: colors.text }]}>{overview?.inventory.onHandCount ?? 0} items</Text>
              <Text style={[styles.queueFooterNote, { color: colors.textMuted }]}>Est. value {money(overview?.inventory.estimatedOnHandValueCents ?? 0)} · not money earned</Text>
            </View>
          </View>
        </View>

        <View style={[styles.panel, { backgroundColor: colors.card, borderColor: colors.divider }]}>
          <PanelHeader action="SEE ALL" colors={colors} eyebrow="RECENT INVENTORY" onAction={() => navigate('/inventory')} title="Your saved finds" />
          <Text style={[styles.panelDescription, { color: colors.textMuted }]}>The newest items, with the decision context you need before the next listing.</Text>
          {loading ? (
            <View style={styles.loadingState}><ActivityIndicator color={colors.scannerCyan} /><Text style={[styles.loadingText, { color: colors.textMuted }]}>Loading inventory…</Text></View>
          ) : inventory.length ? (
            <View style={styles.inventoryList}>
              {inventory.slice(0, 5).map((item) => {
                const itemStatusColor = statusColor(item, colors);
                return (
                  <Pressable key={item.id} accessibilityRole="button" onPress={() => navigate('/inventory')} style={({ pressed }) => [styles.inventoryRow, { borderTopColor: colors.divider }, pressed && styles.pressed]}>
                    <View style={[styles.itemThumbnail, { backgroundColor: colors.iconSurface, borderColor: colors.divider }]}>
                      <IconSymbol color={itemStatusColor} name="shippingbox.fill" size={18} />
                    </View>
                    <View style={styles.itemCopy}>
                      <Text numberOfLines={1} style={[styles.itemTitle, { color: colors.text }]}>{item.title || 'Untitled find'}</Text>
                      <Text numberOfLines={1} style={[styles.itemMeta, { color: colors.textMuted }]}>{item.category || 'Uncategorized'} · {item.condition || 'Condition not set'}</Text>
                    </View>
                    <View style={styles.itemStatusColumn}><Text style={[styles.itemStatus, { color: itemStatusColor }]}>{statusLabel(item)}</Text><Text style={[styles.itemCost, { color: colors.textMuted }]}>{item.isListed ? 'LISTED' : 'NOT LISTED'}</Text></View>
                    <View style={styles.itemValueColumn}><Text selectable style={[styles.itemValue, { color: colors.text }]}>{dollars(item.estimatedValue)}</Text><Text style={[styles.itemCost, { color: colors.textMuted }]}>EST. RESALE</Text></View>
                    <IconSymbol color={colors.textMuted} name="chevron.right" size={16} />
                  </Pressable>
                );
              })}
            </View>
          ) : (
            <View style={[styles.emptyState, { borderColor: colors.divider }]}>
              <IconSymbol color={colors.scannerCyan} name="shippingbox.fill" size={21} />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>No saved finds yet</Text>
              <Text style={[styles.emptyBody, { color: colors.textMuted }]}>Scan on Android or add your first item to start building the shelf.</Text>
              <Pressable accessibilityRole="button" onPress={() => navigate('/scanner')} style={[styles.inlineAction, { borderColor: colors.accentCyanBorder, backgroundColor: colors.iconSurfaceCyan }]}>
                <Text style={[styles.inlineActionText, { color: colors.scannerCyan }]}>OPEN ANDROID SCANNER</Text>
              </Pressable>
            </View>
          )}
        </View>

        <View style={styles.sectionHeaderRow}>
          <View><Text style={[styles.panelEyebrow, { color: colors.goldBright }]}>NEXT MOVES</Text><Text style={[styles.panelTitle, { color: colors.text }]}>Keep the workflow moving</Text></View>
          <Text style={[styles.sectionHint, { color: colors.textMuted }]}>Fast paths from the desk</Text>
        </View>
        <View style={[styles.actionGrid, !isMedium && styles.actionGridCompact]}>
          <ActionButton accent={colors.scannerCyan} colors={colors} detail="Browse saved items and decisions" icon="shippingbox.fill" label="Work inventory" onPress={() => navigate('/inventory')} />
          <ActionButton accent={colors.goldBright} colors={colors} detail="See realized profit and costs" icon="chart.bar.fill" label="Reconcile Books" onPress={() => navigate('/books')} />
          <ActionButton accent={colors.scannerViolet} colors={colors} detail="Research a possible next buy" icon="magnifyingglass" label="Research the market" onPress={() => navigate('/market-research')} />
          <ActionButton accent={colors.goldBright} colors={colors} detail="Run the numbers before you buy" icon="dollarsign.circle.fill" label="Plan a flip" onPress={() => navigate('/flip-plan')} />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, minHeight: '100%' },
  content: { gap: 22 },
  hero: { gap: 22 },
  heroWide: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 30 },
  heroCopy: { flex: 1, minWidth: 0, gap: 10 },
  heroEyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  heroEyebrow: { fontFamily: theme.fonts.bold, fontSize: 9, letterSpacing: 1.6 },
  livePill: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5 },
  liveDot: { width: 6, height: 6, borderRadius: 3 },
  livePillText: { fontFamily: theme.fonts.bold, fontSize: 7, letterSpacing: 1 },
  heroTitle: { fontFamily: theme.fonts.semibold, fontSize: 34, letterSpacing: -0.8 },
  heroSubtitle: { maxWidth: 580, fontFamily: theme.fonts.body, fontSize: 14, lineHeight: 21 },
  heroActions: { gap: 10, minWidth: 280, maxWidth: 380 },
  actionButton: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 13, paddingVertical: 10, borderWidth: 1, borderRadius: 15 },
  actionIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  actionCopy: { flex: 1, minWidth: 0, gap: 3 },
  actionLabel: { fontFamily: theme.fonts.semibold, fontSize: 12 },
  actionDetail: { fontFamily: theme.fonts.body, fontSize: 10, lineHeight: 14 },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  metricGridCompact: { flexDirection: 'column' },
  metricCard: { flex: 1, minWidth: 180, minHeight: 132, borderWidth: 1, borderRadius: 17, padding: 16, gap: 10 },
  metricTopline: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  metricIcon: { width: 29, height: 29, borderRadius: 9, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  metricLabel: { fontFamily: theme.fonts.bold, fontSize: 8, letterSpacing: 1.2 },
  metricValue: { fontFamily: theme.fonts.bold, fontSize: 26, fontVariant: ['tabular-nums'] },
  metricValueCompact: { fontSize: 23 },
  metricDetail: { fontFamily: theme.fonts.body, fontSize: 10, lineHeight: 14 },
  dashboardGrid: { gap: 16 },
  dashboardGridWide: { flexDirection: 'row', alignItems: 'stretch' },
  dashboardGridStacked: { flexDirection: 'column' },
  flowPanelWide: { flex: 1.35 },
  panel: { borderWidth: 1, borderRadius: 18, padding: 19, gap: 13, flex: 1, minWidth: 0 },
  panelHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 },
  panelHeadingCopy: { gap: 4, flex: 1, minWidth: 0 },
  panelEyebrow: { fontFamily: theme.fonts.bold, fontSize: 8, letterSpacing: 1.35 },
  panelTitle: { fontFamily: theme.fonts.semibold, fontSize: 19 },
  panelDescription: { fontFamily: theme.fonts.body, fontSize: 11, lineHeight: 16, maxWidth: 650 },
  panelAction: { minHeight: 29, flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 999, paddingHorizontal: 9 },
  panelActionText: { fontFamily: theme.fonts.bold, fontSize: 7, letterSpacing: 1 },
  chartWrap: { gap: 13, paddingTop: 6 },
  chartLegend: { flexDirection: 'row', gap: 14 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 7, height: 7, borderRadius: 4 },
  legendText: { fontFamily: theme.fonts.body, fontSize: 10 },
  chartBars: { minHeight: 176, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-around', gap: 8, paddingTop: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(242, 211, 138, 0.15)' },
  chartColumn: { flex: 1, alignItems: 'center', gap: 8, minWidth: 28 },
  chartBarPair: { height: 140, flexDirection: 'row', alignItems: 'flex-end', gap: 3 },
  chartBar: { width: 9, minHeight: 3, borderRadius: 5 },
  chartLabel: { fontFamily: theme.fonts.medium, fontSize: 9 },
  loadingState: { minHeight: 118, alignItems: 'center', justifyContent: 'center', gap: 9 },
  loadingText: { fontFamily: theme.fonts.body, fontSize: 11 },
  emptyState: { minHeight: 145, alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderRadius: 14, borderStyle: 'dashed', padding: 20 },
  emptyTitle: { fontFamily: theme.fonts.semibold, fontSize: 13, textAlign: 'center' },
  emptyBody: { maxWidth: 440, fontFamily: theme.fonts.body, fontSize: 11, lineHeight: 16, textAlign: 'center' },
  inlineAction: { minHeight: 31, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: 999, paddingHorizontal: 11, marginTop: 3 },
  inlineActionText: { fontFamily: theme.fonts.bold, fontSize: 7, letterSpacing: 1 },
  focusList: { gap: 8 },
  focusRow: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 13, paddingHorizontal: 10, paddingVertical: 9 },
  focusIcon: { width: 31, height: 31, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  focusCopy: { flex: 1, minWidth: 0, gap: 3 },
  focusTitle: { fontFamily: theme.fonts.semibold, fontSize: 11 },
  focusDetail: { fontFamily: theme.fonts.body, fontSize: 10, lineHeight: 14 },
  clearState: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 13, padding: 11 },
  queueFooter: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', gap: 8, borderTopWidth: 1, paddingTop: 13, marginTop: 3 },
  queueFooterLabel: { fontFamily: theme.fonts.bold, fontSize: 8, letterSpacing: 1 },
  queueFooterValue: { fontFamily: theme.fonts.semibold, fontSize: 13 },
  queueFooterNote: { flexBasis: '100%', fontFamily: theme.fonts.body, fontSize: 10 },
  inventoryList: { gap: 0 },
  inventoryRow: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 11, borderTopWidth: 1, paddingVertical: 10 },
  itemThumbnail: { width: 38, height: 38, borderRadius: 11, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  itemCopy: { flex: 1, minWidth: 0, gap: 4 },
  itemTitle: { fontFamily: theme.fonts.semibold, fontSize: 12 },
  itemMeta: { fontFamily: theme.fonts.body, fontSize: 10 },
  itemStatusColumn: { minWidth: 92, alignItems: 'flex-end', gap: 4 },
  itemStatus: { fontFamily: theme.fonts.bold, fontSize: 8, letterSpacing: 0.7 },
  itemCost: { fontFamily: theme.fonts.bold, fontSize: 7, letterSpacing: 0.8 },
  itemValueColumn: { minWidth: 82, alignItems: 'flex-end', gap: 4 },
  itemValue: { fontFamily: theme.fonts.bold, fontSize: 14, fontVariant: ['tabular-nums'] },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 18 },
  sectionHint: { fontFamily: theme.fonts.body, fontSize: 11 },
  actionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  actionGridCompact: { flexDirection: 'column' },
  errorBanner: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 14, paddingHorizontal: 13, paddingVertical: 10 },
  errorCopy: { flex: 1, minWidth: 0, gap: 3 },
  errorTitle: { fontFamily: theme.fonts.semibold, fontSize: 12 },
  errorBody: { fontFamily: theme.fonts.body, fontSize: 10, lineHeight: 14 },
  retryButton: { minHeight: 29, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: 999, paddingHorizontal: 10 },
  retryText: { fontFamily: theme.fonts.bold, fontSize: 7, letterSpacing: 1 },
  pressed: { opacity: 0.72 },
});
