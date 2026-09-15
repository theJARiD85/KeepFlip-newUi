import { Image } from 'expo-image';
import { usePathname } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useKeepFlipAuth } from '@/components/auth/keepflip-auth-context';
import {
  KeepFlipText as Text,
} from '@/components/ui/keepflip-text';
import { keepFlipTheme as theme } from '@/constants/keepflip-theme';
import { useResponsiveLayout } from '@/hooks/use-responsive-layout';
import {
  getKeepFlipDailyBriefingCache,
  hasCompletedKeepFlipDailyBriefing,
  keepFlipLocalDateKey,
  markKeepFlipDailyBriefingCompleted,
  cacheKeepFlipDailyBriefing,
  type KeepFlipDailyBriefingCache,
} from '@/services/keepflip-daily-briefing-state-service';
import {
  listAssistantTasks,
  runKeepFlipAssistant,
  type AssistantAdvisory,
  type AssistantProfileContext,
  type AssistantTask,
  type AssistantWorkspaceContext,
} from '@/services/keepflip-assistant-service';
import {
  hasCompletedScanInventoryWalkthrough,
  getResellerBuyRules,
} from '@/services/user-profile-onboarding-service';
import { hasCompletedKeepFlipLaunchExperience } from '@/services/keepflip-launch-state-service';

const FLIP_MASCOT_IMAGE = require('@/assets/images/flip-mascot.png');

const DAILY_BRIEFING_PROMPT = [
  "Give me today's KeepFlip business briefing.",
  'Start with a warm greeting using my display name.',
  'Review the fresh server workspace snapshot and give me a concise strategic read:',
  'what matters now, the top one to three things I need to take care of today, and one recommended next move.',
  'Use real inventory, Books, seller operations, open tasks, and saved buy rules when available.',
  'Keep realized money separate from estimated resale value.',
  'Call out missing, unavailable, stale, or truncated data instead of filling gaps.',
  'Do not create a task or navigate anywhere; this is a briefing only.',
  'Return a structured advisory for this briefing.',
].join(' ');

type BriefingResult = KeepFlipDailyBriefingCache;

function profileContextFromRules(
  rules: Awaited<ReturnType<typeof getResellerBuyRules>>,
): AssistantProfileContext | null {
  if (!rules) return null;
  return {
    inventoryFocus: rules.inventoryFocus,
    saleSpeed: rules.saleSpeed,
    minimumRoiPercent: rules.minimumRoiPercent,
    minimumNetProfitCents: rules.minimumNetProfitCents,
    maximumItemCostCents: rules.maximumItemCostCents,
    maximumTypicalDays: rules.maximumTypicalDays,
  };
}

function firstName(value: string | null | undefined) {
  const name = value?.trim();
  return name ? name.split(/\s+/)[0] : null;
}

function greetingFor(value: string | null | undefined) {
  const hour = new Date().getHours();
  const timeGreeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const name = firstName(value);
  return name ? `${timeGreeting}, ${name}.` : `${timeGreeting}.`;
}

function taskDueLabel(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
  });
}

function localFallbackBriefing(
  displayName: string | null | undefined,
  tasks: AssistantTask[],
): BriefingResult {
  const openTasks = tasks.filter((task) => task.status === 'open');
  const firstTask = openTasks[0] ?? null;
  const taskCount = openTasks.length;
  const name = firstName(displayName);
  const greeting = greetingFor(displayName);
  const nextAction = firstTask
    ? `Start with “${firstTask.title}”${firstTask.dueAt ? ` (due ${taskDueLabel(firstTask.dueAt) ?? 'soon'})` : ''}.`
    : 'Open Flip after this briefing and tell me what you are sourcing, listing, or trying to improve.';

  return {
    dateKey: keepFlipLocalDateKey(),
    reply: taskCount
      ? `${greeting} You have ${taskCount} open item${taskCount === 1 ? '' : 's'} in your Flip queue. I could not load the live business snapshot, so start with the highest-priority work already waiting for you.`
      : `${greeting} Your saved Flip queue is clear. I could not load the live business snapshot yet, so use this as a quick starting point and check your inventory before sourcing more.` ,
    reaction: 'greeting',
    advisory: {
      mode: 'general',
      recommendation: firstTask
        ? 'Convert the oldest or highest-priority open task into the next completed business step before adding more work.'
        : 'Use the next work block to inspect current inventory and choose one measurable listing or sourcing experiment.',
      evidence: openTasks.slice(0, 3).map((task) => ({
        label: task.taskType === 'reminder' ? 'Reminder' : 'Open task',
        source: 'Saved Flip queue',
        value: task.title,
      })),
      assumptions: [
        name ? `The briefing is for ${name}.` : 'No display name is available yet.',
        'This fallback only has access to locally loaded assistant tasks.',
      ],
      unknowns: [
        'Live inventory, Books, seller-operations, and market signals were unavailable for this briefing.',
      ],
      nextAction,
      confidence: 'low',
    },
    source: 'local',
  };
}

function BriefingAdvisory({
  advisory,
  responsiveFont,
}: {
  advisory: AssistantAdvisory;
  responsiveFont: (size: number) => number;
}) {
  return (
    <View style={styles.advisoryCard}>
      <View style={styles.advisoryHeader}>
        <Text style={[styles.sectionEyebrow, { fontSize: responsiveFont(8) }]}>
          {advisory.mode.replace(/_/g, ' ').toUpperCase()} READ
        </Text>
        <Text style={[styles.confidence, { fontSize: responsiveFont(8) }]}>
          {advisory.confidence.toUpperCase()} CONFIDENCE
        </Text>
      </View>

      <Text style={[styles.recommendation, { fontSize: responsiveFont(13), lineHeight: 19 }]}>
        {advisory.recommendation}
      </Text>

      {advisory.evidence.length ? (
        <View style={styles.evidenceList}>
          {advisory.evidence.slice(0, 4).map((evidence, index) => (
            <View key={`${evidence.label}-${evidence.value}-${index}`} style={styles.evidenceRow}>
              <Text style={[styles.evidenceLabel, { fontSize: responsiveFont(8) }]}>
                {evidence.label}
              </Text>
              <Text selectable style={[styles.evidenceValue, { fontSize: responsiveFont(9), lineHeight: 14 }]}>
                {evidence.value}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.nextMove}>
        <Text style={[styles.nextMoveLabel, { fontSize: responsiveFont(8) }]}>NEXT MOVE</Text>
        <Text style={[styles.nextMoveText, { fontSize: responsiveFont(11), lineHeight: 16 }]}>
          {advisory.nextAction}
        </Text>
      </View>

      {advisory.unknowns.length ? (
        <Text style={[styles.unknowns, { fontSize: responsiveFont(9), lineHeight: 14 }]}>
          {`Watch-outs: ${advisory.unknowns.slice(0, 2).join(' · ')}`}
        </Text>
      ) : null}
    </View>
  );
}

function OpenWork({
  tasks,
  responsiveFont,
}: {
  tasks: AssistantTask[];
  responsiveFont: (size: number) => number;
}) {
  const openTasks = tasks.filter((task) => task.status === 'open').slice(0, 4);
  if (!openTasks.length) return null;

  return (
    <View style={styles.openWorkCard}>
      <Text style={[styles.sectionEyebrow, { fontSize: responsiveFont(8) }]}>OPEN WORK</Text>
      {openTasks.map((task) => (
        <View key={task.id} style={styles.openWorkRow}>
          <View style={styles.openWorkDot} />
          <View style={styles.openWorkCopy}>
            <Text style={[styles.openWorkTitle, { fontSize: responsiveFont(10), lineHeight: 14 }]}>
              {task.title}
            </Text>
            {task.dueAt ? (
              <Text style={[styles.openWorkDue, { fontSize: responsiveFont(8) }]}>
                Due {taskDueLabel(task.dueAt) ?? 'soon'}
              </Text>
            ) : null}
          </View>
        </View>
      ))}
    </View>
  );
}

export function FlipDailyBriefingLauncher() {
  const { user } = useKeepFlipAuth();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { height, responsiveFont, width } = useResponsiveLayout();
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [briefing, setBriefing] = useState<BriefingResult | null>(null);
  const [tasks, setTasks] = useState<AssistantTask[]>([]);
  const [probe, setProbe] = useState(0);
  const attemptedDateRef = useRef<string | null>(null);
  const inFlightDateRef = useRef<string | null>(null);
  const briefingDateRef = useRef<string | null>(null);
  const userId = user?.$id ?? null;
  const displayName = user?.name?.trim() || null;
  const isHome = pathname === '/' || pathname === '/command-center';

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') setProbe((current) => current + 1);
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (userId) return;
    attemptedDateRef.current = null;
    inFlightDateRef.current = null;
    briefingDateRef.current = null;

    const resetTimer = setTimeout(() => {
      setVisible(false);
      setBriefing(null);
      setTasks([]);
    }, 0);
    return () => clearTimeout(resetTimer);
  }, [userId]);

  useEffect(() => {
    if (!userId || !isHome) return;

    const dateKey = keepFlipLocalDateKey();
    if (
      attemptedDateRef.current === dateKey ||
      inFlightDateRef.current === dateKey
    ) {
      return;
    }

    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    inFlightDateRef.current = dateKey;

    const load = async () => {
      const launchCompleted = await hasCompletedKeepFlipLaunchExperience();
      if (!launchCompleted) {
        retryTimer = setTimeout(() => {
          if (!cancelled) setProbe((current) => current + 1);
        }, 1_000);
        return;
      }

      const onboardingCompleted = await hasCompletedScanInventoryWalkthrough(
        userId,
        displayName,
      );
      if (!onboardingCompleted || cancelled) return;

      if (await hasCompletedKeepFlipDailyBriefing(userId, dateKey)) {
        attemptedDateRef.current = dateKey;
        return;
      }

      attemptedDateRef.current = dateKey;
      briefingDateRef.current = dateKey;
      setBriefing(null);
      setTasks([]);
      setLoading(true);
      setVisible(true);

      const [taskResult, rulesResult, cachedResult] = await Promise.allSettled([
        listAssistantTasks(userId),
        getResellerBuyRules(userId, displayName),
        getKeepFlipDailyBriefingCache(userId, dateKey),
      ]);
      if (cancelled) return;

      const loadedTasks = taskResult.status === 'fulfilled'
        ? taskResult.value
        : [];
      setTasks(loadedTasks);

      const cached = cachedResult.status === 'fulfilled'
        ? cachedResult.value
        : null;
      if (cached) {
        setBriefing(cached);
        setLoading(false);
        return;
      }

      const fallback = localFallbackBriefing(displayName, loadedTasks);
      const rules = rulesResult.status === 'fulfilled'
        ? rulesResult.value
        : null;
      const context: AssistantWorkspaceContext = {
        currentRoute: '/command-center',
        displayName,
        openTasks: loadedTasks
          .filter((task) => task.status === 'open')
          .slice(0, 12)
          .map(({ title, taskType, dueAt }) => ({ title, taskType, dueAt })),
        profile: profileContextFromRules(rules),
      };

      let nextBriefing = fallback;
      try {
        const response = await runKeepFlipAssistant({
          ownerId: userId,
          message: DAILY_BRIEFING_PROMPT,
          history: [],
          context,
        });
        nextBriefing = {
          advisory: response.advisory ?? null,
          dateKey,
          reaction: response.reaction,
          reply: response.reply,
          source: response.source,
        };
      } catch {
        // The local queue-based briefing remains useful if the assistant
        // Function or a live workspace source is temporarily unavailable.
      }

      if (cancelled) return;
      setBriefing(nextBriefing);
      setLoading(false);
      void cacheKeepFlipDailyBriefing(userId, nextBriefing);
    };

    void load()
      .catch(() => {
        if (cancelled) return;
        setBriefing(localFallbackBriefing(displayName, []));
        setLoading(false);
      })
      .finally(() => {
        if (inFlightDateRef.current === dateKey) {
          inFlightDateRef.current = null;
        }
      });

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      if (inFlightDateRef.current === dateKey) {
        inFlightDateRef.current = null;
      }
    };
  }, [displayName, isHome, probe, userId]);

  const closeBriefing = () => {
    const dateKey = briefingDateRef.current;
    if (!userId || !dateKey) return;

    // Mark completion only from this explicit close/back action. Modal
    // unmounts, process death, and failed data loads never reach this path.
    setVisible(false);
    void markKeepFlipDailyBriefingCompleted(userId, dateKey);
  };

  if (!userId) return null;

  const modalWidth = Math.min(width - 24, 430);
  const modalMaxHeight = Math.max(
    280,
    height - insets.top - insets.bottom - 28,
  );

  return (
    <Modal
      accessibilityViewIsModal
      animationType="fade"
      onRequestClose={closeBriefing}
      presentationStyle="overFullScreen"
      statusBarTranslucent={Platform.OS === 'android'}
      transparent
      visible={visible}
    >
      <View style={styles.backdrop}>
        <View style={[styles.modalCard, { maxHeight: modalMaxHeight, width: modalWidth }]}>
          <View style={styles.modalHeader}>
            <View style={styles.identityBlock}>
              <Image
                accessibilityLabel="Flip"
                contentFit="contain"
                source={FLIP_MASCOT_IMAGE}
                style={styles.mascot}
              />
              <View style={styles.headerCopy}>
                <Text style={[styles.eyebrow, { fontSize: responsiveFont(8) }]}>FLIP / DAILY BRIEFING</Text>
                <Text style={[styles.greeting, { fontSize: responsiveFont(21), lineHeight: 26 }]}>
                  {greetingFor(displayName)}
                </Text>
              </View>
            </View>
            <Pressable
              accessibilityLabel="Close daily briefing"
              accessibilityRole="button"
              hitSlop={10}
              onPress={closeBriefing}
              style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
            >
              <Text style={[styles.closeText, { fontSize: responsiveFont(18) }]}>×</Text>
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={styles.scrollContent}
            contentInsetAdjustmentBehavior="automatic"
            showsVerticalScrollIndicator={false}
          >
            {loading ? (
              <View style={styles.loadingState}>
                <ActivityIndicator color={theme.colors.scannerCyan} />
                <Text style={[styles.loadingTitle, { fontSize: responsiveFont(13) }]}>
                  Flip is checking your workspace...
                </Text>
                <Text style={[styles.loadingText, { fontSize: responsiveFont(10), lineHeight: 15 }]}>
                  Inventory, Books, open work, and seller operations are being read for today’s briefing.
                </Text>
              </View>
            ) : briefing ? (
              <>
                <View style={styles.readCard}>
                  <View style={styles.readHeader}>
                    <Text style={[styles.sectionEyebrow, { fontSize: responsiveFont(8) }]}>FLIP’S READ</Text>
                    <Text style={[styles.sourceLabel, { fontSize: responsiveFont(8) }]}>
                      {briefing.source === 'cloud' ? 'LIVE WORKSPACE' : 'LIMITED LOCAL READ'}
                    </Text>
                  </View>
                  <Text selectable style={[styles.reply, { fontSize: responsiveFont(12), lineHeight: 18 }]}>
                    {briefing.reply}
                  </Text>
                </View>

                {briefing.advisory ? (
                  <BriefingAdvisory
                    advisory={briefing.advisory}
                    responsiveFont={responsiveFont}
                  />
                ) : null}

                <OpenWork tasks={tasks} responsiveFont={responsiveFont} />
              </>
            ) : (
              <View style={styles.loadingState}>
                <Text style={[styles.loadingTitle, { fontSize: responsiveFont(13) }]}>Flip is ready when you are.</Text>
              </View>
            )}
          </ScrollView>

          <View style={styles.footer}>
            <Text style={[styles.footerHint, { fontSize: responsiveFont(9), lineHeight: 13 }]}>
              This briefing appears once per day. Close it when you’re ready to move.
            </Text>
            <Pressable
              accessibilityLabel="Close and complete today's Flip briefing"
              accessibilityRole="button"
              onPress={closeBriefing}
              style={({ pressed }) => [styles.closeAction, pressed && styles.pressed]}
            >
              <Text style={[styles.closeActionText, { fontSize: responsiveFont(11) }]}>Close briefing</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.78)',
    flex: 1,
    justifyContent: 'center',
    padding: 14,
  },
  modalCard: {
    backgroundColor: '#0B0A10',
    borderColor: 'rgba(242, 211, 138, 0.28)',
    borderCurve: 'continuous',
    borderRadius: 26,
    borderWidth: 1,
    boxShadow: '0 18px 52px rgba(0, 0, 0, 0.56), 0 0 24px rgba(0, 255, 255, 0.08)',
    flexShrink: 1,
    overflow: 'hidden',
  },
  modalHeader: {
    alignItems: 'center',
    borderBottomColor: 'rgba(242, 211, 138, 0.14)',
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 18,
  },
  identityBlock: {
    alignItems: 'center',
    flexDirection: 'row',
    flex: 1,
    gap: 12,
  },
  mascot: {
    height: 58,
    width: 58,
  },
  headerCopy: {
    flex: 1,
    gap: 4,
  },
  eyebrow: {
    color: theme.colors.scannerCyan,
    fontFamily: theme.fonts.semibold,
    letterSpacing: 1.2,
  },
  greeting: {
    color: theme.colors.text,
    fontFamily: theme.fonts.bold,
  },
  closeButton: {
    alignItems: 'center',
    borderColor: 'rgba(247, 242, 232, 0.18)',
    borderRadius: 999,
    borderWidth: 1,
    height: 32,
    justifyContent: 'center',
    marginLeft: 10,
    width: 32,
  },
  closeText: {
    color: theme.colors.textMuted,
    lineHeight: 20,
  },
  scrollContent: {
    gap: 12,
    padding: 18,
  },
  readCard: {
    backgroundColor: 'rgba(0, 255, 255, 0.055)',
    borderColor: 'rgba(0, 255, 255, 0.2)',
    borderCurve: 'continuous',
    borderRadius: 18,
    borderWidth: 1,
    gap: 10,
    padding: 15,
  },
  readHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  sectionEyebrow: {
    color: theme.colors.goldBright,
    fontFamily: theme.fonts.semibold,
    letterSpacing: 1.1,
  },
  sourceLabel: {
    color: theme.colors.scannerCyan,
    fontFamily: theme.fonts.semibold,
    letterSpacing: 0.7,
  },
  reply: {
    color: theme.colors.text,
    fontFamily: theme.fonts.body,
  },
  advisoryCard: {
    backgroundColor: 'rgba(141, 114, 255, 0.08)',
    borderColor: 'rgba(141, 114, 255, 0.25)',
    borderCurve: 'continuous',
    borderRadius: 18,
    borderWidth: 1,
    gap: 12,
    padding: 15,
  },
  advisoryHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  confidence: {
    color: theme.colors.textMuted,
    fontFamily: theme.fonts.semibold,
    letterSpacing: 0.7,
  },
  recommendation: {
    color: theme.colors.text,
    fontFamily: theme.fonts.semibold,
  },
  evidenceList: {
    borderTopColor: 'rgba(247, 242, 232, 0.12)',
    borderTopWidth: 1,
    gap: 8,
    paddingTop: 10,
  },
  evidenceRow: {
    gap: 2,
  },
  evidenceLabel: {
    color: theme.colors.textMuted,
    fontFamily: theme.fonts.semibold,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  evidenceValue: {
    color: theme.colors.text,
    fontFamily: theme.fonts.body,
  },
  nextMove: {
    backgroundColor: 'rgba(242, 211, 138, 0.09)',
    borderColor: 'rgba(242, 211, 138, 0.18)',
    borderCurve: 'continuous',
    borderRadius: 13,
    borderWidth: 1,
    gap: 4,
    padding: 11,
  },
  nextMoveLabel: {
    color: theme.colors.goldBright,
    fontFamily: theme.fonts.semibold,
    letterSpacing: 0.9,
  },
  nextMoveText: {
    color: theme.colors.text,
    fontFamily: theme.fonts.semibold,
  },
  unknowns: {
    color: theme.colors.textMuted,
    fontFamily: theme.fonts.body,
  },
  openWorkCard: {
    backgroundColor: 'rgba(247, 242, 232, 0.045)',
    borderColor: 'rgba(247, 242, 232, 0.12)',
    borderCurve: 'continuous',
    borderRadius: 18,
    borderWidth: 1,
    gap: 10,
    padding: 15,
  },
  openWorkRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 9,
  },
  openWorkDot: {
    backgroundColor: theme.colors.scannerCyan,
    borderRadius: 999,
    height: 7,
    marginTop: 4,
    width: 7,
  },
  openWorkCopy: {
    flex: 1,
    gap: 2,
  },
  openWorkTitle: {
    color: theme.colors.text,
    fontFamily: theme.fonts.medium,
  },
  openWorkDue: {
    color: theme.colors.goldBright,
    fontFamily: theme.fonts.medium,
  },
  loadingState: {
    alignItems: 'center',
    gap: 12,
    justifyContent: 'center',
    minHeight: 220,
    padding: 22,
  },
  loadingTitle: {
    color: theme.colors.text,
    fontFamily: theme.fonts.semibold,
    textAlign: 'center',
  },
  loadingText: {
    color: theme.colors.textMuted,
    fontFamily: theme.fonts.body,
    maxWidth: 290,
    textAlign: 'center',
  },
  footer: {
    borderTopColor: 'rgba(242, 211, 138, 0.14)',
    borderTopWidth: 1,
    gap: 10,
    padding: 18,
  },
  footerHint: {
    color: theme.colors.textMuted,
    fontFamily: theme.fonts.body,
    textAlign: 'center',
  },
  closeAction: {
    alignItems: 'center',
    backgroundColor: theme.colors.gold,
    borderCurve: 'continuous',
    borderRadius: 13,
    minHeight: 46,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  closeActionText: {
    color: theme.colors.backgroundDeep,
    fontFamily: theme.fonts.bold,
    letterSpacing: 0.4,
  },
  pressed: {
    opacity: 0.78,
  },
});
