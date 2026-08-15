import { useEffect } from 'react';
import {
  Text as NativeText,
  Pressable,
  ScrollView,
  StyleSheet,
  type TextProps,
  View,
} from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeInUp,
  FadeOut,
  LinearTransition,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import type { AnalysisProfitPlan } from "@/components/scanner/analysis-visual-types";
import type { Thought } from '@/components/scanner/scanner-thought-stream';
import { keepFlipTheme as theme } from '@/constants/keepflip-theme';

const analysisTextStyle = { fontFamily: theme.fonts.radar } as const;

function Text({ style, ...props }: TextProps) {
  return <NativeText {...props} style={[analysisTextStyle, style]} />;
}

export type AnalysisSuggestedPhoto = {
  description?: string;
  id?: string;
  label: string;
  priority?: 'required' | 'recommended';
};

export type AnalysisEvidence = {
  confidence?: number;
  id?: string;
  label: string;
  source?: string;
  value: string;
};

export type AnalysisIdentity = {
  brand?: string;
  category?: string;
  confidence?: number;
  model?: string;
  title: string;
  variant?: string;
};

export type AnalysisCondition = {
  details?: string[];
  label: string;
  score?: number;
  summary?: string;
};

export type AnalysisConfidenceBreakdown = {
  condition?: number;
  identity?: number;
  overall: number;
  valuation?: number;
};

export type AnalysisValuationReadiness = {
  label?: string;
  reason?: string;
  score?: number;
  status: 'ready' | 'limited' | 'not-ready';
};

export type AnalysisValuation = {
  basis?: string;
  comparableCount?: number;
  currency?: string;
  high: number;
  low: number;
  median: number;
  snapshot?: boolean;
  source?: 'ebay' | 'multi_market' | 'serpapi_ai' | 'supplied';
};

export type ItemAnalysisResult = {
  profitPlan: AnalysisProfitPlan;
  condition?: AnalysisCondition;
  confidence?: AnalysisConfidenceBreakdown;
  evidence?: AnalysisEvidence[];
  identity: AnalysisIdentity;
  suggestedPhotos?: AnalysisSuggestedPhoto[];
  summary?: string;
  valuation?: AnalysisValuation;
  valuationReadiness: AnalysisValuationReadiness;
};

export type AnalysisStep = {
  label: string;
  status: 'pending' | 'active' | 'complete';
};

export type ItemAnalysisState =
  | {
    message?: string;
    requirements?: string[];
    status: 'setup';
    title?: string;
  }
  | {
    detail?: string;
    insights?: Thought[];
    progress?: number;
    stage?: string;
    status: 'analyzing';
    steps?: AnalysisStep[];
  }
  | {
    code?: string;
    message: string;
    status: 'error';
    title?: string;
  }
  | {
    evidence?: string[];
    message?: string;
    status: 'insufficient-evidence';
    suggestedPhotos: AnalysisSuggestedPhoto[];
    title?: string;
  }
  | {
    data: ItemAnalysisResult;
    status: 'result';
  };

type ItemAnalysisOverlayProps = {
  bottomInset: number;
  doneLabel?: string;
  onDone: () => void;
  onRetry: () => void;
  retryLabel?: string;
  state: ItemAnalysisState;
  topInset: number;
};

const DEFAULT_ANALYSIS_STEPS: AnalysisStep[] = [
  { label: 'Reading visual and label evidence', status: 'active' },
  { label: 'Resolving exact item identity', status: 'pending' },
  { label: 'Reviewing condition and sold-market evidence', status: 'pending' },
  { label: 'Calibrating valuation range', status: 'pending' },
];

function normalizeScore(value?: number) {
  if (value == null || !Number.isFinite(value)) return undefined;
  const normalized = value > 1 ? value / 100 : value;
  return Math.max(0, Math.min(1, normalized));
}

function percentage(value?: number) {
  const normalized = normalizeScore(value);
  return normalized == null ? undefined : Math.round(normalized * 100);
}

function formatMoney(value: number, currency = 'USD') {
  try {
    return new Intl.NumberFormat('en-US', {
      currency,
      maximumFractionDigits: 0,
      style: 'currency',
    }).format(value);
  } catch {
    return `$${Math.round(value).toLocaleString('en-US')}`;
  }
}

function valuationSectionTitle(source?: AnalysisValuation['source']) {
  return source === 'ebay' || source === 'multi_market'
    ? 'SOLD MARKET VALUATION'
    : 'SUPPLIED PRICE STATISTICS';
}

function valuationComparableLabel(
  source: AnalysisValuation['source'],
  count: number,
) {
  if (source === 'multi_market') {
    return `confirmed sold comp${count === 1 ? '' : 's'}`;
  }
  if (source === 'ebay') {
    return `completed sold comp${count === 1 ? '' : 's'}`;
  }
  return `supplied price sample${count === 1 ? '' : 's'}`;
}

function StateHeader({ accent, eyebrow, title }: { accent: string; eyebrow: string; title: string }) {
  return (
    <View style={styles.stateHeader}>
      <View style={[styles.stateMarker, { backgroundColor: accent, boxShadow: `0 0 18px ${accent}` }]} />
      <View style={styles.stateHeaderCopy}>
        <Text selectable style={[styles.eyebrow, { color: accent }]}>
          {eyebrow}
        </Text>
        <Text selectable style={styles.title}>
          {title}
        </Text>
      </View>
    </View>
  );
}

function AnalysisOrb({ progress }: { progress?: number }) {
  const spin = useSharedValue(0);
  const pulse = useSharedValue(0);
  const barProgress = useSharedValue(normalizeScore(progress) ?? 0.12);

  useEffect(() => {
    spin.value = withRepeat(
      withTiming(1, { duration: 1800, easing: Easing.linear }),
      -1,
      false,
    );
    pulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 720, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: 720, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      false,
    );

    return () => {
      cancelAnimation(spin);
      cancelAnimation(pulse);
    };
  }, [pulse, spin]);

  useEffect(() => {
    const nextProgress = normalizeScore(progress);
    cancelAnimation(barProgress);
    barProgress.value =
      nextProgress == null
        ? withRepeat(
          withSequence(
            withTiming(0.86, { duration: 1250, easing: Easing.inOut(Easing.cubic) }),
            withTiming(0.16, { duration: 900, easing: Easing.inOut(Easing.cubic) }),
          ),
          -1,
          false,
        )
        : withTiming(nextProgress, { duration: 420, easing: Easing.out(Easing.cubic) });

    return () => cancelAnimation(barProgress);
  }, [barProgress, progress]);

  const outerRingStyle = useAnimatedStyle(() => ({
    transform: [{ rotateZ: `${spin.value * 360}deg` }],
  }));
  const innerRingStyle = useAnimatedStyle(() => ({
    transform: [{ rotateZ: `${spin.value * -300}deg` }],
  }));
  const pulseStyle = useAnimatedStyle(() => ({
    opacity: 0.65 + pulse.value * 0.35,
    transform: [{ scale: 0.88 + pulse.value * 0.16 }],
  }));
  const progressStyle = useAnimatedStyle(() => ({
    transform: [{ scaleX: Math.max(0.025, barProgress.value) }],
  }));
  const progressPercent = percentage(progress);

  return (
    <View style={styles.analysisVisual}>
      <View style={styles.orbShell}>
        <Animated.View style={[styles.outerRing, outerRingStyle]} />
        <Animated.View style={[styles.innerRing, innerRingStyle]} />
        <Animated.View style={[styles.orbCore, pulseStyle]}>
          <Text style={styles.orbText}>{progressPercent == null ? 'AI' : `${progressPercent}%`}</Text>
        </Animated.View>
      </View>
      <View style={styles.progressTrack}>
        <Animated.View style={[styles.progressFill, progressStyle]} />
      </View>
    </View>
  );
}

function ActionButton({
  accent = theme.colors.goldBright,
  label,
  onPress,
  secondary = false,
}: {
  accent?: string;
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
        { borderColor: accent },
        secondary ? styles.actionButtonSecondary : { backgroundColor: accent },
        pressed && styles.buttonPressed,
      ]}>
      <Text style={[styles.actionButtonText, secondary && { color: accent }]}>{label}</Text>
    </Pressable>
  );
}

function RequirementList({ items, accent }: { accent: string; items: string[] }) {
  return (
    <View style={styles.listCard}>
      {items.map((item, index) => (
        <View key={`${item}-${index}`} style={styles.listRow}>
          <View style={[styles.listBullet, { borderColor: accent }]}>
            <Text style={[styles.listBulletText, { color: accent }]}>{index + 1}</Text>
          </View>
          <Text selectable style={styles.listText}>
            {item}
          </Text>
        </View>
      ))}
    </View>
  );
}

function SuggestedPhotos({ photos }: { photos: AnalysisSuggestedPhoto[] }) {
  if (photos.length === 0) return null;

  return (
    <Section title="PHOTOS THAT WOULD IMPROVE THIS">
      <View style={styles.suggestionList}>
        {photos.map((photo, index) => {
          const required = photo.priority === 'required';
          const accent = required ? theme.colors.scannerAmber : theme.colors.scannerCyan;

          return (
            <Animated.View
              entering={FadeInUp.duration(220).delay(Math.min(index, 5) * 35)}
              key={photo.id ?? `${photo.label}-${index}`}
              layout={LinearTransition.duration(180)}
              style={styles.suggestionCard}>
              <View style={[styles.suggestionIcon, { borderColor: accent }]}>
                <View style={[styles.suggestionFocus, { backgroundColor: accent }]} />
              </View>
              <View style={styles.suggestionCopy}>
                <View style={styles.suggestionTitleRow}>
                  <Text selectable style={styles.suggestionTitle}>
                    {photo.label}
                  </Text>
                  {required ? (
                    <Text style={[styles.priorityTag, { color: accent }]}>REQUIRED</Text>
                  ) : null}
                </View>
                {photo.description ? (
                  <Text selectable style={styles.suggestionDescription}>
                    {photo.description}
                  </Text>
                ) : null}
              </View>
            </Animated.View>
          );
        })}
      </View>
    </Section>
  );
}

function Section({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function ConfidenceMeter({
  accent = theme.colors.scannerCyan,
  label,
  value,
}: {
  accent?: string;
  label: string;
  value?: number;
}) {
  const score = percentage(value);
  const width = `${score ?? 0}%` as const;

  return (
    <View style={styles.confidenceRow}>
      <View style={styles.confidenceLabelRow}>
        <Text selectable style={styles.confidenceLabel}>
          {label}
        </Text>
        <Text selectable style={[styles.confidenceValue, { color: accent }]}>
          {score == null ? '—' : `${score}%`}
        </Text>
      </View>
      <View style={styles.meterTrack}>
        <Animated.View
          entering={FadeIn.duration(220)}
          style={[styles.meterFill, { backgroundColor: accent, width }]}
        />
      </View>
    </View>
  );
}

function SetupState({ state }: { state: Extract<ItemAnalysisState, { status: 'setup' }> }) {
  const requirements = state.requirements ?? [
    'Connect the KeepFlip analysis function.',
    'Add server-side OpenAI and Google Vision credentials.',
    'Capture at least one clear item photo.',
  ];

  return (
    <>
      <StateHeader
        accent={theme.colors.scannerViolet}
        eyebrow="ANALYSIS SETUP"
        title={state.title ?? 'Connect item intelligence'}
      />
      <Text selectable style={styles.leadText}>
        {state.message ??
          'KeepFlip is ready to send photos through the secure analysis pipeline once its backend is configured.'}
      </Text>
      <RequirementList accent={theme.colors.scannerViolet} items={requirements} />
    </>
  );
}

function AnalyzingState({ state }: { state: Extract<ItemAnalysisState, { status: 'analyzing' }> }) {
  const steps = state.steps ?? DEFAULT_ANALYSIS_STEPS;

  return (
    <>
      <StateHeader
        accent={theme.colors.scannerCyan}
        eyebrow="KEEPFLIP INTELLIGENCE"
        title={state.stage ?? 'Analyzing your item'}
      />
      <Text selectable style={styles.leadText}>
        {state.detail ?? 'Cross-checking image evidence before estimating market value.'}
      </Text>
      <AnalysisOrb progress={state.progress} />
      <View style={styles.stepList}>
        {steps.map((step, index) => {
          const active = step.status === 'active';
          const complete = step.status === 'complete';
          const accent = complete
            ? theme.colors.goldBright
            : active
              ? theme.colors.scannerCyan
              : theme.colors.goldMuted;

          return (
            <Animated.View
              entering={FadeInUp.duration(210).delay(index * 35)}
              key={`${step.label}-${index}`}
              style={[styles.stepRow, active && styles.stepRowActive]}>
              <View style={[styles.stepDot, { borderColor: accent }]}>
                {complete ? <View style={[styles.stepDotCore, { backgroundColor: accent }]} /> : null}
              </View>
              <Text selectable style={[styles.stepText, { color: active ? theme.colors.text : theme.colors.textMuted }]}>
                {step.label}
              </Text>
              <Text style={[styles.stepStatus, { color: accent }]}>
                {complete ? 'DONE' : active ? 'LIVE' : 'NEXT'}
              </Text>
            </Animated.View>
          );
        })}
      </View>
    </>
  );
}

function ErrorState({ state }: { state: Extract<ItemAnalysisState, { status: 'error' }> }) {
  return (
    <>
      <StateHeader
        accent={theme.colors.danger}
        eyebrow="ANALYSIS INTERRUPTED"
        title={state.title ?? 'We could not finish this analysis'}
      />
      <View style={styles.errorCard}>
        <Text selectable style={styles.errorMessage}>
          {state.message}
        </Text>
        {state.code ? (
          <Text selectable style={styles.errorCode}>
            Reference: {state.code}
          </Text>
        ) : null}
      </View>
      <Text selectable style={styles.supportingText}>
        Your photos remain in this scan session. Retry when you are ready.
      </Text>
    </>
  );
}

function InsufficientEvidenceState({
  state,
}: {
  state: Extract<ItemAnalysisState, { status: 'insufficient-evidence' }>;
}) {
  return (
    <>
      <StateHeader
        accent={theme.colors.scannerAmber}
        eyebrow="MORE EVIDENCE NEEDED"
        title={state.title ?? 'A confident match needs another angle'}
      />
      <Text selectable style={styles.leadText}>
        {state.message ??
          'The current photos contain useful clues, but not enough to identify the exact item and value it responsibly.'}
      </Text>
      {state.evidence?.length ? (
        <Section title="WHAT WE COULD VERIFY">
          <View style={styles.verifiedCard}>
            {state.evidence.map((item, index) => (
              <View key={`${item}-${index}`} style={styles.verifiedRow}>
                <View style={styles.verifiedDot} />
                <Text selectable style={styles.verifiedText}>
                  {item}
                </Text>
              </View>
            ))}
          </View>
        </Section>
      ) : null}
      <SuggestedPhotos photos={state.suggestedPhotos} />
    </>
  );
}

function IdentityCard({ identity }: { identity: AnalysisIdentity }) {
  const identityFields = [
    ['BRAND', identity.brand],
    ['MODEL', identity.model],
    ['VARIANT', identity.variant],
    ['CATEGORY', identity.category],
  ].filter((field): field is [string, string] => Boolean(field[1]));

  return (
    <View style={styles.identityCard}>
      <Text selectable style={styles.identityTitle}>
        {identity.title}
      </Text>
      {identityFields.length ? (
        <View style={styles.identityGrid}>
          {identityFields.map(([label, value]) => (
            <View key={label} style={styles.identityField}>
              <Text style={styles.identityFieldLabel}>{label}</Text>
              <Text selectable style={styles.identityFieldValue}>
                {value}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
      {identity.confidence != null ? (
        <ConfidenceMeter label="Identity confidence" value={identity.confidence} />
      ) : null}
    </View>
  );
}

function ConditionCard({ condition }: { condition: AnalysisCondition }) {
  return (
    <View style={styles.conditionCard}>
      <View style={styles.conditionTopRow}>
        <Text selectable style={styles.conditionGrade}>
          {condition.label}
        </Text>
        {condition.score != null ? (
          <Text selectable style={styles.conditionScore}>
            {percentage(condition.score)}%
          </Text>
        ) : null}
      </View>
      {condition.summary ? (
        <Text selectable style={styles.conditionSummary}>
          {condition.summary}
        </Text>
      ) : null}
      {condition.details?.length ? (
        <View style={styles.detailList}>
          {condition.details.map((detail, index) => (
            <View key={`${detail}-${index}`} style={styles.detailRow}>
              <View style={styles.detailBullet} />
              <Text selectable style={styles.detailText}>
                {detail}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function EvidenceCard({ evidence }: { evidence: AnalysisEvidence[] }) {
  if (evidence.length === 0) return null;

  return (
    <View style={styles.evidenceCard}>
      {evidence.map((item, index) => (
        <View key={item.id ?? `${item.label}-${index}`} style={styles.evidenceRow}>
          <View style={styles.evidenceIndex}>
            <Text style={styles.evidenceIndexText}>{String(index + 1).padStart(2, '0')}</Text>
          </View>
          <View style={styles.evidenceCopy}>
            <View style={styles.evidenceLabelRow}>
              <Text selectable style={styles.evidenceLabel}>
                {item.label}
              </Text>
              {item.source ? <Text style={styles.sourceTag}>{item.source.toUpperCase()}</Text> : null}
            </View>
            <Text selectable style={styles.evidenceValue}>
              {item.value}
            </Text>
          </View>
          {item.confidence != null ? (
            <Text selectable style={styles.evidenceConfidence}>
              {percentage(item.confidence)}%
            </Text>
          ) : null}
        </View>
      ))}
    </View>
  );
}

function ValuationReadinessCard({ readiness }: { readiness: AnalysisValuationReadiness }) {
  const isReady = readiness.status === 'ready';
  const isLimited = readiness.status === 'limited';
  const accent = isReady
    ? theme.colors.scannerCyan
    : isLimited
      ? theme.colors.scannerAmber
      : theme.colors.danger;
  const fallbackLabel = isReady ? 'Ready to value' : isLimited ? 'Limited estimate' : 'Not ready to value';

  return (
    <View style={[styles.readinessCard, { borderColor: `${accent}55` }]}>
      <View style={styles.readinessTopRow}>
        <View style={[styles.readinessSignal, { backgroundColor: accent, boxShadow: `0 0 14px ${accent}` }]} />
        <Text selectable style={[styles.readinessLabel, { color: accent }]}>
          {readiness.label ?? fallbackLabel}
        </Text>
        {readiness.score != null ? (
          <Text selectable style={[styles.readinessScore, { color: accent }]}>
            {percentage(readiness.score)}%
          </Text>
        ) : null}
      </View>
      {readiness.reason ? (
        <Text selectable style={styles.readinessReason}>
          {readiness.reason}
        </Text>
      ) : null}
    </View>
  );
}

function ValuationCard({ valuation }: { valuation: AnalysisValuation }) {
  const currency = valuation.currency ?? 'USD';
  const values = [
    ['LOW', valuation.low],
    ['MEDIAN', valuation.median],
    ['HIGH', valuation.high],
  ] as const;

  return (
    <View style={styles.valuationCard}>
      <View style={styles.valuationValues}>
        {values.map(([label, value]) => {
          const featured = label === 'MEDIAN';
          return (
            <View key={label} style={[styles.valuationColumn, featured && styles.valuationColumnFeatured]}>
              <Text style={[styles.valuationLabel, featured && styles.valuationLabelFeatured]}>{label}</Text>
              <Text
                selectable
                adjustsFontSizeToFit
                numberOfLines={1}
                style={[styles.valuationValue, featured && styles.valuationValueFeatured]}>
                {formatMoney(value, currency)}
              </Text>
            </View>
          );
        })}
      </View>
      {valuation.comparableCount != null || valuation.basis ? (
        <View style={styles.valuationBasisRow}>
          {valuation.comparableCount != null ? (
            <Text selectable style={styles.valuationBasisStrong}>
              {valuation.comparableCount}{' '}
              {valuationComparableLabel(
                valuation.source,
                valuation.comparableCount,
              )}
            </Text>
          ) : null}
          {valuation.basis ? (
            <Text selectable style={styles.valuationBasis}>
              {valuation.basis}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function ResultState({ result }: { result: ItemAnalysisResult }) {
  const confidence = result.confidence;

  return (
    <>
      <StateHeader
        accent={theme.colors.goldBright}
        eyebrow="ANALYSIS COMPLETE"
        title="Evidence-backed result"
      />
      {result.summary ? (
        <Text selectable style={styles.leadText}>
          {result.summary}
        </Text>
      ) : null}

      <Section title="ITEM IDENTITY">
        <IdentityCard identity={result.identity} />
      </Section>

      {result.condition ? (
        <Section title="OBSERVED CONDITION">
          <ConditionCard condition={result.condition} />
        </Section>
      ) : null}

      {result.evidence?.length ? (
        <Section title="EVIDENCE USED">
          <EvidenceCard evidence={result.evidence} />
        </Section>
      ) : null}

      {confidence ? (
        <Section title="CONFIDENCE BREAKDOWN">
          <View style={styles.confidenceCard}>
            <ConfidenceMeter accent={theme.colors.goldBright} label="Overall" value={confidence.overall} />
            {confidence.identity != null ? (
              <ConfidenceMeter label="Identity" value={confidence.identity} />
            ) : null}
            {confidence.condition != null ? (
              <ConfidenceMeter accent={theme.colors.scannerViolet} label="Condition" value={confidence.condition} />
            ) : null}
            {confidence.valuation != null ? (
              <ConfidenceMeter accent={theme.colors.scannerAmber} label="Valuation" value={confidence.valuation} />
            ) : null}
          </View>
        </Section>
      ) : null}

      <Section title="VALUATION READINESS">
        <ValuationReadinessCard readiness={result.valuationReadiness} />
      </Section>

      {result.valuation ? (
        <Section title={valuationSectionTitle(result.valuation.source)}>
          <ValuationCard valuation={result.valuation} />
        </Section>
      ) : null}

      {result.suggestedPhotos?.length ? <SuggestedPhotos photos={result.suggestedPhotos} /> : null}
    </>
  );
}

export function ItemAnalysisOverlay({
  bottomInset,
  doneLabel = 'Done',
  onDone,
  onRetry,
  retryLabel,
  state,
  topInset,
}: ItemAnalysisOverlayProps) {
  const isAnalyzing = state.status === 'analyzing';
  const isResult = state.status === 'result';
  const accent =
    state.status === 'error'
      ? theme.colors.danger
      : state.status === 'insufficient-evidence'
        ? theme.colors.scannerAmber
        : state.status === 'setup'
          ? theme.colors.scannerViolet
          : state.status === 'analyzing'
            ? theme.colors.scannerCyan
            : theme.colors.goldBright;
  const resolvedRetryLabel =
    retryLabel ?? (state.status === 'insufficient-evidence' ? 'Add photos & retry' : 'Retry analysis');

  return (
    <Animated.View
      entering={FadeIn.duration(180)}
      exiting={FadeOut.duration(160)}
      style={[styles.backdrop, isAnalyzing && styles.backdropAnalyzing]}>
      <View style={[styles.chrome, { paddingTop: topInset + 12 }]}>
        <View style={styles.appHeader}>
          <View style={styles.brandLockup}>
            <View style={styles.brandReticle}>
              <View style={styles.brandReticleDot} />
            </View>
            <Text style={styles.brandText}>KEEPFLIP / ANALYSIS</Text>
          </View>
          {isAnalyzing ? (
            <View accessibilityLiveRegion="polite" style={styles.analysisLiveBadge}>
              <View style={styles.analysisLiveDot} />
              <Text style={styles.analysisLiveText}>SECURE JOB RUNNING</Text>
            </View>
          ) : (
            <Pressable
              accessibilityLabel="Close item analysis"
              accessibilityRole="button"
              onPress={onDone}
              style={({ pressed }) => [
                styles.headerDoneButton,
                pressed && styles.buttonPressed,
              ]}>
              <Text style={styles.headerDoneText}>{doneLabel}</Text>
            </Pressable>
          )}
        </View>

        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: bottomInset + 28 }]}
          contentInsetAdjustmentBehavior="automatic"
          showsVerticalScrollIndicator={false}
          style={styles.scrollView}>
          <Animated.View
            entering={FadeInUp.duration(240)}
            exiting={FadeOut.duration(130)}
            key={state.status}
            layout={LinearTransition.duration(180)}
            style={styles.stateContent}>
            {state.status === 'setup' ? <SetupState state={state} /> : null}
            {state.status === 'analyzing' ? <AnalyzingState state={state} /> : null}
            {state.status === 'error' ? <ErrorState state={state} /> : null}
            {state.status === 'insufficient-evidence' ? (
              <InsufficientEvidenceState state={state} />
            ) : null}
            {state.status === 'result' ? <ResultState result={state.data} /> : null}

            {!isAnalyzing ? (
              <View style={styles.actions}>
                {!isResult ? (
                  <ActionButton accent={accent} label={resolvedRetryLabel} onPress={onRetry} />
                ) : null}
                <ActionButton
                  accent={isResult ? theme.colors.goldBright : accent}
                  label={doneLabel}
                  onPress={onDone}
                  secondary={!isResult}
                />
              </View>
            ) : null}
          </Animated.View>
        </ScrollView>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFill,
    zIndex: 44,
    backgroundColor: 'rgba(2, 2, 4, 0.985)',
    experimental_backgroundImage: `
      radial-gradient(circle at 90% 5%, rgba(88, 223, 232, 0.11) 0%, transparent 34%),
      radial-gradient(circle at 4% 52%, rgba(141, 114, 255, 0.10) 0%, transparent 38%),
      radial-gradient(circle at 70% 100%, rgba(215, 168, 74, 0.09) 0%, transparent 42%),
      linear-gradient(165deg, rgba(9, 8, 12, 0.99) 0%, rgba(2, 2, 4, 0.99) 72%)
    `,
  },
  backdropAnalyzing: {
    backgroundColor: 'rgba(2, 2, 4, 0.28)',
    experimental_backgroundImage: `
      radial-gradient(circle at 90% 5%, rgba(88, 223, 232, 0.10) 0%, transparent 34%),
      radial-gradient(circle at 4% 52%, rgba(141, 114, 255, 0.08) 0%, transparent 38%),
      radial-gradient(circle at 70% 100%, rgba(215, 168, 74, 0.075) 0%, transparent 42%),
      linear-gradient(165deg, rgba(9, 8, 12, 0.46) 0%, rgba(2, 2, 4, 0.36) 72%)
    `,
  },
  chrome: { flex: 1, paddingHorizontal: 20 },
  appHeader: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(242, 211, 138, 0.16)',
  },
  brandLockup: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandReticle: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    borderColor: theme.colors.goldMuted,
  },
  brandReticleDot: {
    width: 5,
    height: 5,
    borderRadius: theme.radii.pill,
    backgroundColor: theme.colors.goldBright,
    boxShadow: '0 0 9px rgba(242, 211, 138, 0.82)',
  },
  brandText: {
    color: theme.colors.goldBright,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.7,
  },
  headerDoneButton: {
    minWidth: 66,
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 15,
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    borderColor: 'rgba(242, 211, 138, 0.36)',
    backgroundColor: 'rgba(215, 168, 74, 0.08)',
  },
  headerDoneText: { color: theme.colors.goldBright, fontSize: 13, fontWeight: '900' },
  analysisLiveBadge: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 11,
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    borderColor: 'rgba(88, 223, 232, 0.32)',
    backgroundColor: 'rgba(88, 223, 232, 0.07)',
  },
  analysisLiveDot: {
    width: 6,
    height: 6,
    borderRadius: theme.radii.pill,
    backgroundColor: theme.colors.scannerCyan,
    boxShadow: '0 0 9px rgba(88, 223, 232, 0.92)',
  },
  analysisLiveText: {
    color: theme.colors.scannerCyan,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  buttonPressed: { opacity: 0.72, transform: [{ scale: 0.96 }] },
  scrollView: { flex: 1, width: '100%' },
  content: { width: '100%', alignItems: 'center', paddingTop: 24 },
  stateContent: { width: '100%', maxWidth: 760, gap: 18 },
  stateHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 13 },
  stateMarker: { width: 4, height: 52, borderRadius: theme.radii.pill },
  stateHeaderCopy: { flex: 1, gap: 5 },
  eyebrow: { fontSize: 10, fontWeight: '900', letterSpacing: 1.8 },
  title: { color: theme.colors.cream, fontSize: 29, fontWeight: '800', lineHeight: 34 },
  leadText: { color: theme.colors.textMuted, fontSize: 15, lineHeight: 23 },
  supportingText: { color: theme.colors.textMuted, fontSize: 14, lineHeight: 21 },
  listCard: {
    gap: 14,
    padding: 17,
    borderRadius: theme.radii.medium,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: 'rgba(141, 114, 255, 0.27)',
    backgroundColor: 'rgba(16, 13, 22, 0.88)',
  },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  listBullet: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radii.pill,
    borderWidth: 1,
  },
  listBulletText: { fontSize: 11, fontWeight: '900', fontVariant: ['tabular-nums'] },
  listText: { flex: 1, color: theme.colors.text, fontSize: 14, lineHeight: 20 },
  analysisVisual: { alignItems: 'center', gap: 23, paddingVertical: 12 },
  orbShell: { width: 148, height: 148, alignItems: 'center', justifyContent: 'center' },
  outerRing: {
    position: 'absolute',
    width: 142,
    height: 142,
    borderRadius: theme.radii.pill,
    borderWidth: 2,
    borderColor: 'rgba(88, 223, 232, 0.12)',
    borderTopColor: theme.colors.scannerCyan,
    borderRightColor: theme.colors.scannerViolet,
    boxShadow: '0 0 26px rgba(88, 223, 232, 0.14)',
  },
  innerRing: {
    position: 'absolute',
    width: 105,
    height: 105,
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    borderColor: 'rgba(141, 114, 255, 0.15)',
    borderBottomColor: theme.colors.scannerViolet,
    borderLeftColor: theme.colors.goldBright,
  },
  orbCore: {
    width: 68,
    height: 68,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    borderColor: 'rgba(88, 223, 232, 0.52)',
    backgroundColor: 'rgba(9, 18, 22, 0.96)',
    boxShadow: '0 0 30px rgba(88, 223, 232, 0.30)',
  },
  orbText: { color: theme.colors.scannerCyan, fontSize: 17, fontWeight: '900', fontVariant: ['tabular-nums'] },
  progressTrack: {
    width: '88%',
    height: 4,
    overflow: 'hidden',
    borderRadius: theme.radii.pill,
    backgroundColor: 'rgba(88, 223, 232, 0.10)',
  },
  progressFill: {
    width: '100%',
    height: '100%',
    borderRadius: theme.radii.pill,
    backgroundColor: theme.colors.scannerCyan,
    boxShadow: '0 0 12px rgba(88, 223, 232, 0.72)',
    transformOrigin: 'left',
  },
  stepList: { gap: 9 },
  stepRow: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: theme.radii.small,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: 'rgba(138, 100, 43, 0.15)',
    backgroundColor: 'rgba(8, 8, 11, 0.72)',
  },
  stepRowActive: {
    borderColor: 'rgba(88, 223, 232, 0.35)',
    backgroundColor: 'rgba(88, 223, 232, 0.06)',
  },
  stepDot: {
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radii.pill,
    borderWidth: 1,
  },
  stepDotCore: { width: 8, height: 8, borderRadius: theme.radii.pill },
  stepText: { flex: 1, fontSize: 13, lineHeight: 18 },
  stepStatus: { fontSize: 9, fontWeight: '900', letterSpacing: 1.1 },
  errorCard: {
    gap: 12,
    padding: 18,
    borderRadius: theme.radii.medium,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: 'rgba(232, 97, 88, 0.38)',
    backgroundColor: 'rgba(65, 18, 19, 0.28)',
  },
  errorMessage: { color: theme.colors.cream, fontSize: 16, lineHeight: 24 },
  errorCode: { color: theme.colors.danger, fontSize: 11, fontWeight: '800', letterSpacing: 0.7 },
  section: { gap: 10 },
  sectionTitle: { color: theme.colors.goldMuted, fontSize: 10, fontWeight: '900', letterSpacing: 1.65 },
  verifiedCard: {
    gap: 11,
    padding: 16,
    borderRadius: theme.radii.medium,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: 'rgba(224, 172, 75, 0.25)',
    backgroundColor: 'rgba(224, 172, 75, 0.05)',
  },
  verifiedRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  verifiedDot: { width: 6, height: 6, marginTop: 7, borderRadius: theme.radii.pill, backgroundColor: theme.colors.scannerAmber },
  verifiedText: { flex: 1, color: theme.colors.text, fontSize: 14, lineHeight: 20 },
  suggestionList: { gap: 10 },
  suggestionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    padding: 14,
    borderRadius: theme.radii.medium,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: 'rgba(88, 223, 232, 0.18)',
    backgroundColor: 'rgba(11, 10, 14, 0.92)',
  },
  suggestionIcon: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radii.small,
    borderWidth: 1,
  },
  suggestionFocus: { width: 8, height: 8, borderRadius: theme.radii.pill, boxShadow: '0 0 9px rgba(88, 223, 232, 0.65)' },
  suggestionCopy: { flex: 1, gap: 4 },
  suggestionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  suggestionTitle: { flex: 1, color: theme.colors.cream, fontSize: 14, fontWeight: '800' },
  priorityTag: { fontSize: 8, fontWeight: '900', letterSpacing: 0.8 },
  suggestionDescription: { color: theme.colors.textMuted, fontSize: 12, lineHeight: 18 },
  identityCard: {
    gap: 17,
    padding: 18,
    borderRadius: theme.radii.medium,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: 'rgba(242, 211, 138, 0.30)',
    backgroundColor: 'rgba(18, 15, 10, 0.68)',
    boxShadow: '0 10px 30px rgba(0, 0, 0, 0.28)',
  },
  identityTitle: { color: theme.colors.cream, fontSize: 22, fontWeight: '800', lineHeight: 28 },
  identityGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  identityField: {
    minWidth: '46%',
    flexGrow: 1,
    gap: 3,
    padding: 11,
    borderRadius: theme.radii.small,
    backgroundColor: 'rgba(3, 3, 5, 0.52)',
  },
  identityFieldLabel: { color: theme.colors.goldMuted, fontSize: 8, fontWeight: '900', letterSpacing: 1.1 },
  identityFieldValue: { color: theme.colors.text, fontSize: 13, fontWeight: '700' },
  conditionCard: {
    gap: 13,
    padding: 17,
    borderRadius: theme.radii.medium,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: 'rgba(141, 114, 255, 0.27)',
    backgroundColor: 'rgba(141, 114, 255, 0.06)',
  },
  conditionTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  conditionGrade: { flex: 1, color: theme.colors.scannerViolet, fontSize: 20, fontWeight: '900' },
  conditionScore: { color: theme.colors.scannerViolet, fontSize: 16, fontWeight: '900', fontVariant: ['tabular-nums'] },
  conditionSummary: { color: theme.colors.text, fontSize: 14, lineHeight: 21 },
  detailList: { gap: 8 },
  detailRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 9 },
  detailBullet: { width: 5, height: 5, marginTop: 7, borderRadius: theme.radii.pill, backgroundColor: theme.colors.scannerViolet },
  detailText: { flex: 1, color: theme.colors.textMuted, fontSize: 13, lineHeight: 19 },
  evidenceCard: {
    overflow: 'hidden',
    borderRadius: theme.radii.medium,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: 'rgba(88, 223, 232, 0.20)',
    backgroundColor: 'rgba(8, 8, 11, 0.74)',
  },
  evidenceRow: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    padding: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(88, 223, 232, 0.12)',
  },
  evidenceIndex: {
    width: 29,
    height: 29,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    borderColor: 'rgba(88, 223, 232, 0.36)',
  },
  evidenceIndexText: { color: theme.colors.scannerCyan, fontSize: 9, fontWeight: '900', fontVariant: ['tabular-nums'] },
  evidenceCopy: { flex: 1, gap: 4 },
  evidenceLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  evidenceLabel: { flexShrink: 1, color: theme.colors.cream, fontSize: 13, fontWeight: '800' },
  sourceTag: { color: theme.colors.scannerCyan, fontSize: 7, fontWeight: '900', letterSpacing: 0.7 },
  evidenceValue: { color: theme.colors.textMuted, fontSize: 12, lineHeight: 17 },
  evidenceConfidence: { color: theme.colors.scannerCyan, fontSize: 11, fontWeight: '900', fontVariant: ['tabular-nums'] },
  confidenceCard: {
    gap: 15,
    padding: 17,
    borderRadius: theme.radii.medium,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: 'rgba(242, 211, 138, 0.18)',
    backgroundColor: 'rgba(11, 10, 14, 0.82)',
  },
  confidenceRow: { gap: 7 },
  confidenceLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  confidenceLabel: { color: theme.colors.textMuted, fontSize: 12, fontWeight: '700' },
  confidenceValue: { fontSize: 12, fontWeight: '900', fontVariant: ['tabular-nums'] },
  meterTrack: { height: 5, overflow: 'hidden', borderRadius: theme.radii.pill, backgroundColor: 'rgba(255, 255, 255, 0.07)' },
  meterFill: { height: '100%', borderRadius: theme.radii.pill },
  readinessCard: {
    gap: 10,
    padding: 17,
    borderRadius: theme.radii.medium,
    borderCurve: 'continuous',
    borderWidth: 1,
    backgroundColor: 'rgba(8, 8, 11, 0.80)',
  },
  readinessTopRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  readinessSignal: { width: 9, height: 9, borderRadius: theme.radii.pill },
  readinessLabel: { flex: 1, fontSize: 15, fontWeight: '900' },
  readinessScore: { fontSize: 14, fontWeight: '900', fontVariant: ['tabular-nums'] },
  readinessReason: { color: theme.colors.textMuted, fontSize: 13, lineHeight: 19 },
  valuationCard: {
    overflow: 'hidden',
    borderRadius: theme.radii.medium,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: 'rgba(215, 168, 74, 0.38)',
    backgroundColor: 'rgba(22, 16, 8, 0.78)',
    boxShadow: '0 0 26px rgba(215, 168, 74, 0.10)',
  },
  valuationValues: { minHeight: 112, flexDirection: 'row', alignItems: 'stretch' },
  valuationColumn: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 6, paddingVertical: 17 },
  valuationColumnFeatured: {
    backgroundColor: 'rgba(215, 168, 74, 0.10)',
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(242, 211, 138, 0.22)',
  },
  valuationLabel: { color: theme.colors.goldMuted, fontSize: 8, fontWeight: '900', letterSpacing: 1.0 },
  valuationLabelFeatured: { color: theme.colors.goldBright },
  valuationValue: { maxWidth: '100%', color: theme.colors.textMuted, fontSize: 17, fontWeight: '800', fontVariant: ['tabular-nums'] },
  valuationValueFeatured: { color: theme.colors.goldBright, fontSize: 22, boxShadow: '0 0 12px rgba(242, 211, 138, 0.18)' },
  valuationBasisRow: { gap: 5, padding: 14, borderTopWidth: 1, borderTopColor: 'rgba(215, 168, 74, 0.18)' },
  valuationBasisStrong: { color: theme.colors.cream, fontSize: 12, fontWeight: '800' },
  valuationBasis: { color: theme.colors.textMuted, fontSize: 11, lineHeight: 16 },
  actions: { gap: 10, paddingTop: 7 },
  actionButton: {
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    boxShadow: '0 8px 22px rgba(0, 0, 0, 0.30)',
  },
  actionButtonSecondary: { backgroundColor: 'rgba(7, 7, 10, 0.72)' },
  actionButtonText: { color: theme.colors.backgroundDeep, fontSize: 14, fontWeight: '900', letterSpacing: 0.3 },
});
