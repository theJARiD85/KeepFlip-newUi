import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { KeepFlipBackground } from '@/components/ui/keepflip-background';
import {
  KeepFlipText as Text,
  KeepFlipTextInput as TextInput,
} from '@/components/ui/keepflip-text';
import { keepFlipTheme as theme } from '@/constants/keepflip-theme';
import { useResponsiveLayout } from '@/hooks/use-responsive-layout';
import {
  calculateProfitEstimate,
  MARKETPLACE_FEE_PRESETS,
  researchEbayMarket,
  type MarketplaceFeePreset,
  type MarketResearchResult,
} from '@/services/market-research-service';

const DEFAULT_PLATFORM = MARKETPLACE_FEE_PRESETS[0];

type NumberField =
  | 'salePrice'
  | 'shippingCharged'
  | 'cogs'
  | 'shippingCost'
  | 'supplies'
  | 'otherExpenses'
  | 'feePercent'
  | 'promotedPercent';

type NumberFields = Record<NumberField, string>;

const initialFields: NumberFields = {
  salePrice: '',
  shippingCharged: '0',
  cogs: '',
  shippingCost: '0',
  supplies: '0',
  otherExpenses: '0',
  feePercent: String(DEFAULT_PLATFORM.percent),
  promotedPercent: '0',
};

function parseAmount(value: string) {
  const parsed = Number(value.replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function money(value: number, currency = 'USD') {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `$${value.toFixed(2)}`;
  }
}

function percent(value: number) {
  if (!Number.isFinite(value)) return '0%';
  return `${value.toFixed(1)}%`;
}

function haptic() {
  void Haptics.selectionAsync().catch(() => undefined);
}

function MetricCard({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <View style={styles.metricCard}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
      {detail ? <Text style={styles.metricDetail}>{detail}</Text> : null}
    </View>
  );
}

function NumberInput({
  label,
  value,
  onChangeText,
  suffix,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  suffix?: string;
}) {
  return (
    <View style={styles.inputGroup}>
      <Text style={styles.inputLabel}>{label}</Text>
      <View style={styles.numberInputShell}>
        <TextInput
          accessibilityLabel={label}
          keyboardType="decimal-pad"
          onChangeText={onChangeText}
          placeholder="0.00"
          placeholderTextColor={theme.colors.textMuted}
          selectTextOnFocus
          style={styles.numberInput}
          value={value}
        />
        {suffix ? <Text style={styles.inputSuffix}>{suffix}</Text> : null}
      </View>
    </View>
  );
}

function PriceTrend({ result }: { result: MarketResearchResult }) {
  const values = result.trend.map((point) => point.average ?? 0);
  const maximum = Math.max(...values, 1);

  return (
    <View style={styles.chartCard}>
      <View style={styles.sectionHeadingRow}>
        <View>
          <Text style={styles.sectionEyebrow}>90-DAY SIGNAL</Text>
          <Text style={styles.sectionTitle}>Price trend</Text>
        </View>
        <Text style={styles.chartCaption}>15-day sold-sample averages</Text>
      </View>
      <View style={styles.chart}>
        {result.trend.map((point) => {
          const barHeight = point.average == null ? 4 : Math.max(12, (point.average / maximum) * 104);
          return (
            <View key={point.label} style={styles.chartColumn}>
              <Text style={styles.chartValue}>
                {point.average == null ? '—' : money(point.average, result.summary.currency).replace('.00', '')}
              </Text>
              <View style={styles.chartTrack}>
                <View style={[styles.chartBar, { height: barHeight }]} />
              </View>
              <Text style={styles.chartLabel}>{point.label}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

export function MarketResearchScreen() {
  const insets = useSafeAreaInsets();
  const { pageGutter, contentMaxWidth } = useResponsiveLayout();
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<MarketResearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [platform, setPlatform] = useState<MarketplaceFeePreset>(DEFAULT_PLATFORM);
  const [fields, setFields] = useState<NumberFields>(initialFields);

  const estimate = useMemo(
    () =>
      calculateProfitEstimate({
        salePrice: parseAmount(fields.salePrice),
        shippingCharged: parseAmount(fields.shippingCharged),
        cogs: parseAmount(fields.cogs),
        shippingCost: parseAmount(fields.shippingCost),
        supplies: parseAmount(fields.supplies),
        otherExpenses: parseAmount(fields.otherExpenses),
        feePercent: parseAmount(fields.feePercent),
        promotedPercent: parseAmount(fields.promotedPercent),
        fixedFee: platform.fixed,
      }),
    [fields, platform.fixed],
  );

  const setField = (field: NumberField, value: string) => {
    setFields((current) => ({ ...current, [field]: value }));
  };

  const choosePlatform = (nextPlatform: MarketplaceFeePreset) => {
    haptic();
    setPlatform(nextPlatform);
    setField('feePercent', String(nextPlatform.percent));
  };

  const handleSearch = async () => {
    const cleanQuery = query.trim();
    if (cleanQuery.length < 3 || isSearching) {
      if (cleanQuery.length < 3) setError('Enter at least three characters to research an item.');
      return;
    }

    haptic();
    setIsSearching(true);
    setError(null);

    try {
      const nextResult = await researchEbayMarket(cleanQuery);
      setResult(nextResult);
      setField('salePrice', nextResult.summary.median.toFixed(2));
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    } catch (searchError) {
      setResult(null);
      setError(
        searchError instanceof Error && searchError.message
          ? searchError.message
          : 'Market research is unavailable right now. Please try again.',
      );
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <KeepFlipBackground>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}>
        <ScrollView
          contentContainerStyle={[
            styles.content,
            {
              maxWidth: contentMaxWidth,
              paddingHorizontal: pageGutter,
              paddingTop: insets.top + 34,
              paddingBottom: insets.bottom + 44,
            },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <Animated.View entering={FadeInDown.duration(260)} style={styles.header}>
            <Text style={styles.eyebrow}>KEEPFLIP / MARKET RESEARCH</Text>
            <Text style={styles.title}>Know the market.{`\n`}Price the flip.</Text>
            <Text style={styles.subtitle}>
              Research sold comps, spot pricing momentum, and model profit without leaving KeepFlip.
            </Text>
          </Animated.View>

          <Animated.View entering={FadeInDown.duration(260).delay(40)} style={styles.searchCard}>
            <Text style={styles.inputLabel}>ITEM, MODEL, OR KEYWORDS</Text>
            <View style={styles.searchRow}>
              <TextInput
                accessibilityLabel="Market research query"
                autoCapitalize="words"
                onChangeText={setQuery}
                onSubmitEditing={() => void handleSearch()}
                placeholder="e.g. Patagonia Retro-X fleece medium"
                placeholderTextColor={theme.colors.textMuted}
                returnKeyType="search"
                style={styles.searchInput}
                value={query}
              />
              <Pressable
                accessibilityLabel="Research sold listings"
                accessibilityRole="button"
                disabled={isSearching}
                onPress={() => void handleSearch()}
                style={({ pressed }) => [
                  styles.searchButton,
                  pressed && styles.pressed,
                  isSearching && styles.disabled,
                ]}>
                {isSearching ? (
                  <ActivityIndicator color={theme.colors.backgroundDeep} size="small" />
                ) : (
                  <IconSymbol color={theme.colors.backgroundDeep} name="magnifyingglass" size={22} />
                )}
              </Pressable>
            </View>
            <Text style={styles.sourceNote}>
              Sold-comp research is shown separately from the official eBay active-listing snapshot.
            </Text>
            {error ? <Text accessibilityRole="alert" style={styles.errorText}>{error}</Text> : null}
          </Animated.View>

          {result ? (
            <Animated.View entering={FadeInDown.duration(280)} style={styles.resultsSection}>
              <View style={styles.resultHeader}>
                <View style={styles.resultHeaderCopy}>
                  <Text style={styles.sectionEyebrow}>MARKET SNAPSHOT</Text>
                  <Text numberOfLines={2} style={styles.sectionTitle}>{result.query}</Text>
                </View>
                <View style={styles.liveBadge}><View style={styles.liveDot} /><Text style={styles.liveText}>LIVE</Text></View>
              </View>

              <View style={styles.metricsGrid}>
                <MetricCard label="Sold sample median" value={money(result.summary.median, result.summary.currency)} detail={`${result.summary.count} sold observations`} />
                <MetricCard label="Sold sample mean" value={money(result.summary.average, result.summary.currency)} detail="Observed sale + shipping" />
                <MetricCard label="Observed low / high" value={`${money(result.summary.low, result.summary.currency)} – ${money(result.summary.high, result.summary.currency)}`} />
                <MetricCard
                  label="eBay active listings"
                  value={result.summary.activeCount == null ? 'Unavailable' : String(Math.round(result.summary.activeCount))}
                  detail={`${result.soldLast30Days} dated sold observations / 30d`}
                />
              </View>

              <PriceTrend result={result} />

              <View style={styles.sectionHeadingRow}>
                <View>
                  <Text style={styles.sectionEyebrow}>RECENT SALES</Text>
                  <Text style={styles.sectionTitle}>Comparable listings</Text>
                </View>
                <Text style={styles.chartCaption}>{result.datedCompCount} dated</Text>
              </View>

              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.compsScroller}>
                {result.comps.slice(0, 12).map((comp, index) => (
                  <Pressable
                    key={`${comp.listingUrl ?? comp.title}-${index}`}
                    disabled={!comp.listingUrl}
                    onPress={() => {
                      if (comp.listingUrl) void Linking.openURL(comp.listingUrl);
                    }}
                    style={({ pressed }) => [styles.compCard, pressed && styles.pressed]}>
                    {comp.imageUrl ? (
                      <Image contentFit="cover" source={{ uri: comp.imageUrl }} style={styles.compImage} />
                    ) : (
                      <View style={[styles.compImage, styles.compImagePlaceholder]}>
                        <IconSymbol color={theme.colors.goldMuted} name="tag.fill" size={28} />
                      </View>
                    )}
                    <View style={styles.compContent}>
                      <Text numberOfLines={2} style={styles.compTitle}>{comp.title}</Text>
                      <Text style={styles.compPrice}>{money(comp.totalPrice, comp.currency)}</Text>
                      <Text numberOfLines={1} style={styles.compMeta}>
                        {[comp.condition, comp.soldDate ? new Date(comp.soldDate).toLocaleDateString() : null]
                          .filter(Boolean)
                          .join(' · ') || 'Sold listing'}
                      </Text>
                    </View>
                  </Pressable>
                ))}
              </ScrollView>
            </Animated.View>
          ) : null}

          <Animated.View entering={FadeInDown.duration(280).delay(80)} style={styles.calculatorSection}>
            <Text style={styles.sectionEyebrow}>SMART MARGIN ESTIMATOR</Text>
            <Text style={styles.sectionTitle}>What will you actually make?</Text>
            <Text style={styles.sectionDescription}>
              Compare marketplace fees and adjust every cost. The sold-sample median fills automatically after research.
            </Text>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.platformScroller}>
              {MARKETPLACE_FEE_PRESETS.map((preset) => {
                const selected = preset.id === platform.id;
                return (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    key={preset.id}
                    onPress={() => choosePlatform(preset)}
                    style={({ pressed }) => [
                      styles.platformPill,
                      selected && styles.platformPillSelected,
                      pressed && styles.pressed,
                    ]}>
                    <Text style={[styles.platformText, selected && styles.platformTextSelected]}>{preset.label}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <View style={styles.calculatorCard}>
              <View style={styles.inputGrid}>
                <NumberInput label="Target sale price" value={fields.salePrice} onChangeText={(value) => setField('salePrice', value)} />
                <NumberInput label="Buyer-paid shipping" value={fields.shippingCharged} onChangeText={(value) => setField('shippingCharged', value)} />
                <NumberInput label="Cost of goods" value={fields.cogs} onChangeText={(value) => setField('cogs', value)} />
                <NumberInput label="Your shipping cost" value={fields.shippingCost} onChangeText={(value) => setField('shippingCost', value)} />
                <NumberInput label="Supplies" value={fields.supplies} onChangeText={(value) => setField('supplies', value)} />
                <NumberInput label="Other expenses" value={fields.otherExpenses} onChangeText={(value) => setField('otherExpenses', value)} />
                <NumberInput label="Marketplace fee" suffix="%" value={fields.feePercent} onChangeText={(value) => setField('feePercent', value)} />
                <NumberInput label="Promoted listing" suffix="%" value={fields.promotedPercent} onChangeText={(value) => setField('promotedPercent', value)} />
              </View>
              <Text style={styles.feeNote}>{platform.note} Fixed fee estimate: {money(platform.fixed)}.</Text>

              <View style={styles.profitHero}>
                <Text style={styles.profitLabel}>PROJECTED NET PROFIT</Text>
                <Text style={[styles.profitValue, estimate.netProfit < 0 && styles.negative]}>{money(estimate.netProfit)}</Text>
                <Text style={styles.profitSubline}>{percent(estimate.marginPercent)} margin · {percent(estimate.roiPercent)} ROI</Text>
              </View>

              <View style={styles.breakdown}>
                <View style={styles.breakdownRow}><Text style={styles.breakdownLabel}>Gross revenue</Text><Text style={styles.breakdownValue}>{money(estimate.revenue)}</Text></View>
                <View style={styles.breakdownRow}><Text style={styles.breakdownLabel}>Marketplace fees</Text><Text style={styles.breakdownValue}>− {money(estimate.marketplaceFees)}</Text></View>
                <View style={styles.breakdownRow}><Text style={styles.breakdownLabel}>Total costs + fees</Text><Text style={styles.breakdownValue}>− {money(estimate.totalCosts)}</Text></View>
                <View style={[styles.breakdownRow, styles.breakEvenRow]}><Text style={styles.breakEvenLabel}>Break-even sale price</Text><Text style={styles.breakEvenValue}>{money(estimate.breakEvenPrice)}</Text></View>
              </View>
            </View>
            <Text style={styles.disclaimer}>Estimates only. Marketplace fees vary by category, seller status, region, taxes, and policy changes.</Text>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </KeepFlipBackground>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { alignSelf: 'center', width: '100%', gap: 24 },
  header: { gap: 8 },
  eyebrow: { color: theme.colors.gold, fontSize: 11, fontWeight: '700', letterSpacing: 2.1 },
  title: { color: theme.colors.text, fontSize: 38, fontWeight: '700', letterSpacing: -1.4, lineHeight: 42 },
  subtitle: { color: theme.colors.textMuted, fontSize: 15, lineHeight: 22, maxWidth: 520 },
  searchCard: { backgroundColor: theme.colors.backgroundRaised, borderColor: 'rgba(215,168,74,0.28)', borderRadius: theme.radii.medium, borderWidth: 1, padding: 16, gap: 10 },
  inputLabel: { color: theme.colors.textMuted, fontSize: 10, fontWeight: '700', letterSpacing: 1.25 },
  searchRow: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  searchInput: { backgroundColor: theme.colors.surface, borderColor: theme.colors.surfaceSoft, borderRadius: 14, borderWidth: 1, color: theme.colors.text, flex: 1, fontSize: 15, minHeight: 50, paddingHorizontal: 14 },
  searchButton: { alignItems: 'center', backgroundColor: theme.colors.goldBright, borderRadius: 14, height: 50, justifyContent: 'center', width: 50 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
  disabled: { opacity: 0.55 },
  sourceNote: { color: theme.colors.textMuted, fontSize: 11 },
  errorText: { color: theme.colors.danger, fontSize: 12, lineHeight: 18 },
  resultsSection: { gap: 16 },
  resultHeader: { alignItems: 'flex-start', flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  resultHeaderCopy: { flex: 1, gap: 4 },
  sectionEyebrow: { color: theme.colors.gold, fontSize: 10, fontWeight: '700', letterSpacing: 1.7 },
  sectionTitle: { color: theme.colors.text, fontSize: 22, fontWeight: '700', letterSpacing: -0.5 },
  sectionDescription: { color: theme.colors.textMuted, fontSize: 13, lineHeight: 20 },
  liveBadge: { alignItems: 'center', backgroundColor: 'rgba(88,223,232,0.1)', borderColor: 'rgba(88,223,232,0.22)', borderRadius: 99, borderWidth: 1, flexDirection: 'row', gap: 6, paddingHorizontal: 10, paddingVertical: 6 },
  liveDot: { backgroundColor: '#58DFE8', borderRadius: 4, height: 6, width: 6 },
  liveText: { color: '#58DFE8', fontSize: 9, fontWeight: '700', letterSpacing: 1 },
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  metricCard: { backgroundColor: theme.colors.backgroundRaised, borderColor: theme.colors.surfaceSoft, borderRadius: 16, borderWidth: 1, flexBasis: '47%', flexGrow: 1, minHeight: 104, padding: 14 },
  metricLabel: { color: theme.colors.textMuted, fontSize: 10, fontWeight: '700', letterSpacing: 1.1, textTransform: 'uppercase' },
  metricValue: { color: theme.colors.text, fontSize: 20, fontWeight: '700', marginTop: 9 },
  metricDetail: { color: theme.colors.gold, fontSize: 10, marginTop: 5 },
  chartCard: { backgroundColor: theme.colors.backgroundRaised, borderColor: theme.colors.surfaceSoft, borderRadius: theme.radii.medium, borderWidth: 1, gap: 16, padding: 16 },
  sectionHeadingRow: { alignItems: 'flex-end', flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  chartCaption: { color: theme.colors.textMuted, fontSize: 10 },
  chart: { alignItems: 'flex-end', flexDirection: 'row', height: 155, justifyContent: 'space-between', gap: 5 },
  chartColumn: { alignItems: 'center', flex: 1, gap: 5 },
  chartValue: { color: theme.colors.textMuted, fontSize: 8 },
  chartTrack: { alignItems: 'center', height: 108, justifyContent: 'flex-end', width: '100%' },
  chartBar: { backgroundColor: theme.colors.gold, borderRadius: 5, maxWidth: 34, minWidth: 12, width: '62%' },
  chartLabel: { color: theme.colors.textMuted, fontSize: 9 },
  compsScroller: { marginHorizontal: -2 },
  compCard: { backgroundColor: theme.colors.backgroundRaised, borderColor: theme.colors.surfaceSoft, borderRadius: 16, borderWidth: 1, marginRight: 10, overflow: 'hidden', width: 180 },
  compImage: { backgroundColor: theme.colors.surface, height: 112, width: '100%' },
  compImagePlaceholder: { alignItems: 'center', justifyContent: 'center' },
  compContent: { gap: 6, padding: 12 },
  compTitle: { color: theme.colors.text, fontSize: 12, fontWeight: '600', lineHeight: 17, minHeight: 34 },
  compPrice: { color: theme.colors.goldBright, fontSize: 18, fontWeight: '700' },
  compMeta: { color: theme.colors.textMuted, fontSize: 9 },
  calculatorSection: { gap: 14, paddingTop: 8 },
  platformScroller: { marginHorizontal: -2 },
  platformPill: { backgroundColor: theme.colors.surface, borderColor: theme.colors.surfaceSoft, borderRadius: 99, borderWidth: 1, marginRight: 8, paddingHorizontal: 15, paddingVertical: 10 },
  platformPillSelected: { backgroundColor: theme.colors.goldBright, borderColor: theme.colors.goldBright },
  platformText: { color: theme.colors.textMuted, fontSize: 12, fontWeight: '700' },
  platformTextSelected: { color: theme.colors.backgroundDeep },
  calculatorCard: { backgroundColor: theme.colors.backgroundRaised, borderColor: 'rgba(215,168,74,0.24)', borderRadius: theme.radii.medium, borderWidth: 1, gap: 18, padding: 16 },
  inputGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  inputGroup: { flexBasis: '47%', flexGrow: 1, gap: 6 },
  numberInputShell: { alignItems: 'center', backgroundColor: theme.colors.surface, borderColor: theme.colors.surfaceSoft, borderRadius: 12, borderWidth: 1, flexDirection: 'row', minHeight: 46 },
  numberInput: { color: theme.colors.text, flex: 1, fontSize: 15, paddingHorizontal: 12, paddingVertical: 10 },
  inputSuffix: { color: theme.colors.gold, fontSize: 13, fontWeight: '700', paddingRight: 12 },
  feeNote: { color: theme.colors.textMuted, fontSize: 10, lineHeight: 15 },
  profitHero: { alignItems: 'center', backgroundColor: 'rgba(215,168,74,0.08)', borderColor: 'rgba(215,168,74,0.2)', borderRadius: 18, borderWidth: 1, padding: 20 },
  profitLabel: { color: theme.colors.gold, fontSize: 10, fontWeight: '700', letterSpacing: 1.6 },
  profitValue: { color: theme.colors.goldBright, fontSize: 38, fontWeight: '700', letterSpacing: -1, marginTop: 7 },
  negative: { color: theme.colors.danger },
  profitSubline: { color: theme.colors.textMuted, fontSize: 12, marginTop: 5 },
  breakdown: { gap: 11 },
  breakdownRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  breakdownLabel: { color: theme.colors.textMuted, fontSize: 12 },
  breakdownValue: { color: theme.colors.text, fontSize: 12, fontWeight: '600' },
  breakEvenRow: { borderTopColor: theme.colors.surfaceSoft, borderTopWidth: 1, marginTop: 2, paddingTop: 13 },
  breakEvenLabel: { color: theme.colors.text, fontSize: 13, fontWeight: '700' },
  breakEvenValue: { color: '#58DFE8', fontSize: 15, fontWeight: '700' },
  disclaimer: { color: theme.colors.textMuted, fontSize: 9, lineHeight: 14, textAlign: 'center' },
});