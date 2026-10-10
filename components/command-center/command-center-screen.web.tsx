import { useRouter, type Href } from 'expo-router';
import type { ComponentProps } from 'react';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from 'react-native-reanimated';

import { useKeepFlipAuth } from '@/components/auth/keepflip-auth-context';
import { BusinessPulse } from '@/components/command-center/business-pulse';
import {
  BusinessPulseBreakdownModal,
  type BusinessPulseMetric,
} from '@/components/command-center/business-pulse-breakdown-modal';
import { KeepFlipAuroraShader } from '@/components/command-center/keepflip-aurora-shader.web';
import { useKeepFlipAppearance } from '@/components/settings/keepflip-appearance-context';
import { KeepFlipText as Text } from '@/components/ui/keepflip-text';
import { getKeepFlipThemeColors, keepFlipTheme as theme } from '@/constants/keepflip-theme';
import {
  listInventoryItems,
  type InventoryItem,
} from '@/services/inventory-service';
import {
  buildResellerBusinessOverview,
  type ResellerBusinessOverview,
} from '@/services/reseller-business-overview';
import { listResellerLedgerEntries } from '@/services/reseller-ledger-service';

import { useResponsiveLayout , useResponsiveStyles} from '@/hooks/use-responsive-layout';
function money(cents: number) {
  const sign = cents < 0 ? '-' : '';
  return `${sign}$${(Math.abs(cents) / 100).toLocaleString(undefined, {
    maximumFractionDigits: 0,
  })}`;
}

function colorWithAlpha(color: string, alpha: number) {
  const hex = color.trim().replace(/^#/, '');
  const rgb = hex.length === 8 ? hex.slice(0, 6) : hex;
  if (!/^(?:[\da-f]{3}|[\da-f]{6})$/i.test(rgb)) return color;
  const expanded = rgb.length === 3 ? [...rgb].map((part) => part + part).join('') : rgb;
  const red = Number.parseInt(expanded.slice(0, 2), 16);
  const green = Number.parseInt(expanded.slice(2, 4), 16);
  const blue = Number.parseInt(expanded.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
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
  accessibilityHint,
  onPress,
}: {
  label: string;
  value: string;
  detail: string;
  icon: ComponentProps<typeof Ionicons>['name'];
  accent: string;
  colors: ReturnType<typeof getKeepFlipThemeColors>;
  compact?: boolean;
  accessibilityHint?: string;
  onPress?: () => void;
}) {
  const responsiveStyles = useResponsiveStyles(createStylesWebResponsive);
  const prefersReducedMotion = useReducedMotion();
  const hoverProgress = useSharedValue(0);
  const animatedCardStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: -4 * hoverProgress.value },
      { scale: 1 + 0.012 * hoverProgress.value },
    ],
  }));
  const setHovered = (hovered: boolean) => {
    if (prefersReducedMotion) {
      hoverProgress.value = 0;
      return;
    }
    hoverProgress.value = withSpring(hovered ? 1 : 0, { damping: 18, stiffness: 180 });
  };
  const contents = (
    <>
      <View
        pointerEvents="none"
        style={[responsiveStyles.metricAccentGlow, {
          backgroundColor: accent,
          boxShadow: `0 0 42px 18px ${colorWithAlpha(accent, 0.34)}`,
        }]}
      />
      <View style={responsiveStyles.metricTopline}>
        <View style={[responsiveStyles.metricIcon, { backgroundColor: colorWithAlpha(accent, 0.13), borderColor: colorWithAlpha(accent, 0.30) }]}>
          <Ionicons color={accent} name={icon} size={17} />
        </View>
        <Text style={[responsiveStyles.metricLabel, { color: colors.textMuted }]}>{label}</Text>
        {onPress ? <Ionicons color={accent} name="chevron.right" size={13} /> : null}
      </View>
      <Text selectable style={[responsiveStyles.metricValue, compact && responsiveStyles.metricValueCompact, { color: colors.text }]}>{value}</Text>
      <Text style={[responsiveStyles.metricDetail, { color: colors.textMuted }]}>{detail}</Text>
    </>
  );

  const cardStyle = [responsiveStyles.metricCard, { backgroundColor: colors.card, borderColor: colors.divider }];
  return (
    <Animated.View style={[responsiveStyles.metricMotion, animatedCardStyle]}>
      {onPress ? (
        <Pressable
          accessibilityHint={accessibilityHint}
          accessibilityLabel={`${label}, ${value}`}
          accessibilityRole="button"
          onFocus={() => setHovered(true)}
          onHoverIn={() => setHovered(true)}
          onHoverOut={() => setHovered(false)}
          onBlur={() => setHovered(false)}
          onPress={onPress}
          style={({ pressed }) => [cardStyle, pressed && responsiveStyles.metricCardPressed]}
        >
          {contents}
        </Pressable>
      ) : (
        <View style={cardStyle}>{contents}</View>
      )}
    </Animated.View>
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
  flexible = false,
}: {
  label: string;
  detail: string;
  icon: ComponentProps<typeof Ionicons>['name'];
  accent: string;
  onPress: () => void;
  colors: ReturnType<typeof getKeepFlipThemeColors>;
  primary?: boolean;
  flexible?: boolean;
}) {
  const responsiveStyles2 = useResponsiveStyles(createStylesWebResponsive);
  const prefersReducedMotion = useReducedMotion();
  const hoverProgress = useSharedValue(0);
  const animatedButtonStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: -3 * hoverProgress.value },
      { scale: 1 + 0.01 * hoverProgress.value },
    ],
  }));
  const setHovered = (hovered: boolean) => {
    if (prefersReducedMotion) {
      hoverProgress.value = 0;
      return;
    }
    hoverProgress.value = withSpring(hovered ? 1 : 0, { damping: 18, stiffness: 180 });
  };
  return (
    <Animated.View style={[responsiveStyles2.actionMotion, flexible && responsiveStyles2.actionMotionFlexible, animatedButtonStyle]}>
      <Pressable
        accessibilityLabel={label}
        accessibilityRole="button"
        onFocus={() => setHovered(true)}
        onHoverIn={() => setHovered(true)}
        onHoverOut={() => setHovered(false)}
        onBlur={() => setHovered(false)}
        onPress={onPress}
        style={({ pressed }) => [
          responsiveStyles2.actionButton,
          {
            backgroundColor: primary ? accent : colors.card,
            borderColor: primary ? accent : colors.divider,
          },
          pressed && responsiveStyles2.pressed,
        ]}>
        {!primary ? (
          <View
            pointerEvents="none"
            style={[responsiveStyles2.actionAccentGlow, {
              backgroundColor: accent,
              boxShadow: `0 0 32px 12px ${colorWithAlpha(accent, 0.30)}`,
            }]}
          />
        ) : null}
        <View style={[responsiveStyles2.actionIcon, { backgroundColor: primary ? 'rgba(0,0,0,0.16)' : colorWithAlpha(accent, 0.13) }]}>
          <Ionicons color={primary ? colors.textOnAccent : accent} name={icon} size={18} />
        </View>
        <View style={responsiveStyles2.actionCopy}>
          <Text style={[responsiveStyles2.actionLabel, { color: primary ? colors.textOnAccent : colors.text }]}>{label}</Text>
          <Text style={[responsiveStyles2.actionDetail, { color: primary ? colorWithAlpha(colors.textOnAccent, 0.72) : colors.textMuted }]}>{detail}</Text>
        </View>
        <Ionicons color={primary ? colors.textOnAccent : accent} name="chevron.right" size={16} />
      </Pressable>
    </Animated.View>
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
  const responsiveStyles3 = useResponsiveStyles(createStylesWebResponsive);
  return (
    <View style={responsiveStyles3.panelHeader}>
      <View style={responsiveStyles3.panelHeadingCopy}>
        <Text style={[responsiveStyles3.panelEyebrow, { color: colors.goldBright }]}>{eyebrow}</Text>
        <Text style={[responsiveStyles3.panelTitle, { color: colors.text }]}>{title}</Text>
      </View>
      {action && onAction ? (
        <Pressable
          accessibilityRole="button"
          onPress={onAction}
          style={({ pressed }) => [responsiveStyles3.panelAction, { borderColor: colors.divider }, pressed && responsiveStyles3.pressed]}>
          <Text style={[responsiveStyles3.panelActionText, { color: colors.scannerCyan }]}>{action}</Text>
          <Ionicons color={colors.scannerCyan} name="arrow.right" size={14} />
        </Pressable>
      ) : null}
    </View>
  );
}

export function CommandCenterScreen() {
  const responsiveLayout = useResponsiveLayout();
  const responsiveStyles4 = useResponsiveStyles(createStylesWebResponsive);
  const {
    webContentMaxWidth,
    webContentWidth,
    webPageGutter,
    contentMaxWidth,
    contentWidth,
    pageGutter
  } = useResponsiveLayout();

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
  const [activeBreakdown, setActiveBreakdown] =
    useState<BusinessPulseMetric | null>(null);

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

  const attentionCount =
    (overview?.inventory.missingCostCount ?? 0) +
    (overview?.attention.unlinkedSaleCount ?? 0);

  const navigate = (href: Href) => router.push(href);

  return (
    <View style={[responsiveStyles4.root, { backgroundColor: colors.backgroundDeep }]}>
      <KeepFlipAuroraShader isLight={effectiveColorScheme === 'light'} />
      <ScrollView
        style={responsiveStyles4.scrollView}
        contentContainerStyle={[responsiveStyles4.content,
        {
          paddingHorizontal: isWide ? 42 : isMedium ? 28 : 18,
          paddingTop: isWide ? 38 : 26,
          paddingBottom: responsiveLayout.isWeb ? responsiveLayout.webResponsiveHeight(48) : 48,
        }, { width: webContentWidth, maxWidth: webContentMaxWidth, alignSelf: 'center', paddingHorizontal: webPageGutter }, { width: contentWidth, maxWidth: contentMaxWidth, alignSelf: 'center', paddingHorizontal: pageGutter }]}
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}>
        <View style={[responsiveStyles4.hero, isWide && responsiveStyles4.heroWide]}>
          <View style={responsiveStyles4.heroCopy}>
            <View style={responsiveStyles4.heroEyebrowRow}>
              <Text style={[responsiveStyles4.heroEyebrow, { color: colors.scannerCyan }]}>KEEPFLIP / COMMAND CENTER</Text>
              <View style={[responsiveStyles4.livePill, { backgroundColor: colors.successSurface, borderColor: `${colors.success}66` }]}>
                <View style={[responsiveStyles4.liveDot, { backgroundColor: colors.success }]} />
                <Text style={[responsiveStyles4.livePillText, { color: colors.success }]}>LIVE WORKSPACE</Text>
              </View>
            </View>
            <Text selectable style={[responsiveStyles4.heroTitle, { color: colors.text }]}>Good morning, {firstName(user?.name)}.</Text>
            <Text style={[responsiveStyles4.heroSubtitle, { color: colors.textMuted }]}>Make the next buy with the numbers, evidence, and work queue in view.</Text>
          </View>
          <View style={responsiveStyles4.heroActions}>
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
          <View style={[responsiveStyles4.errorBanner, { backgroundColor: colors.dangerSurface, borderColor: `${colors.danger}66` }]}>
            <Ionicons color={colors.danger} name="exclamationmark.triangle.fill" size={18} />
            <View style={responsiveStyles4.errorCopy}>
              <Text style={[responsiveStyles4.errorTitle, { color: colors.text }]}>Your workspace needs a quick check</Text>
              <Text style={[responsiveStyles4.errorBody, { color: colors.textMuted }]}>{errorMessage}</Text>
            </View>
            <Pressable accessibilityRole="button" onPress={() => void loadWorkspace()} style={[responsiveStyles4.retryButton, { borderColor: `${colors.danger}66` }]}>
              <Text style={[responsiveStyles4.retryText, { color: colors.danger }]}>RETRY</Text>
            </Pressable>
          </View>
        ) : null}

        <View style={[responsiveStyles4.metricGrid, !isMedium && responsiveStyles4.metricGridCompact]}>
          <MetricCard
            accent={colors.scannerCyan}
            colors={colors}
            detail="Realized income this month"
            icon="arrow.right"
            label="MONEY IN"
            accessibilityHint="Shows every income entry that makes up this month's total"
            onPress={overview ? () => setActiveBreakdown('money-in') : undefined}
            value={loading ? '—' : money(overview?.currentMonth.moneyInCents ?? 0)}
          />
          <MetricCard
            accent={colors.goldBright}
            colors={colors}
            detail="Purchases, fees, and expenses"
            icon="chart.bar.fill"
            label="COSTS"
            accessibilityHint="Shows every cost entry that makes up this month's total"
            onPress={overview ? () => setActiveBreakdown('costs') : undefined}
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
            accessibilityHint="Shows the on-hand items included in this total and their saved costs"
            onPress={overview ? () => setActiveBreakdown('cash-tied-up') : undefined}
            value={loading ? '—' : money(overview?.inventory.cashTiedUpCents ?? 0)}
            compact
          />
        </View>

        <View style={responsiveStyles4.pulseSection}>
          <BusinessPulse
            errorMessage={errorMessage}
            loading={loading}
            onOpenBooks={() => navigate('/books')}
            onOpenFlipPlan={() => navigate('/flip-plan')}
            overview={overview}
          />
        </View>

        <View style={[responsiveStyles4.dashboardGrid, responsiveStyles4.dashboardGridStacked]}>
          <View style={[responsiveStyles4.panel, { backgroundColor: colors.card, borderColor: colors.divider }]}>
            <PanelHeader action="VIEW INVENTORY" colors={colors} eyebrow="WORK QUEUE" onAction={() => navigate('/inventory')} title="What needs your attention" />
            <Text style={[responsiveStyles4.panelDescription, { color: colors.textMuted }]}>Small cleanup tasks keep your margin and buying decisions honest.</Text>
            <View style={responsiveStyles4.focusList}>
              {overview?.inventory.missingCostCount ? (
                <Pressable accessibilityRole="button" onPress={() => navigate('/inventory')} style={({ pressed }) => [responsiveStyles4.focusRow, { borderColor: colors.divider }, pressed && responsiveStyles4.pressed]}>
                  <View style={[responsiveStyles4.focusIcon, { backgroundColor: colors.iconSurfaceGold }]}><Ionicons color={colors.goldBright} name="tag.fill" size={17} /></View>
                  <View style={responsiveStyles4.focusCopy}><Text style={[responsiveStyles4.focusTitle, { color: colors.text }]}>{overview.inventory.missingCostCount} item{overview.inventory.missingCostCount === 1 ? '' : 's'} missing a real cost</Text><Text style={[responsiveStyles4.focusDetail, { color: colors.textMuted }]}>Add acquisition cost before calling profit realized.</Text></View>
                  <Ionicons color={colors.textMuted} name="chevron.right" size={15} />
                </Pressable>
              ) : null}
              {overview?.attention.unlinkedSaleCount ? (
                <Pressable accessibilityRole="button" onPress={() => navigate('/books')} style={({ pressed }) => [responsiveStyles4.focusRow, { borderColor: colors.divider }, pressed && responsiveStyles4.pressed]}>
                  <View style={[responsiveStyles4.focusIcon, { backgroundColor: colors.dangerSurface }]}><Ionicons color={colors.danger} name="exclamationmark.triangle.fill" size={17} /></View>
                  <View style={responsiveStyles4.focusCopy}><Text style={[responsiveStyles4.focusTitle, { color: colors.text }]}>{overview.attention.unlinkedSaleCount} sale{overview.attention.unlinkedSaleCount === 1 ? '' : 's'} needs an item match</Text><Text style={[responsiveStyles4.focusDetail, { color: colors.textMuted }]}>Linking it lets Books calculate realized margin.</Text></View>
                  <Ionicons color={colors.textMuted} name="chevron.right" size={15} />
                </Pressable>
              ) : null}
              {overview?.attention.unlinkedInventoryCostCents ? (
                <Pressable accessibilityRole="button" onPress={() => navigate('/books')} style={({ pressed }) => [responsiveStyles4.focusRow, { borderColor: colors.divider }, pressed && responsiveStyles4.pressed]}>
                  <View style={[responsiveStyles4.focusIcon, { backgroundColor: colors.iconSurfaceViolet }]}><Ionicons color={colors.scannerViolet} name="dollarsign.circle.fill" size={17} /></View>
                  <View style={responsiveStyles4.focusCopy}><Text style={[responsiveStyles4.focusTitle, { color: colors.text }]}>{money(overview.attention.unlinkedInventoryCostCents)} of costs need an item link</Text><Text style={[responsiveStyles4.focusDetail, { color: colors.textMuted }]}>Tie working capital to inventory for a cleaner picture.</Text></View>
                  <Ionicons color={colors.textMuted} name="chevron.right" size={15} />
                </Pressable>
              ) : null}
              {!loading && attentionCount === 0 && !(overview?.attention.unlinkedInventoryCostCents) ? (
                <View style={[responsiveStyles4.clearState, { backgroundColor: colors.successSurface, borderColor: `${colors.success}55` }]}>
                  <Ionicons color={colors.success} name="checkmark.circle.fill" size={19} />
                  <View style={responsiveStyles4.focusCopy}><Text style={[responsiveStyles4.focusTitle, { color: colors.text }]}>Nothing urgent in the queue</Text><Text style={[responsiveStyles4.focusDetail, { color: colors.textMuted }]}>Keep sourcing, then record the next real transaction.</Text></View>
                </View>
              ) : null}
              {loading ? <View style={responsiveStyles4.loadingState}><ActivityIndicator color={colors.scannerCyan} /></View> : null}
            </View>
            <View style={[responsiveStyles4.queueFooter, { borderTopColor: colors.divider }]}>
              <Text style={[responsiveStyles4.queueFooterLabel, { color: colors.textMuted }]}>ON HAND</Text>
              <Text style={[responsiveStyles4.queueFooterValue, { color: colors.text }]}>{overview?.inventory.onHandCount ?? 0} items</Text>
              <Text style={[responsiveStyles4.queueFooterNote, { color: colors.textMuted }]}>Est. value {money(overview?.inventory.estimatedOnHandValueCents ?? 0)} · not money earned</Text>
            </View>
          </View>
        </View>

        <View style={[responsiveStyles4.panel, { backgroundColor: colors.card, borderColor: colors.divider }]}>
          <PanelHeader action="SEE ALL" colors={colors} eyebrow="RECENT INVENTORY" onAction={() => navigate('/inventory')} title="Your saved finds" />
          <Text style={[responsiveStyles4.panelDescription, { color: colors.textMuted }]}>The newest items, with the decision context you need before the next listing.</Text>
          {loading ? (
            <View style={responsiveStyles4.loadingState}><ActivityIndicator color={colors.scannerCyan} /><Text style={[responsiveStyles4.loadingText, { color: colors.textMuted }]}>Loading inventory…</Text></View>
          ) : inventory.length ? (
            <View style={responsiveStyles4.inventoryList}>
              {inventory.slice(0, 5).map((item) => {
                const itemStatusColor = statusColor(item, colors);
                return (
                  <Pressable key={item.id} accessibilityRole="button" onPress={() => navigate('/inventory')} style={({ pressed }) => [responsiveStyles4.inventoryRow, { borderTopColor: colors.divider }, pressed && responsiveStyles4.pressed]}>
                    <View style={[responsiveStyles4.itemThumbnail, { backgroundColor: colors.iconSurface, borderColor: colors.divider }]}>
                      <Ionicons color={itemStatusColor} name="shippingbox.fill" size={18} />
                    </View>
                    <View style={responsiveStyles4.itemCopy}>
                      <Text numberOfLines={1} style={[responsiveStyles4.itemTitle, { color: colors.text }]}>{item.title || 'Untitled find'}</Text>
                      <Text numberOfLines={1} style={[responsiveStyles4.itemMeta, { color: colors.textMuted }]}>{item.category || 'Uncategorized'} · {item.condition || 'Condition not set'}</Text>
                    </View>
                    <View style={responsiveStyles4.itemStatusColumn}><Text style={[responsiveStyles4.itemStatus, { color: itemStatusColor }]}>{statusLabel(item)}</Text><Text style={[responsiveStyles4.itemCost, { color: colors.textMuted }]}>{item.isListed ? 'LISTED' : 'NOT LISTED'}</Text></View>
                    <View style={responsiveStyles4.itemValueColumn}><Text selectable style={[responsiveStyles4.itemValue, { color: colors.text }]}>{dollars(item.estimatedValue)}</Text><Text style={[responsiveStyles4.itemCost, { color: colors.textMuted }]}>EST. RESALE</Text></View>
                    <Ionicons color={colors.textMuted} name="chevron.right" size={16} />
                  </Pressable>
                );
              })}
            </View>
          ) : (
            <View style={[responsiveStyles4.emptyState, { borderColor: colors.divider }]}>
              <Ionicons color={colors.scannerCyan} name="shippingbox.fill" size={21} />
              <Text style={[responsiveStyles4.emptyTitle, { color: colors.text }]}>No saved finds yet</Text>
              <Text style={[responsiveStyles4.emptyBody, { color: colors.textMuted }]}>Scan on Android or add your first item to start building the shelf.</Text>
              <Pressable accessibilityRole="button" onPress={() => navigate('/scanner')} style={[responsiveStyles4.inlineAction, { borderColor: colors.accentCyanBorder, backgroundColor: colors.iconSurfaceCyan }]}>
                <Text style={[responsiveStyles4.inlineActionText, { color: colors.scannerCyan }]}>OPEN ANDROID SCANNER</Text>
              </Pressable>
            </View>
          )}
        </View>

        <View style={responsiveStyles4.sectionHeaderRow}>
          <View><Text style={[responsiveStyles4.panelEyebrow, { color: colors.goldBright }]}>NEXT MOVES</Text><Text style={[responsiveStyles4.panelTitle, { color: colors.text }]}>Keep the workflow moving</Text></View>
          <Text style={[responsiveStyles4.sectionHint, { color: colors.textMuted }]}>Fast paths from the desk</Text>
        </View>
        <View style={[responsiveStyles4.actionGrid, !isMedium && responsiveStyles4.actionGridCompact]}>
          <ActionButton accent={colors.scannerCyan} colors={colors} detail="Browse saved items and decisions" flexible icon="shippingbox.fill" label="Work inventory" onPress={() => navigate('/inventory')} />
          <ActionButton accent={colors.goldBright} colors={colors} detail="See realized profit and costs" flexible icon="chart.bar.fill" label="Reconcile Books" onPress={() => navigate('/books')} />
          <ActionButton accent={colors.scannerViolet} colors={colors} detail="Research a possible next buy" flexible icon="magnifyingglass" label="Research the market" onPress={() => navigate('/market-research')} />
          <ActionButton accent={colors.goldBright} colors={colors} detail="Run the numbers before you buy" flexible icon="dollarsign.circle.fill" label="Plan a flip" onPress={() => navigate('/flip-plan')} />
        </View>
      </ScrollView>
      <BusinessPulseBreakdownModal
        metric={activeBreakdown}
        notice={errorMessage}
        onClose={() => setActiveBreakdown(null)}
        overview={overview}
        visible={activeBreakdown !== null}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, minHeight: '100%', overflow: 'hidden', position: 'relative' },
  scrollView: { position: 'relative', zIndex: 1 },
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
  actionMotion: { minWidth: 220, alignSelf: 'stretch' },
  actionMotionFlexible: { flex: 1 },
  actionButton: { minHeight: 62, width: '100%', flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 13, paddingVertical: 10, borderWidth: 1, borderRadius: 15, overflow: 'hidden' },
  actionAccentGlow: { position: 'absolute', width: 96, height: 96, top: -42, right: -24, borderRadius: 48, opacity: 0.12 },
  actionIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  actionCopy: { flex: 1, minWidth: 0, gap: 3 },
  actionLabel: { fontFamily: theme.fonts.semibold, fontSize: 12 },
  actionDetail: { fontFamily: theme.fonts.body, fontSize: 10, lineHeight: 14 },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  metricGridCompact: { flexDirection: 'column' },
  metricMotion: { flex: 1, minWidth: 180 },
  metricCard: { flex: 1, minWidth: 180, minHeight: 132, borderWidth: 1, borderRadius: 17, padding: 16, gap: 10, overflow: 'hidden' },
  metricAccentGlow: { position: 'absolute', width: 132, height: 108, top: -48, right: -38, borderRadius: 70, opacity: 0.09 },
  metricCardPressed: { opacity: 0.8, transform: [{ scale: 0.985 }] },
  metricTopline: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  metricIcon: { width: 29, height: 29, borderRadius: 9, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  metricLabel: { fontFamily: theme.fonts.bold, fontSize: 8, letterSpacing: 1.2 },
  metricValue: { fontFamily: theme.fonts.bold, fontSize: 26, fontVariant: ['tabular-nums'] },
  metricValueCompact: { fontSize: 23 },
  metricDetail: { fontFamily: theme.fonts.body, fontSize: 10, lineHeight: 14 },
  dashboardGrid: { gap: 16 },
  dashboardGridWide: { flexDirection: 'row', alignItems: 'stretch' },
  dashboardGridStacked: { flexDirection: 'column' },
  pulseSection: { minWidth: 0, width: '100%' },
  panel: { borderWidth: 1, borderRadius: 18, padding: 19, gap: 13, flex: 1, minWidth: 0 },
  panelHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 },
  panelHeadingCopy: { gap: 4, flex: 1, minWidth: 0 },
  panelEyebrow: { fontFamily: theme.fonts.bold, fontSize: 8, letterSpacing: 1.35 },
  panelTitle: { fontFamily: theme.fonts.semibold, fontSize: 19 },
  panelDescription: { fontFamily: theme.fonts.body, fontSize: 11, lineHeight: 16, maxWidth: 650 },
  panelAction: { minHeight: 29, flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 999, paddingHorizontal: 9 },
  panelActionText: { fontFamily: theme.fonts.bold, fontSize: 7, letterSpacing: 1 },
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

function createStylesWebResponsive(layout: ReturnType<typeof useResponsiveLayout>) {
  return StyleSheet.create({
    ...styles,
    content: {
      ...styles["content"],
      gap: layout.isWeb ? layout.webResponsiveWidth(22) : 22,
    },
    hero: {
      ...styles["hero"],
      gap: layout.isWeb ? layout.webResponsiveWidth(22) : 22,
    },
    heroWide: {
      ...styles["heroWide"],
      gap: layout.isWeb ? layout.webResponsiveWidth(30) : 30,
    },
    heroCopy: {
      ...styles["heroCopy"],
      gap: layout.isWeb ? layout.webResponsiveWidth(10) : 10,
    },
    heroEyebrowRow: {
      ...styles["heroEyebrowRow"],
      gap: layout.isWeb ? layout.webResponsiveWidth(10) : 10,
    },
    heroEyebrow: {
      ...styles["heroEyebrow"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(9) : 9,
    },
    livePill: {
      ...styles["livePill"],
      gap: layout.isWeb ? layout.webResponsiveWidth(6) : 6,
      borderRadius: layout.isWeb ? layout.webResponsiveWidth(999) : 999,
      paddingHorizontal: layout.isWeb ? layout.webResponsiveWidth(9) : 9,
      paddingVertical: layout.isWeb ? layout.webResponsiveHeight(5) : 5,
    },
    liveDot: {
      ...styles["liveDot"],
      width: layout.isWeb ? layout.webResponsiveWidth(6) : 6,
      height: layout.isWeb ? layout.webResponsiveHeight(6) : 6,
      borderRadius: layout.isWeb ? layout.webResponsiveWidth(3) : 3,
    },
    livePillText: {
      ...styles["livePillText"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(7) : 7,
    },
    heroTitle: {
      ...styles["heroTitle"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(34) : 34,
    },
    heroSubtitle: {
      ...styles["heroSubtitle"],
      maxWidth: layout.isWeb ? layout.webResponsiveWidth(580) : 580,
      fontSize: layout.isWeb ? layout.webResponsiveFont(14) : 14,
      lineHeight: layout.isWeb ? layout.webResponsiveFont(21) : 21,
    },
    heroActions: {
      ...styles["heroActions"],
      gap: layout.isWeb ? layout.webResponsiveWidth(10) : 10,
      minWidth: layout.isWeb ? layout.webResponsiveWidth(280) : 280,
      maxWidth: layout.isWeb ? layout.webResponsiveWidth(380) : 380,
    },
    actionMotion: {
      ...styles["actionMotion"],
      minWidth: layout.isWeb ? layout.webResponsiveWidth(220) : 220,
    },
    actionButton: {
      ...styles["actionButton"],
      minHeight: layout.isWeb ? layout.webResponsiveHeight(62) : 62,
      gap: layout.isWeb ? layout.webResponsiveWidth(11) : 11,
      paddingHorizontal: layout.isWeb ? layout.webResponsiveWidth(13) : 13,
      paddingVertical: layout.isWeb ? layout.webResponsiveHeight(10) : 10,
      borderRadius: layout.isWeb ? layout.webResponsiveWidth(15) : 15,
    },
    actionAccentGlow: {
      ...styles["actionAccentGlow"],
      width: layout.isWeb ? layout.webResponsiveWidth(96) : 96,
      height: layout.isWeb ? layout.webResponsiveHeight(96) : 96,
      borderRadius: layout.isWeb ? layout.webResponsiveWidth(48) : 48,
    },
    actionIcon: {
      ...styles["actionIcon"],
      width: layout.isWeb ? layout.webResponsiveWidth(34) : 34,
      height: layout.isWeb ? layout.webResponsiveHeight(34) : 34,
      borderRadius: layout.isWeb ? layout.webResponsiveWidth(10) : 10,
    },
    actionCopy: {
      ...styles["actionCopy"],
      gap: layout.isWeb ? layout.webResponsiveWidth(3) : 3,
    },
    actionLabel: {
      ...styles["actionLabel"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(12) : 12,
    },
    actionDetail: {
      ...styles["actionDetail"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(10) : 10,
      lineHeight: layout.isWeb ? layout.webResponsiveFont(14) : 14,
    },
    metricGrid: {
      ...styles["metricGrid"],
      gap: layout.isWeb ? layout.webResponsiveWidth(12) : 12,
    },
    metricMotion: {
      ...styles["metricMotion"],
      minWidth: layout.isWeb ? layout.webResponsiveWidth(180) : 180,
    },
    metricCard: {
      ...styles["metricCard"],
      minWidth: layout.isWeb ? layout.webResponsiveWidth(180) : 180,
      minHeight: layout.isWeb ? layout.webResponsiveHeight(132) : 132,
      borderRadius: layout.isWeb ? layout.webResponsiveWidth(17) : 17,
      gap: layout.isWeb ? layout.webResponsiveWidth(10) : 10,
    },
    metricAccentGlow: {
      ...styles["metricAccentGlow"],
      width: layout.isWeb ? layout.webResponsiveWidth(132) : 132,
      height: layout.isWeb ? layout.webResponsiveHeight(108) : 108,
      borderRadius: layout.isWeb ? layout.webResponsiveWidth(70) : 70,
    },
    metricTopline: {
      ...styles["metricTopline"],
      gap: layout.isWeb ? layout.webResponsiveWidth(9) : 9,
    },
    metricIcon: {
      ...styles["metricIcon"],
      width: layout.isWeb ? layout.webResponsiveWidth(29) : 29,
      height: layout.isWeb ? layout.webResponsiveHeight(29) : 29,
      borderRadius: layout.isWeb ? layout.webResponsiveWidth(9) : 9,
    },
    metricLabel: {
      ...styles["metricLabel"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(8) : 8,
    },
    metricValue: {
      ...styles["metricValue"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(26) : 26,
    },
    metricValueCompact: {
      ...styles["metricValueCompact"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(23) : 23,
    },
    metricDetail: {
      ...styles["metricDetail"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(10) : 10,
      lineHeight: layout.isWeb ? layout.webResponsiveFont(14) : 14,
    },
    dashboardGrid: {
      ...styles["dashboardGrid"],
      gap: layout.isWeb ? layout.webResponsiveWidth(16) : 16,
    },
    panel: {
      ...styles["panel"],
      borderRadius: layout.isWeb ? layout.webResponsiveWidth(18) : 18,
      gap: layout.isWeb ? layout.webResponsiveWidth(13) : 13,
    },
    panelHeader: {
      ...styles["panelHeader"],
      gap: layout.isWeb ? layout.webResponsiveWidth(16) : 16,
    },
    panelHeadingCopy: {
      ...styles["panelHeadingCopy"],
      gap: layout.isWeb ? layout.webResponsiveWidth(4) : 4,
    },
    panelEyebrow: {
      ...styles["panelEyebrow"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(8) : 8,
    },
    panelTitle: {
      ...styles["panelTitle"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(19) : 19,
    },
    panelDescription: {
      ...styles["panelDescription"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(11) : 11,
      lineHeight: layout.isWeb ? layout.webResponsiveFont(16) : 16,
      maxWidth: layout.isWeb ? layout.webResponsiveWidth(650) : 650,
    },
    panelAction: {
      ...styles["panelAction"],
      minHeight: layout.isWeb ? layout.webResponsiveHeight(29) : 29,
      gap: layout.isWeb ? layout.webResponsiveWidth(5) : 5,
      borderRadius: layout.isWeb ? layout.webResponsiveWidth(999) : 999,
      paddingHorizontal: layout.isWeb ? layout.webResponsiveWidth(9) : 9,
    },
    panelActionText: {
      ...styles["panelActionText"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(7) : 7,
    },
    loadingState: {
      ...styles["loadingState"],
      minHeight: layout.isWeb ? layout.webResponsiveHeight(118) : 118,
      gap: layout.isWeb ? layout.webResponsiveWidth(9) : 9,
    },
    loadingText: {
      ...styles["loadingText"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(11) : 11,
    },
    emptyState: {
      ...styles["emptyState"],
      minHeight: layout.isWeb ? layout.webResponsiveHeight(145) : 145,
      gap: layout.isWeb ? layout.webResponsiveWidth(8) : 8,
      borderRadius: layout.isWeb ? layout.webResponsiveWidth(14) : 14,
    },
    emptyTitle: {
      ...styles["emptyTitle"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(13) : 13,
    },
    emptyBody: {
      ...styles["emptyBody"],
      maxWidth: layout.isWeb ? layout.webResponsiveWidth(440) : 440,
      fontSize: layout.isWeb ? layout.webResponsiveFont(11) : 11,
      lineHeight: layout.isWeb ? layout.webResponsiveFont(16) : 16,
    },
    inlineAction: {
      ...styles["inlineAction"],
      minHeight: layout.isWeb ? layout.webResponsiveHeight(31) : 31,
      borderRadius: layout.isWeb ? layout.webResponsiveWidth(999) : 999,
      paddingHorizontal: layout.isWeb ? layout.webResponsiveWidth(11) : 11,
      marginTop: layout.isWeb ? layout.webResponsiveHeight(3) : 3,
    },
    inlineActionText: {
      ...styles["inlineActionText"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(7) : 7,
    },
    focusList: {
      ...styles["focusList"],
      gap: layout.isWeb ? layout.webResponsiveWidth(8) : 8,
    },
    focusRow: {
      ...styles["focusRow"],
      minHeight: layout.isWeb ? layout.webResponsiveHeight(68) : 68,
      gap: layout.isWeb ? layout.webResponsiveWidth(10) : 10,
      borderRadius: layout.isWeb ? layout.webResponsiveWidth(13) : 13,
      paddingHorizontal: layout.isWeb ? layout.webResponsiveWidth(10) : 10,
      paddingVertical: layout.isWeb ? layout.webResponsiveHeight(9) : 9,
    },
    focusIcon: {
      ...styles["focusIcon"],
      width: layout.isWeb ? layout.webResponsiveWidth(31) : 31,
      height: layout.isWeb ? layout.webResponsiveHeight(31) : 31,
      borderRadius: layout.isWeb ? layout.webResponsiveWidth(10) : 10,
    },
    focusCopy: {
      ...styles["focusCopy"],
      gap: layout.isWeb ? layout.webResponsiveWidth(3) : 3,
    },
    focusTitle: {
      ...styles["focusTitle"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(11) : 11,
    },
    focusDetail: {
      ...styles["focusDetail"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(10) : 10,
      lineHeight: layout.isWeb ? layout.webResponsiveFont(14) : 14,
    },
    clearState: {
      ...styles["clearState"],
      minHeight: layout.isWeb ? layout.webResponsiveHeight(68) : 68,
      gap: layout.isWeb ? layout.webResponsiveWidth(10) : 10,
      borderRadius: layout.isWeb ? layout.webResponsiveWidth(13) : 13,
    },
    queueFooter: {
      ...styles["queueFooter"],
      gap: layout.isWeb ? layout.webResponsiveWidth(8) : 8,
      paddingTop: layout.isWeb ? layout.webResponsiveHeight(13) : 13,
      marginTop: layout.isWeb ? layout.webResponsiveHeight(3) : 3,
    },
    queueFooterLabel: {
      ...styles["queueFooterLabel"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(8) : 8,
    },
    queueFooterValue: {
      ...styles["queueFooterValue"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(13) : 13,
    },
    queueFooterNote: {
      ...styles["queueFooterNote"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(10) : 10,
    },
    inventoryRow: {
      ...styles["inventoryRow"],
      minHeight: layout.isWeb ? layout.webResponsiveHeight(68) : 68,
      gap: layout.isWeb ? layout.webResponsiveWidth(11) : 11,
      paddingVertical: layout.isWeb ? layout.webResponsiveHeight(10) : 10,
    },
    itemThumbnail: {
      ...styles["itemThumbnail"],
      width: layout.isWeb ? layout.webResponsiveWidth(38) : 38,
      height: layout.isWeb ? layout.webResponsiveHeight(38) : 38,
      borderRadius: layout.isWeb ? layout.webResponsiveWidth(11) : 11,
    },
    itemCopy: {
      ...styles["itemCopy"],
      gap: layout.isWeb ? layout.webResponsiveWidth(4) : 4,
    },
    itemTitle: {
      ...styles["itemTitle"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(12) : 12,
    },
    itemMeta: {
      ...styles["itemMeta"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(10) : 10,
    },
    itemStatusColumn: {
      ...styles["itemStatusColumn"],
      minWidth: layout.isWeb ? layout.webResponsiveWidth(92) : 92,
      gap: layout.isWeb ? layout.webResponsiveWidth(4) : 4,
    },
    itemStatus: {
      ...styles["itemStatus"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(8) : 8,
    },
    itemCost: {
      ...styles["itemCost"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(7) : 7,
    },
    itemValueColumn: {
      ...styles["itemValueColumn"],
      minWidth: layout.isWeb ? layout.webResponsiveWidth(82) : 82,
      gap: layout.isWeb ? layout.webResponsiveWidth(4) : 4,
    },
    itemValue: {
      ...styles["itemValue"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(14) : 14,
    },
    sectionHeaderRow: {
      ...styles["sectionHeaderRow"],
      gap: layout.isWeb ? layout.webResponsiveWidth(18) : 18,
    },
    sectionHint: {
      ...styles["sectionHint"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(11) : 11,
    },
    actionGrid: {
      ...styles["actionGrid"],
      gap: layout.isWeb ? layout.webResponsiveWidth(10) : 10,
    },
    errorBanner: {
      ...styles["errorBanner"],
      minHeight: layout.isWeb ? layout.webResponsiveHeight(64) : 64,
      gap: layout.isWeb ? layout.webResponsiveWidth(10) : 10,
      borderRadius: layout.isWeb ? layout.webResponsiveWidth(14) : 14,
      paddingHorizontal: layout.isWeb ? layout.webResponsiveWidth(13) : 13,
      paddingVertical: layout.isWeb ? layout.webResponsiveHeight(10) : 10,
    },
    errorCopy: {
      ...styles["errorCopy"],
      gap: layout.isWeb ? layout.webResponsiveWidth(3) : 3,
    },
    errorTitle: {
      ...styles["errorTitle"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(12) : 12,
    },
    errorBody: {
      ...styles["errorBody"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(10) : 10,
      lineHeight: layout.isWeb ? layout.webResponsiveFont(14) : 14,
    },
    retryButton: {
      ...styles["retryButton"],
      minHeight: layout.isWeb ? layout.webResponsiveHeight(29) : 29,
      borderRadius: layout.isWeb ? layout.webResponsiveWidth(999) : 999,
      paddingHorizontal: layout.isWeb ? layout.webResponsiveWidth(10) : 10,
    },
    retryText: {
      ...styles["retryText"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(7) : 7,
    },
  });
}
