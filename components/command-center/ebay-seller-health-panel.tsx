import * as Linking from 'expo-linking';
import { useRouter, type Href } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { KeepFlipText as Text } from '@/components/ui/keepflip-text';
import { keepFlipTheme as theme } from '@/constants/keepflip-theme';
import {
  useResponsiveLayout,
  useResponsiveStyles,
} from '@/hooks/use-responsive-layout';
import {
  getEbayOAuthEnvironment,
  getEbaySellerPerformance,
  type EbaySellerMetric,
  type EbaySellerPerformanceResult,
  type EbaySellerStandardsProfile,
} from '@/services/ebayConnectionService';

type MetricSpec = {
  label: string;
  terms: string[];
};

const METRIC_SPECS: MetricSpec[] = [
  {
    label: 'Transaction defect rate',
    terms: ['transaction defect', 'defect rate'],
  },
  {
    label: 'Late shipment rate',
    terms: ['late shipment', 'late dispatch', 'late delivery'],
  },
  {
    label: 'Cases closed without seller resolution',
    terms: ['cases closed', 'seller resolution'],
  },
  {
    label: 'Transactions · 12 months',
    terms: ['transactions', 'transaction count', 'txn count'],
  },
  {
    label: 'Total sales · 12 months',
    terms: ['total sales', 'sales volume'],
  },
  {
    label: 'Days active on eBay',
    terms: ['days active', 'active on ebay'],
  },
];

function metricSearchText(metric: EbaySellerMetric) {
  return `${metric.metricKey || ''} ${metric.name || ''}`.toLowerCase();
}

function findMetric(
  profile: EbaySellerStandardsProfile | undefined,
  terms: string[],
) {
  if (!profile) return undefined;
  return profile.metrics.find((metric) => {
    const searchText = metricSearchText(metric);
    return terms.some((term) => searchText.includes(term));
  });
}

function levelLabel(value: string | undefined) {
  if (!value) return 'Not available';
  return value
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function metricValue(metric: EbaySellerMetric | undefined) {
  if (!metric) return '—';
  if (metric.ratePercent != null && Number.isFinite(metric.ratePercent)) {
    return `${metric.ratePercent.toFixed(2)}%`;
  }
  if (metric.numerator != null && metric.denominator != null) {
    return `${metric.numerator} of ${metric.denominator}`;
  }
  if (metric.amountCents != null && Number.isFinite(metric.amountCents)) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: metric.currency || 'USD',
    }).format(metric.amountCents / 100);
  }
  return metric.valueDisplay || '—';
}

function metricPeriod(metric: EbaySellerMetric | undefined) {
  if (!metric?.lookbackStartDate || !metric.lookbackEndDate) return '';
  const start = new Date(metric.lookbackStartDate);
  const end = new Date(metric.lookbackEndDate);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return '';
  return `${start.toLocaleDateString()} – ${end.toLocaleDateString()}`;
}

function errorMessage(cause: unknown) {
  return cause instanceof Error && cause.message.trim()
    ? cause.message
    : 'KeepFlip could not read eBay seller performance.';
}

export function EbaySellerHealthPanel({ enabled }: { enabled: boolean }) {
  const styles = useResponsiveStyles(createResponsiveStyles);
  const { responsiveFont } = useResponsiveLayout();
  const router = useRouter();
  const [result, setResult] = useState<EbaySellerPerformanceResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError('');
    try {
      setResult(await getEbaySellerPerformance(getEbayOAuthEnvironment()));
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return undefined;
    const refreshTimer = setTimeout(() => {
      void load();
    }, 0);
    return () => clearTimeout(refreshTimer);
  }, [enabled, load]);

  const metricRows = METRIC_SPECS.map((spec) => ({
    ...spec,
    current: findMetric(result?.current, spec.terms),
    projected: findMetric(result?.projected, spec.terms),
  }));

  const dashboardUrl =
    result?.environment === 'sandbox'
      ? 'https://sellerstandards.sandbox.ebay.com/dashboard'
      : 'https://sellerstandards.ebay.com/dashboard';

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.headerCopy}>
          <Text accessibilityRole="header" style={[styles.heading, { fontSize: responsiveFont(15) }]}>
            eBay Seller Health
          </Text>
          <Text style={[styles.muted, { fontSize: responsiveFont(10) }]}>
            Official Seller Standards data, kept separate from KeepFlip&apos;s local profit estimates.
          </Text>
        </View>
        <View style={styles.liveBadge}>
          <Text style={[styles.liveBadgeText, { fontSize: responsiveFont(8) }]}>eBAY API</Text>
        </View>
      </View>

      {!enabled ? (
        <Text style={[styles.muted, { fontSize: responsiveFont(10) }]}>
          Seller Health is included with the Serious seller analytics capability.
        </Text>
      ) : null}

      {enabled && loading && !result ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={theme.colors.scannerCyan} />
          <Text style={[styles.muted, { fontSize: responsiveFont(10) }]}>Reading your eBay seller profile…</Text>
        </View>
      ) : null}

      {enabled && error ? (
        <Text accessibilityRole="alert" style={[styles.error, { fontSize: responsiveFont(11) }]}>
          {error}
        </Text>
      ) : null}

      {enabled && result && !result.connected ? (
        <View style={styles.emptyState}>
          <Text style={[styles.text, { fontSize: responsiveFont(12) }]}>Connect eBay to load seller standards.</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Manage eBay connection"
            onPress={() => router.push('/ebay-account' as Href)}
            style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
          >
            <Text style={[styles.buttonText, { fontSize: responsiveFont(10) }]}>MANAGE EBAY CONNECTION</Text>
          </Pressable>
        </View>
      ) : null}

      {enabled && result?.connected ? (
        <>
          <View style={styles.levelGrid}>
            <View style={styles.levelCard}>
              <Text style={[styles.label, { fontSize: responsiveFont(8) }]}>CURRENT SELLER LEVEL</Text>
              <Text style={[styles.levelValue, { fontSize: responsiveFont(20) }]}>
                {levelLabel(result.current?.standardsLevel)}
              </Text>
              <Text style={[styles.muted, { fontSize: responsiveFont(9) }]}>
                eBay {result.marketplaceId.replace(/^EBAY_/, '')}
              </Text>
            </View>
            <View style={[styles.levelCard, styles.projectedCard]}>
              <Text style={[styles.label, { fontSize: responsiveFont(8) }]}>IF EVALUATED TODAY</Text>
              <Text style={[styles.levelValue, { color: theme.colors.scannerCyan, fontSize: responsiveFont(20) }]}>
                {levelLabel(result.projected?.standardsLevel)}
              </Text>
              <Text style={[styles.muted, { fontSize: responsiveFont(9) }]}>Projected next cycle</Text>
            </View>
          </View>

          <View style={styles.metricGrid}>
            {metricRows.map((row) => (
              <View key={row.label} style={styles.metricCard}>
                <Text style={[styles.label, { fontSize: responsiveFont(8) }]}>{row.label.toUpperCase()}</Text>
                <Text style={[styles.metricValue, { fontSize: responsiveFont(17) }]}>
                  {metricValue(row.current || row.projected)}
                </Text>
                {row.current && row.projected && metricValue(row.current) !== metricValue(row.projected) ? (
                  <Text style={[styles.projectedText, { fontSize: responsiveFont(9) }]}>
                    Projected {metricValue(row.projected)}
                  </Text>
                ) : null}
                <Text style={[styles.muted, { fontSize: responsiveFont(9) }]}>
                  {metricPeriod(row.current || row.projected) || 'eBay standards profile'}
                </Text>
              </View>
            ))}
          </View>

          <View style={styles.returnCard}>
            <Text style={[styles.label, { fontSize: responsiveFont(8) }]}>RETURN ACTIVITY</Text>
            {result.returns?.available ? (
              <>
                <Text style={[styles.metricValue, { fontSize: responsiveFont(17) }]}>
                  {result.returns.ratePercent == null ? '—' : `${result.returns.ratePercent.toFixed(2)}%`}
                </Text>
                <Text style={[styles.text, { fontSize: responsiveFont(11) }]}>
                  {result.returns.count ?? 0} of {result.returns.denominator ?? '—'} transactions
                </Text>
                {result.returns.byReason?.length ? (
                  <Text style={[styles.muted, { fontSize: responsiveFont(9) }]}>
                    API return reasons: {result.returns.byReason.map((entry) => `${entry.label} (${entry.count})`).join(' · ')}
                  </Text>
                ) : null}
              </>
            ) : (
              <Text style={[styles.muted, { fontSize: responsiveFont(10) }]}>
                {result.returns?.reason === 'sandbox'
                  ? 'Return search is not available in eBay Sandbox.'
                  : 'Return activity is not available from eBay right now.'}
              </Text>
            )}
            <Text style={[styles.muted, { fontSize: responsiveFont(9) }]}>
              eBay does not expose the dashboard&apos;s category return breakdown through this public response. Open eBay for the exact category view.
            </Text>
            <Pressable
              accessibilityRole="link"
              accessibilityLabel="Open eBay Seller Standards dashboard"
              onPress={() => void Linking.openURL(dashboardUrl)}
              style={({ pressed }) => [styles.dashboardLink, pressed && styles.buttonPressed]}
            >
              <Text style={[styles.dashboardLinkText, { fontSize: responsiveFont(10) }]}>OPEN EBAY SELLER DASHBOARD</Text>
            </Pressable>
          </View>

          <Text style={[styles.muted, { fontSize: responsiveFont(9) }]}>
            Last synced {result.lastSyncedAt ? new Date(result.lastSyncedAt).toLocaleString() : 'just now'} · refreshes on demand
          </Text>
        </>
      ) : null}

      {enabled ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Refresh eBay seller health"
          accessibilityState={{ disabled: loading }}
          disabled={loading}
          onPress={() => void load()}
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed, loading && styles.disabled]}
        >
          <Text style={[styles.buttonText, { fontSize: responsiveFont(10) }]}>
            {loading ? 'REFRESHING EBAY METRICS…' : 'REFRESH EBAY METRICS'}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function createResponsiveStyles(responsiveLayout: ReturnType<typeof useResponsiveLayout>) {
  const staticStyles = StyleSheet.create({
    card: {
      gap: 10,
      padding: 14,
      borderRadius: theme.radii.medium,
      borderWidth: 1,
      borderColor: 'rgba(88, 223, 232, 0.24)',
      backgroundColor: 'rgba(5, 14, 20, 0.82)',
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
    },
    headerCopy: {
      flex: 1,
      gap: 5,
    },
    heading: {
      color: theme.colors.text,
      fontWeight: '800',
      letterSpacing: -0.1,
    },
    liveBadge: {
      paddingHorizontal: 7,
      paddingVertical: 5,
      borderRadius: 5,
      backgroundColor: 'rgba(88, 223, 232, 0.12)',
      borderWidth: 1,
      borderColor: 'rgba(88, 223, 232, 0.34)',
    },
    liveBadgeText: {
      color: theme.colors.scannerCyan,
      fontWeight: '900',
      letterSpacing: 1,
    },
    muted: {
      color: theme.colors.textMuted,
      lineHeight: 15,
    },
    text: {
      color: theme.colors.text,
      lineHeight: 18,
    },
    error: {
      color: theme.colors.danger,
      lineHeight: 16,
    },
    loadingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 9,
      paddingVertical: 4,
    },
    emptyState: {
      gap: 9,
    },
    levelGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    levelCard: {
      flexGrow: 1,
      flexBasis: '46%',
      minWidth: 145,
      gap: 5,
      padding: 11,
      borderRadius: theme.radii.small,
      backgroundColor: 'rgba(242, 211, 138, 0.08)',
    },
    projectedCard: {
      backgroundColor: 'rgba(88, 223, 232, 0.08)',
    },
    label: {
      color: theme.colors.goldBright,
      fontWeight: '900',
      letterSpacing: 1,
    },
    levelValue: {
      color: theme.colors.goldBright,
      fontWeight: '800',
    },
    metricGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    metricCard: {
      flexGrow: 1,
      flexBasis: '46%',
      minWidth: 145,
      gap: 4,
      padding: 10,
      borderRadius: theme.radii.small,
      borderWidth: 1,
      borderColor: 'rgba(242, 211, 138, 0.12)',
      backgroundColor: 'rgba(3, 3, 6, 0.38)',
    },
    metricValue: {
      color: theme.colors.text,
      fontWeight: '800',
    },
    projectedText: {
      color: theme.colors.scannerCyan,
      fontWeight: '700',
    },
    returnCard: {
      gap: 6,
      padding: 11,
      borderRadius: theme.radii.small,
      backgroundColor: 'rgba(242, 211, 138, 0.06)',
    },
    button: {
      minHeight: 40,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 9,
      borderRadius: theme.radii.small,
      borderWidth: 1,
      borderColor: 'rgba(88, 223, 232, 0.30)',
      backgroundColor: 'rgba(88, 223, 232, 0.07)',
    },
    buttonPressed: {
      backgroundColor: 'rgba(88, 223, 232, 0.14)',
      borderColor: 'rgba(88, 223, 232, 0.54)',
    },
    buttonText: {
      color: theme.colors.text,
      fontWeight: '800',
      letterSpacing: 0.4,
    },
    dashboardLink: {
      alignSelf: 'flex-start',
      paddingVertical: 4,
      paddingHorizontal: 2,
    },
    dashboardLinkText: {
      color: theme.colors.scannerCyan,
      fontWeight: '800',
      letterSpacing: 0.3,
    },
    disabled: {
      opacity: 0.44,
    },
  });

  return {
    ...staticStyles,
    heading: [staticStyles.heading, { fontSize: responsiveLayout.responsiveFont(15) }],
    liveBadgeText: [
      staticStyles.liveBadgeText,
      { fontSize: responsiveLayout.responsiveFont(8) },
    ],
    muted: [staticStyles.muted, { fontSize: responsiveLayout.responsiveFont(10) }],
    text: [staticStyles.text, { fontSize: responsiveLayout.responsiveFont(12) }],
    error: [staticStyles.error, { fontSize: responsiveLayout.responsiveFont(11) }],
    label: [staticStyles.label, { fontSize: responsiveLayout.responsiveFont(8) }],
    levelValue: [staticStyles.levelValue, { fontSize: responsiveLayout.responsiveFont(20) }],
    metricValue: [staticStyles.metricValue, { fontSize: responsiveLayout.responsiveFont(17) }],
    projectedText: [
      staticStyles.projectedText,
      { fontSize: responsiveLayout.responsiveFont(9) },
    ],
    buttonText: [
      staticStyles.buttonText,
      { fontSize: responsiveLayout.responsiveFont(10) },
    ],
    dashboardLinkText: [
      staticStyles.dashboardLinkText,
      { fontSize: responsiveLayout.responsiveFont(10) },
    ],
  };
}
