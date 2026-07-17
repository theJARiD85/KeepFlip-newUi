import { useEffect } from 'react';
import type { ReactNode } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text as NativeText,
  type StyleProp,
  type TextProps,
  View,
  type ViewStyle,
} from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeInUp,
  FadeOut,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import type {
  AnalysisValuation,
  ItemAnalysisState,
} from '@/components/scanner/item-analysis-overlay';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { keepFlipTheme as theme } from '@/constants/keepflip-theme';

type ItemAnalysisBubblesProps = {
  bottomInset: number;
  doneLabel?: string;
  onDone: () => void;
  onRetry: () => void;
  retryLabel?: string;
  state: ItemAnalysisState;
  topInset: number;
};

type BubbleProps = {
  accent?: string;
  children: ReactNode;
  delay?: number;
  style?: StyleProp<ViewStyle>;
};

const analysisTextStyle = { fontFamily: theme.fonts.analysis } as const;

function Text({ style, ...props }: TextProps) {
  return <NativeText {...props} style={[analysisTextStyle, style]} />;
}

function withAlpha(color: string, alpha: number) {
  const value = color.replace('#', '');
  if (value.length !== 6) return color;
  const red = Number.parseInt(value.slice(0, 2), 16);
  const green = Number.parseInt(value.slice(2, 4), 16);
  const blue = Number.parseInt(value.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function percentage(value?: number) {
  if (value == null || !Number.isFinite(value)) return null;
  const normalized = value <= 1 ? value * 100 : value;
  return Math.round(Math.max(0, Math.min(100, normalized)));
}

function formatMoney(value: number, currency = 'USD') {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      maximumFractionDigits: value >= 100 ? 0 : 2,
    }).format(value);
  } catch {
    return `$${value.toFixed(value >= 100 ? 0 : 2)}`;
  }
}

function valuationHeading(source?: AnalysisValuation['source']) {
  return source === 'ebay' || source === 'multi_market'
    ? 'SOLD MARKET VALUATION'
    : 'VALUATION RANGE';
}

function valuationComparableSummary(
  source: AnalysisValuation['source'],
  count: number,
) {
  if (source === 'multi_market') {
    return `${count} confirmed sold comp${count === 1 ? '' : 's'} used`;
  }
  if (source === 'ebay') {
    return `${count} completed sold comp${count === 1 ? '' : 's'} used`;
  }
  return `${count} supplied price sample${count === 1 ? '' : 's'} used`;
}

function GlassBubble({
  accent = theme.colors.goldBright,
  children,
  delay = 0,
  style,
}: BubbleProps) {
  return (
    <Animated.View
      entering={FadeInUp.duration(260).delay(delay)}
      exiting={FadeOut.duration(140)}
      style={[
        styles.bubble,
        {
          borderColor: withAlpha(accent, 0.4),
          boxShadow: `0 10px 30px rgba(0, 0, 0, 0.48), 0 0 20px ${withAlpha(accent, 0.16)}`,
        },
        style,
      ]}>
      {children}
    </Animated.View>
  );
}

function BubbleEyebrow({ accent, children }: { accent: string; children: ReactNode }) {
  return <Text style={[styles.bubbleEyebrow, { color: accent }]}>{children}</Text>;
}

function BubbleButton({
  accent,
  label,
  onPress,
  secondary = false,
}: {
  accent: string;
  label: string;
  onPress: () => void;
  secondary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionButton,
        {
          borderColor: withAlpha(accent, 0.58),
          backgroundColor: secondary ? 'rgba(5, 5, 8, 0.82)' : withAlpha(accent, 0.9),
          boxShadow: `0 8px 22px rgba(0, 0, 0, 0.38), 0 0 16px ${withAlpha(accent, 0.18)}`,
        },
        pressed && styles.pressed,
      ]}>
      <Text style={[styles.actionButtonText, { color: secondary ? accent : theme.colors.backgroundDeep }]}>
        {label}
      </Text>
    </Pressable>
  );
}

function LiveSignal({ accent }: { accent: string }) {
  const pulse = useSharedValue(0.5);

  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(1, { duration: 720, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
    return () => cancelAnimation(pulse);
  }, [pulse]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: pulse.value,
    transform: [{ scale: 0.82 + pulse.value * 0.22 }],
  }));

  return (
    <Animated.View
      style={[
        styles.liveSignal,
        { backgroundColor: accent, boxShadow: `0 0 12px ${accent}` },
        animatedStyle,
      ]}
    />
  );
}

function MiniAnalysisReticle({ progress }: { progress?: number }) {
  const rotation = useSharedValue(0);
  const progressPercent = percentage(progress);

  useEffect(() => {
    rotation.value = withRepeat(
      withTiming(360, { duration: 980, easing: Easing.linear }),
      -1,
      false,
    );
    return () => cancelAnimation(rotation);
  }, [rotation]);

  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ rotateZ: `${rotation.value}deg` }],
  }));

  return (
    <View style={styles.miniReticle}>
      <Animated.View style={[styles.miniReticleRing, ringStyle]} />
      <View style={styles.miniReticleCore}>
        <Text style={styles.miniReticleText}>
          {progressPercent == null ? 'AI' : `${progressPercent}%`}
        </Text>
      </View>
    </View>
  );
}

function AnalysisProgressBubbles({
  state,
}: {
  state: Extract<ItemAnalysisState, { status: 'analyzing' }>;
}) {
  const accent = theme.colors.scannerCyan;
  const steps = state.steps ?? [];

  return (
    <View accessibilityLiveRegion="polite" style={styles.progressBubbles}>
      <GlassBubble accent={accent} style={styles.progressHero}>
        <MiniAnalysisReticle progress={state.progress} />
        <View style={styles.progressCopy}>
          <BubbleEyebrow accent={accent}>KEEPFLIP INTELLIGENCE</BubbleEyebrow>
          <Text selectable style={styles.progressTitle}>
            {state.stage ?? 'Analyzing item'}
          </Text>
          {state.detail ? (
            <Text selectable style={styles.progressDetail}>
              {state.detail}
            </Text>
          ) : null}
        </View>
      </GlassBubble>

      {steps.length > 0 ? (
        <View style={styles.stepCloud}>
          {steps.map((step, index) => {
            const isActive = step.status === 'active';
            const isComplete = step.status === 'complete';
            return (
              <GlassBubble
                accent={isActive ? accent : isComplete ? theme.colors.goldBright : theme.colors.textMuted}
                delay={60 + index * 35}
                key={`${step.label}-${index}`}
                style={[styles.stepBubble, !isActive && !isComplete && styles.stepBubblePending]}>
                <View
                  style={[
                    styles.stepDot,
                    {
                      backgroundColor: isComplete
                        ? theme.colors.goldBright
                        : isActive
                          ? accent
                          : 'transparent',
                      borderColor: isActive ? accent : theme.colors.goldMuted,
                    },
                  ]}
                />
                <Text
                  numberOfLines={2}
                  style={[
                    styles.stepText,
                    { color: isActive || isComplete ? theme.colors.text : theme.colors.textMuted },
                  ]}>
                  {step.label}
                </Text>
              </GlassBubble>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

function ConfidenceBubbles({
  confidence,
}: {
  confidence: NonNullable<Extract<ItemAnalysisState, { status: 'result' }>['data']['confidence']>;
}) {
  const entries = [
    ['OVERALL', confidence.overall, theme.colors.goldBright],
    ['IDENTITY', confidence.identity, theme.colors.scannerCyan],
    ['CONDITION', confidence.condition, theme.colors.scannerViolet],
    ['VALUATION', confidence.valuation, theme.colors.scannerAmber],
  ] as const;

  return (
    <View style={styles.metricCloud}>
      {entries.map(([label, value, accent], index) => {
        const score = percentage(value);
        if (score == null) return null;
        return (
          <GlassBubble accent={accent} delay={120 + index * 35} key={label} style={styles.metricBubble}>
            <Text style={[styles.metricValue, { color: accent }]}>{score}%</Text>
            <Text style={styles.metricLabel}>{label}</Text>
          </GlassBubble>
        );
      })}
    </View>
  );
}

function ResultBubbles({ state }: { state: Extract<ItemAnalysisState, { status: 'result' }> }) {
  const result = state.data;
  const identity = result.identity;
  const identityMeta = [identity.brand, identity.model, identity.variant, identity.category]
    .filter(Boolean)
    .join('  /  ');
  const readinessAccent =
    result.valuationReadiness.status === 'ready'
      ? theme.colors.scannerCyan
      : result.valuationReadiness.status === 'limited'
        ? theme.colors.scannerAmber
        : theme.colors.danger;

  return (
    <>
      <GlassBubble accent={theme.colors.goldBright} style={styles.identityBubble}>
        <BubbleEyebrow accent={theme.colors.goldBright}>ANALYSIS COMPLETE</BubbleEyebrow>
        <Text selectable style={styles.identityTitle}>
          {identity.title}
        </Text>
        {identityMeta ? (
          <Text selectable style={styles.identityMeta}>
            {identityMeta}
          </Text>
        ) : null}
      </GlassBubble>

      {result.summary ? (
        <GlassBubble accent={theme.colors.scannerCyan} delay={45} style={styles.summaryBubble}>
          <Text selectable style={styles.summaryText}>
            {result.summary}
          </Text>
        </GlassBubble>
      ) : null}

      {result.valuation ? (
        <GlassBubble accent={theme.colors.goldBright} delay={80} style={styles.valuationBubble}>
          <BubbleEyebrow accent={theme.colors.goldBright}>
            {valuationHeading(result.valuation.source)}
          </BubbleEyebrow>
          <View style={styles.valuationRow}>
            {[
              ['LOW', result.valuation.low],
              ['MEDIAN', result.valuation.median],
              ['HIGH', result.valuation.high],
            ].map(([label, value]) => {
              const featured = label === 'MEDIAN';
              return (
                <View key={label} style={[styles.valuationMetric, featured && styles.valuationMetricFeatured]}>
                  <Text style={[styles.valuationLabel, featured && styles.valuationLabelFeatured]}>{label}</Text>
                  <Text
                    selectable
                    adjustsFontSizeToFit
                    numberOfLines={1}
                    style={[styles.valuationValue, featured && styles.valuationValueFeatured]}>
                    {formatMoney(Number(value), result.valuation?.currency)}
                  </Text>
                </View>
              );
            })}
          </View>
          {result.valuation.comparableCount != null ? (
            <Text selectable style={styles.valuationFootnote}>
              {valuationComparableSummary(
                result.valuation.source,
                result.valuation.comparableCount,
              )}
            </Text>
          ) : null}
        </GlassBubble>
      ) : null}

      <GlassBubble accent={readinessAccent} delay={110} style={styles.readinessBubble}>
        <View style={styles.readinessRow}>
          <LiveSignal accent={readinessAccent} />
          <Text selectable style={[styles.readinessTitle, { color: readinessAccent }]}>
            {result.valuationReadiness.label ?? 'Valuation readiness'}
          </Text>
          {percentage(result.valuationReadiness.score) != null ? (
            <Text style={[styles.readinessScore, { color: readinessAccent }]}>
              {percentage(result.valuationReadiness.score)}%
            </Text>
          ) : null}
        </View>
        {result.valuationReadiness.reason ? (
          <Text selectable style={styles.readinessReason}>
            {result.valuationReadiness.reason}
          </Text>
        ) : null}
      </GlassBubble>

      {result.condition ? (
        <GlassBubble accent={theme.colors.scannerViolet} delay={140}>
          <View style={styles.conditionRow}>
            <View>
              <BubbleEyebrow accent={theme.colors.scannerViolet}>OBSERVED CONDITION</BubbleEyebrow>
              <Text selectable style={styles.conditionGrade}>
                {result.condition.label}
              </Text>
            </View>
            {percentage(result.condition.score) != null ? (
              <Text style={[styles.conditionScore, { color: theme.colors.scannerViolet }]}>
                {percentage(result.condition.score)}%
              </Text>
            ) : null}
          </View>
          {result.condition.summary ? (
            <Text selectable style={styles.compactBody}>
              {result.condition.summary}
            </Text>
          ) : null}
          {result.condition.details?.slice(0, 4).map((detail, index) => (
            <View key={`${detail}-${index}`} style={styles.detailRow}>
              <View style={[styles.detailDot, { backgroundColor: theme.colors.scannerViolet }]} />
              <Text selectable style={styles.detailText}>
                {detail}
              </Text>
            </View>
          ))}
        </GlassBubble>
      ) : null}

      {result.confidence ? <ConfidenceBubbles confidence={result.confidence} /> : null}

      {result.evidence?.slice(0, 6).map((evidence, index) => (
        <GlassBubble
          accent={theme.colors.scannerCyan}
          delay={170 + index * 30}
          key={evidence.id ?? `${evidence.label}-${index}`}
          style={styles.evidenceBubble}>
          <View style={styles.evidenceHeading}>
            <BubbleEyebrow accent={theme.colors.scannerCyan}>{evidence.label}</BubbleEyebrow>
            {evidence.source ? <Text style={styles.sourceTag}>{evidence.source}</Text> : null}
          </View>
          <Text selectable style={styles.evidenceValue}>
            {evidence.value}
          </Text>
        </GlassBubble>
      ))}

      {result.suggestedPhotos?.length ? (
        <GlassBubble accent={theme.colors.scannerAmber} delay={240}>
          <BubbleEyebrow accent={theme.colors.scannerAmber}>IMPROVE THE READ</BubbleEyebrow>
          {result.suggestedPhotos.slice(0, 4).map((photo, index) => (
            <View key={photo.id ?? `${photo.label}-${index}`} style={styles.detailRow}>
              <View style={[styles.detailDot, { backgroundColor: theme.colors.scannerAmber }]} />
              <Text selectable style={styles.detailText}>
                {photo.label}
              </Text>
            </View>
          ))}
        </GlassBubble>
      ) : null}
    </>
  );
}

function NonResultBubbles({ state }: { state: Exclude<ItemAnalysisState, { status: 'analyzing' | 'result' }> }) {
  const isError = state.status === 'error';
  const isSetup = state.status === 'setup';
  const accent = isError
    ? theme.colors.danger
    : isSetup
      ? theme.colors.scannerViolet
      : theme.colors.scannerAmber;
  const title =
    state.title ??
    (isError ? 'Analysis interrupted' : isSetup ? 'Connect item analysis' : 'More evidence needed');
  const message =
    state.message ??
    (isSetup
      ? 'KeepFlip needs its secure Appwrite analysis service connected.'
      : 'Add a clearer item view and try again.');
  const details =
    state.status === 'setup'
      ? state.requirements ?? []
      : state.status === 'insufficient-evidence'
        ? [
            ...(state.evidence ?? []),
            ...state.suggestedPhotos.map((photo) => photo.label),
          ]
        : state.code
          ? [`Error code: ${state.code}`]
          : [];

  return (
    <>
      <GlassBubble accent={accent} style={styles.statusBubble}>
        <View style={styles.statusIcon}>
          <LiveSignal accent={accent} />
        </View>
        <BubbleEyebrow accent={accent}>
          {isError ? 'KEEPFLIP ALERT' : isSetup ? 'SETUP REQUIRED' : 'PHOTO GUIDANCE'}
        </BubbleEyebrow>
        <Text selectable style={styles.statusTitle}>
          {title}
        </Text>
        <Text selectable style={styles.statusMessage}>
          {message}
        </Text>
      </GlassBubble>

      {details.slice(0, 6).map((detail, index) => (
        <GlassBubble accent={accent} delay={70 + index * 40} key={`${detail}-${index}`} style={styles.guidanceBubble}>
          <Text style={[styles.guidanceIndex, { color: accent }]}>{String(index + 1).padStart(2, '0')}</Text>
          <Text selectable style={styles.guidanceText}>
            {detail}
          </Text>
        </GlassBubble>
      ))}
    </>
  );
}

export function ItemAnalysisBubbles({
  bottomInset,
  doneLabel = 'Done',
  onDone,
  onRetry,
  retryLabel,
  state,
  topInset,
}: ItemAnalysisBubblesProps) {
  const isAnalyzing = state.status === 'analyzing';
  const isResult = state.status === 'result';
  const accent =
    state.status === 'error'
      ? theme.colors.danger
      : state.status === 'setup'
        ? theme.colors.scannerViolet
        : state.status === 'insufficient-evidence'
          ? theme.colors.scannerAmber
          : isAnalyzing
            ? theme.colors.scannerCyan
            : theme.colors.goldBright;
  const resolvedRetryLabel =
    retryLabel ?? (state.status === 'insufficient-evidence' ? 'Add photos' : 'Retry analysis');
  const statusLabel =
    state.status === 'analyzing'
      ? 'KEEPFLIP AI / ANALYZING'
      : state.status === 'result'
        ? 'KEEPFLIP AI / RESULT'
        : state.status === 'setup'
          ? 'KEEPFLIP AI / SETUP'
          : state.status === 'insufficient-evidence'
            ? 'KEEPFLIP AI / MORE PHOTOS'
            : 'KEEPFLIP AI / ALERT';

  return (
    <Animated.View
      accessibilityViewIsModal
      entering={FadeIn.duration(180)}
      exiting={FadeOut.duration(160)}
      importantForAccessibility="yes"
      style={styles.overlay}>
      <Animated.View
        entering={FadeInDown.duration(220)}
        style={[styles.topChrome, { paddingTop: topInset + 10 }]}>
        <View
          accessibilityLiveRegion="polite"
          style={[
            styles.statusPill,
            {
              borderColor: withAlpha(accent, 0.46),
              boxShadow: `0 8px 20px rgba(0, 0, 0, 0.4), 0 0 16px ${withAlpha(accent, 0.18)}`,
            },
          ]}>
          <LiveSignal accent={accent} />
          <Text style={[styles.statusPillText, { color: accent }]}>
            {statusLabel}
          </Text>
        </View>

        {!isAnalyzing ? (
          <Pressable
            accessibilityLabel="Close item analysis"
            accessibilityRole="button"
            onPress={onDone}
            style={({ pressed }) => [styles.closeBubble, pressed && styles.pressed]}>
            <IconSymbol color={theme.colors.cream} name="xmark" size={19} />
          </Pressable>
        ) : null}
      </Animated.View>

      {isAnalyzing ? (
        <View
          style={[
            styles.analyzingContent,
            { paddingTop: topInset + 72, paddingBottom: bottomInset + 24 },
          ]}>
          <AnalysisProgressBubbles state={state} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { paddingTop: topInset + 78, paddingBottom: bottomInset + 28 },
          ]}
          contentInsetAdjustmentBehavior="automatic"
          showsVerticalScrollIndicator={false}
          style={styles.scrollView}>
          <Animated.View
            entering={FadeInUp.duration(220)}
            key={state.status}
            style={styles.bubbleColumn}>
            {state.status === 'result' ? <ResultBubbles state={state} /> : null}
            {state.status !== 'result' ? (
              <NonResultBubbles state={state} />
            ) : null}

            <View style={styles.actions}>
              {!isResult ? (
                <BubbleButton accent={accent} label={resolvedRetryLabel} onPress={onRetry} />
              ) : null}
              <BubbleButton
                accent={isResult ? theme.colors.goldBright : accent}
                label={doneLabel}
                onPress={onDone}
                secondary={!isResult}
              />
            </View>
          </Animated.View>
        </ScrollView>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 44,
    backgroundColor: 'rgba(1, 1, 3, 0.16)',
    experimental_backgroundImage: `
      radial-gradient(circle at 12% 18%, rgba(88, 223, 232, 0.08) 0%, transparent 30%),
      radial-gradient(circle at 86% 76%, rgba(215, 168, 74, 0.08) 0%, transparent 34%)
    `,
  },
  topChrome: {
    position: 'absolute',
    top: 0,
    right: 16,
    left: 16,
    zIndex: 4,
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  statusPill: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 13,
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    backgroundColor: 'rgba(4, 4, 7, 0.84)',
  },
  statusPillText: { fontSize: 9, fontWeight: '900', letterSpacing: 1.15 },
  liveSignal: { width: 7, height: 7, borderRadius: theme.radii.pill },
  closeBubble: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    borderColor: 'rgba(242, 211, 138, 0.42)',
    backgroundColor: 'rgba(4, 4, 7, 0.84)',
    boxShadow: '0 8px 20px rgba(0, 0, 0, 0.42)',
  },
  pressed: { opacity: 0.7, transform: [{ scale: 0.95 }] },
  analyzingContent: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  progressBubbles: { width: '100%', maxWidth: 390, alignItems: 'center', gap: 12 },
  progressHero: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
  },
  progressCopy: { flex: 1, minWidth: 0, gap: 5 },
  progressTitle: { color: theme.colors.cream, fontSize: 17, lineHeight: 22 },
  progressDetail: { color: theme.colors.textMuted, fontSize: 10, lineHeight: 16 },
  miniReticle: { width: 62, height: 62, alignItems: 'center', justifyContent: 'center' },
  miniReticleRing: {
    position: 'absolute',
    width: 60,
    height: 60,
    borderRadius: theme.radii.pill,
    borderWidth: 2,
    borderColor: 'rgba(88, 223, 232, 0.16)',
    borderTopColor: theme.colors.scannerCyan,
    borderRightColor: theme.colors.scannerViolet,
    boxShadow: '0 0 18px rgba(88, 223, 232, 0.28)',
  },
  miniReticleCore: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    borderColor: 'rgba(242, 211, 138, 0.42)',
    backgroundColor: 'rgba(4, 8, 11, 0.94)',
  },
  miniReticleText: {
    color: theme.colors.scannerCyan,
    fontSize: 10,
    fontVariant: ['tabular-nums'],
  },
  stepCloud: { width: '100%', flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 },
  stepBubble: {
    width: '48%',
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 11,
    paddingVertical: 9,
  },
  stepBubblePending: { opacity: 0.58 },
  stepDot: { width: 10, height: 10, borderRadius: theme.radii.pill, borderWidth: 1 },
  stepText: { flex: 1, fontSize: 9, lineHeight: 13 },
  scrollView: { flex: 1, width: '100%' },
  scrollContent: { width: '100%', alignItems: 'center', paddingHorizontal: 16 },
  bubbleColumn: { width: '100%', maxWidth: 560, gap: 12 },
  bubble: {
    width: '100%',
    gap: 9,
    paddingHorizontal: 17,
    paddingVertical: 15,
    borderRadius: 26,
    borderCurve: 'continuous',
    borderWidth: 1,
    backgroundColor: 'rgba(5, 5, 8, 0.82)',
  },
  bubbleEyebrow: { fontSize: 9, fontWeight: '900', letterSpacing: 1.4 },
  identityBubble: { alignItems: 'center', paddingVertical: 20 },
  identityTitle: { color: theme.colors.cream, fontSize: 25, lineHeight: 30, textAlign: 'center' },
  identityMeta: { color: theme.colors.textMuted, fontSize: 10, lineHeight: 16, textAlign: 'center' },
  summaryBubble: { alignSelf: 'center', width: '92%' },
  summaryText: { color: theme.colors.text, fontSize: 12, lineHeight: 19, textAlign: 'center' },
  valuationBubble: { paddingTop: 18 },
  valuationRow: { flexDirection: 'row', alignItems: 'stretch', gap: 7 },
  valuationMetric: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 5,
    paddingVertical: 12,
    borderRadius: 18,
    backgroundColor: 'rgba(242, 211, 138, 0.05)',
  },
  valuationMetricFeatured: {
    borderWidth: 1,
    borderColor: 'rgba(242, 211, 138, 0.42)',
    backgroundColor: 'rgba(215, 168, 74, 0.13)',
  },
  valuationLabel: { color: theme.colors.textMuted, fontSize: 8, letterSpacing: 1 },
  valuationLabelFeatured: { color: theme.colors.goldBright },
  valuationValue: { color: theme.colors.text, fontSize: 14 },
  valuationValueFeatured: { color: theme.colors.goldBright, fontSize: 17 },
  valuationFootnote: { color: theme.colors.textMuted, fontSize: 9, textAlign: 'center' },
  readinessBubble: { alignSelf: 'flex-end', width: '95%' },
  readinessRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  readinessTitle: { flex: 1, fontSize: 12, lineHeight: 17 },
  readinessScore: { fontSize: 15 },
  readinessReason: { color: theme.colors.textMuted, fontSize: 10, lineHeight: 16 },
  conditionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 14 },
  conditionGrade: { color: theme.colors.cream, fontSize: 20, lineHeight: 25 },
  conditionScore: { fontSize: 18 },
  compactBody: { color: theme.colors.textMuted, fontSize: 11, lineHeight: 17 },
  detailRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 9 },
  detailDot: { width: 6, height: 6, marginTop: 5, borderRadius: theme.radii.pill },
  detailText: { flex: 1, color: theme.colors.text, fontSize: 10, lineHeight: 16 },
  metricCloud: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metricBubble: { width: '48%', alignItems: 'center', paddingVertical: 12 },
  metricValue: { fontSize: 19 },
  metricLabel: { color: theme.colors.textMuted, fontSize: 8, letterSpacing: 1.1 },
  evidenceBubble: { alignSelf: 'center', width: '94%', paddingVertical: 13 },
  evidenceHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  sourceTag: { color: theme.colors.textMuted, fontSize: 8, textTransform: 'uppercase' },
  evidenceValue: { color: theme.colors.text, fontSize: 10, lineHeight: 16 },
  statusBubble: { alignItems: 'center', paddingVertical: 22 },
  statusIcon: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    borderColor: 'rgba(242, 211, 138, 0.18)',
  },
  statusTitle: { color: theme.colors.cream, fontSize: 23, lineHeight: 29, textAlign: 'center' },
  statusMessage: { color: theme.colors.textMuted, fontSize: 12, lineHeight: 19, textAlign: 'center' },
  guidanceBubble: { alignSelf: 'center', width: '94%', flexDirection: 'row', alignItems: 'flex-start', gap: 11 },
  guidanceIndex: { fontSize: 10, fontVariant: ['tabular-nums'] },
  guidanceText: { flex: 1, color: theme.colors.text, fontSize: 11, lineHeight: 17 },
  actions: { flexDirection: 'row', justifyContent: 'center', gap: 10, paddingTop: 4 },
  actionButton: {
    minWidth: 126,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    borderRadius: theme.radii.pill,
    borderWidth: 1,
  },
  actionButtonText: { fontSize: 12, fontWeight: '900' },
});
