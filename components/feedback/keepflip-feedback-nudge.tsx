import * as Haptics from 'expo-haptics';
import {
  createContext,
  type PropsWithChildren,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut } from 'react-native-reanimated';

import { useKeepFlipAuth } from '@/components/auth/keepflip-auth-context';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { KeepFlipText as Text } from '@/components/ui/keepflip-text';
import { keepFlipTheme as theme } from '@/constants/keepflip-theme';
import { useResponsiveLayout } from '@/hooks/use-responsive-layout';
import { getAppwriteCoreServices } from '@/lib/appwrite';
import {
  keepFlipFeedbackEmailAddress,
  openKeepFlipFeedbackEmail,
  openKeepFlipGooglePlayReviews,
} from '@/lib/keepflip-feedback';
import { responsiveWidth } from '@/lib/responsiveFont';

import { useResponsiveStyles } from '@/hooks/use-responsive-layout';
type FeedbackPromptPreference = {
  actionCount: number;
  feedbackOpenedAt?: string;
  lastPromptedAt?: string;
  nextPromptAction: number;
  pauseUntil?: string;
  ratedAt?: string;
  version: 1;
};

type FeedbackNudgeContextValue = {
  openFeedbackEmail: () => Promise<void>;
  openStoreReview: () => Promise<void>;
  recordCompletedAction: () => void;
};

const FEEDBACK_PREFERENCE_KEY = 'keepflip.feedbackPrompt.v1';
const MIN_ACTIONS_BETWEEN_PROMPTS = 6;
const MAX_ACTIONS_BETWEEN_PROMPTS = 10;
const DISMISS_COOLDOWN_DAYS = 45;
const FEEDBACK_COOLDOWN_DAYS = 90;

const FeedbackNudgeContext = createContext<FeedbackNudgeContextValue | null>(null);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function nextPromptAction() {
  return (
    MIN_ACTIONS_BETWEEN_PROMPTS +
    Math.floor(
      Math.random() * (MAX_ACTIONS_BETWEEN_PROMPTS - MIN_ACTIONS_BETWEEN_PROMPTS + 1),
    )
  );
}

function validActionCount(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
    ? value
    : 0;
}

function validPromptTarget(value: unknown) {
  return typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= MIN_ACTIONS_BETWEEN_PROMPTS &&
    value <= MAX_ACTIONS_BETWEEN_PROMPTS
    ? value
    : nextPromptAction();
}

function validTimestamp(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  return Number.isFinite(new Date(value).getTime()) ? value : undefined;
}

function defaultFeedbackPreference(): FeedbackPromptPreference {
  return {
    actionCount: 0,
    nextPromptAction: nextPromptAction(),
    version: 1,
  };
}

function readFeedbackPreference(value: unknown): FeedbackPromptPreference {
  if (!isRecord(value)) return defaultFeedbackPreference();

  return {
    actionCount: validActionCount(value.actionCount),
    feedbackOpenedAt: validTimestamp(value.feedbackOpenedAt),
    lastPromptedAt: validTimestamp(value.lastPromptedAt),
    nextPromptAction: validPromptTarget(value.nextPromptAction),
    pauseUntil: validTimestamp(value.pauseUntil),
    ratedAt: validTimestamp(value.ratedAt),
    version: 1,
  };
}

function preferencesRecord(value: unknown) {
  return isRecord(value) ? { ...value } : {};
}

function isPaused(preference: FeedbackPromptPreference, now: number) {
  if (!preference.pauseUntil) return false;
  return new Date(preference.pauseUntil).getTime() > now;
}

function dateAfterDays(now: number, days: number) {
  return new Date(now + days * 24 * 60 * 60 * 1000).toISOString();
}

function reportNudgeError(error: unknown) {
  if (__DEV__) {
    console.warn('[KeepFlip][Feedback] Could not update feedback prompt state:', error);
  }
}

function FeedbackPrompt({
  busyAction,
  errorMessage,
  onDismiss,
  onOpenFeedback,
  onOpenReview,
  visible,
}: {
  busyAction: 'feedback' | 'review' | null;
  errorMessage: string | null;
  onDismiss: () => void;
  onOpenFeedback: () => void;
  onOpenReview: () => void;
  visible: boolean;
}) {
  const styles = useResponsiveStyles(createResponsiveStyles);
  const {
    responsiveFont
  } = useResponsiveLayout();

  return (
    <Modal
      animationType="fade"
      onRequestClose={onDismiss}
      statusBarTranslucent
      transparent
      visible={visible}>
      <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(120)} style={styles.backdrop}>
        <Animated.View
          accessibilityViewIsModal
          entering={FadeInDown.duration(220)}
          style={styles.promptSurface}>
          <View style={styles.promptSignalRow}>
            <View style={styles.promptSignal} />
            <Text style={[styles.promptEyebrow, { fontSize: responsiveFont(8) }]}>KEEPFLIP CHECK-IN</Text>
          </View>

          <View style={styles.promptHeading}>
            <View style={styles.promptIcon}>
              <IconSymbol color={theme.colors.goldBright} name="bubble.left.and.bubble.right.fill" size={20} />
            </View>
            <View style={styles.promptCopy}>
              <Text style={[styles.promptTitle, { fontSize: responsiveFont(20), lineHeight: 24 }]}>Help shape what comes next.</Text>
              <Text style={[styles.promptBody, { fontSize: responsiveFont(13), lineHeight: 19 }]}>
                A quick note about what worked—or what got in your way—helps KeepFlip get more useful for real resellers.
              </Text>
            </View>
          </View>

          {errorMessage ? (
            <Text accessibilityLiveRegion="polite" selectable style={[styles.promptError, { fontSize: responsiveFont(11), lineHeight: 16 }]}>
              {errorMessage}
            </Text>
          ) : null}

          <View style={styles.promptActions}>
            <Pressable
              accessibilityHint="Opens an email to share feedback with KeepFlip."
              accessibilityRole="button"
              disabled={busyAction !== null}
              onPress={onOpenFeedback}
              style={({ pressed }) => [
                styles.primaryAction,
                busyAction !== null && styles.actionDisabled,
                pressed && busyAction === null && styles.actionPressed,
              ]}>
              {busyAction === 'feedback' ? (
                <ActivityIndicator color={theme.colors.backgroundDeep} size="small" />
              ) : (
                <IconSymbol color={theme.colors.backgroundDeep} name="paperplane.fill" size={16} />
              )}
              <Text style={[styles.primaryActionText, { fontSize: responsiveFont(10) }]}>SHARE FEEDBACK</Text>
            </Pressable>

            <Pressable
              accessibilityHint="Opens KeepFlip's Google Play page where you can leave a review."
              accessibilityRole="button"
              disabled={busyAction !== null}
              onPress={onOpenReview}
              style={({ pressed }) => [
                styles.secondaryAction,
                busyAction !== null && styles.actionDisabled,
                pressed && busyAction === null && styles.actionPressed,
              ]}>
              {busyAction === 'review' ? (
                <ActivityIndicator color={theme.colors.goldBright} size="small" />
              ) : (
                <IconSymbol color={theme.colors.goldBright} name="star.fill" size={16} />
              )}
              <Text style={[styles.secondaryActionText, { fontSize: responsiveFont(10) }]}>RATE ON GOOGLE PLAY</Text>
            </Pressable>
          </View>

          <Pressable
            accessibilityHint="Closes this check-in. KeepFlip will not ask again for a while."
            accessibilityRole="button"
            disabled={busyAction !== null}
            onPress={onDismiss}
            style={({ pressed }) => [
              styles.dismissAction,
              pressed && busyAction === null && styles.dismissActionPressed,
            ]}>
            <Text style={[styles.dismissActionText, { fontSize: responsiveFont(9) }]}>NOT NOW</Text>
          </Pressable>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

export function KeepFlipFeedbackNudgeProvider({ children }: PropsWithChildren) {
  const { user } = useKeepFlipAuth();
  const userId = user?.$id ?? null;
  const activeUserIdRef = useRef<string | null>(userId);
  const promptTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const actionWriteInFlightRef = useRef(false);
  const [promptVisible, setPromptVisible] = useState(false);
  const [promptError, setPromptError] = useState<string | null>(null);
  const [promptAction, setPromptAction] = useState<'feedback' | 'review' | null>(null);

  const updateFeedbackPreference = useCallback(
    async (
      transform: (current: FeedbackPromptPreference, now: number) => FeedbackPromptPreference,
    ) => {
      if (!userId) return null;

      const { account } = getAppwriteCoreServices();
      const currentUser = await account.get();
      if (currentUser.$id !== userId) return null;

      const now = Date.now();
      const currentPreferences = preferencesRecord(currentUser.prefs);
      const nextPreference = transform(
        readFeedbackPreference(currentPreferences[FEEDBACK_PREFERENCE_KEY]),
        now,
      );

      await account.updatePrefs({
        prefs: {
          ...currentPreferences,
          [FEEDBACK_PREFERENCE_KEY]: nextPreference,
        },
      });

      return nextPreference;
    },
    [userId],
  );

  const schedulePrompt = useCallback(() => {
    if (!userId) return;
    if (promptTimerRef.current) clearTimeout(promptTimerRef.current);

    const scheduledUserId = userId;
    promptTimerRef.current = setTimeout(() => {
      promptTimerRef.current = null;
      if (activeUserIdRef.current !== scheduledUserId) return;
      setPromptError(null);
      setPromptVisible(true);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => undefined,
      );
    }, 700);
  }, [userId]);

  const recordCompletedAction = useCallback(() => {
    if (!userId || actionWriteInFlightRef.current) return;

    actionWriteInFlightRef.current = true;
    let shouldSchedulePrompt = false;
    void updateFeedbackPreference((current, now) => {
      if (current.ratedAt || isPaused(current, now)) return current;

      const actionCount = current.actionCount + 1;
      if (actionCount < current.nextPromptAction) {
        return { ...current, actionCount };
      }

      shouldSchedulePrompt = true;
      return {
        ...current,
        actionCount: 0,
        lastPromptedAt: new Date(now).toISOString(),
        nextPromptAction: nextPromptAction(),
        pauseUntil: dateAfterDays(now, DISMISS_COOLDOWN_DAYS),
      };
    })
      .then((nextPreference) => {
        if (shouldSchedulePrompt && nextPreference) {
          schedulePrompt();
        }
      })
      .catch(reportNudgeError)
      .finally(() => {
        actionWriteInFlightRef.current = false;
      });
  }, [schedulePrompt, updateFeedbackPreference, userId]);

  const noteFeedbackResponse = useCallback(
    (response: 'feedback' | 'review') => {
      void updateFeedbackPreference((current, now) => {
        const timestamp = new Date(now).toISOString();
        if (response === 'review') {
          return {
            ...current,
            actionCount: 0,
            nextPromptAction: nextPromptAction(),
            pauseUntil: dateAfterDays(now, FEEDBACK_COOLDOWN_DAYS),
            ratedAt: timestamp,
          };
        }

        return {
          ...current,
          actionCount: 0,
          feedbackOpenedAt: timestamp,
          nextPromptAction: nextPromptAction(),
          pauseUntil: dateAfterDays(now, FEEDBACK_COOLDOWN_DAYS),
        };
      }).catch(reportNudgeError);
    },
    [updateFeedbackPreference],
  );

  const openFeedbackEmail = useCallback(async () => {
    await openKeepFlipFeedbackEmail();
    noteFeedbackResponse('feedback');
  }, [noteFeedbackResponse]);

  const openStoreReview = useCallback(async () => {
    await openKeepFlipGooglePlayReviews();
    noteFeedbackResponse('review');
  }, [noteFeedbackResponse]);

  const dismissPrompt = useCallback(() => {
    setPromptError(null);
    setPromptVisible(false);
  }, []);

  const handlePromptFeedback = useCallback(async () => {
    setPromptAction('feedback');
    setPromptError(null);
    try {
      await openFeedbackEmail();
      dismissPrompt();
    } catch {
      setPromptError(
        `Your device could not open email. Contact ${keepFlipFeedbackEmailAddress()} directly.`,
      );
    } finally {
      setPromptAction(null);
    }
  }, [dismissPrompt, openFeedbackEmail]);

  const handlePromptReview = useCallback(async () => {
    setPromptAction('review');
    setPromptError(null);
    try {
      await openStoreReview();
      dismissPrompt();
    } catch {
      setPromptError('KeepFlip could not open Google Play right now. Please try again later.');
    } finally {
      setPromptAction(null);
    }
  }, [dismissPrompt, openStoreReview]);

  useEffect(() => {
    activeUserIdRef.current = userId;
    actionWriteInFlightRef.current = false;
    setPromptVisible(false);
    setPromptError(null);
    setPromptAction(null);

    if (promptTimerRef.current) {
      clearTimeout(promptTimerRef.current);
      promptTimerRef.current = null;
    }
  }, [userId]);

  useEffect(
    () => () => {
      if (promptTimerRef.current) clearTimeout(promptTimerRef.current);
    },
    [],
  );

  const value = useMemo<FeedbackNudgeContextValue>(
    () => ({
      openFeedbackEmail,
      openStoreReview,
      recordCompletedAction,
    }),
    [openFeedbackEmail, openStoreReview, recordCompletedAction],
  );

  return (
    <FeedbackNudgeContext value={value}>
      {children}
      {userId ? (
        <FeedbackPrompt
          busyAction={promptAction}
          errorMessage={promptError}
          onDismiss={dismissPrompt}
          onOpenFeedback={() => void handlePromptFeedback()}
          onOpenReview={() => void handlePromptReview()}
          visible={promptVisible}
        />
      ) : null}
    </FeedbackNudgeContext>
  );
}

export function useKeepFlipFeedbackNudge() {
  const context = use(FeedbackNudgeContext);
  if (!context) {
    throw new Error(
      'useKeepFlipFeedbackNudge must be used inside KeepFlipFeedbackNudgeProvider.',
    );
  }
  return context;
}

function createResponsiveStyles(responsiveLayout: ReturnType<typeof useResponsiveLayout>) {
  const { responsiveWidth, responsiveHeight, responsiveFont } = responsiveLayout;
  const staticStyles = StyleSheet.create({
    backdrop: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 22,
      backgroundColor: 'rgba(0, 0, 0, 0.74)',
    },
    promptSurface: {
      width: '100%',
      maxWidth: 430,
      gap: 16,
      padding: 20,
      borderRadius: 16,
      borderCurve: 'continuous',
      borderWidth: 1,
      borderColor: 'rgba(242, 211, 138, 0.34)',
      backgroundColor: 'rgba(10, 10, 14, 0.98)',
      boxShadow: '0 18px 48px rgba(0, 0, 0, 0.48)',
    },
    promptSignalRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
    },
    promptSignal: {
      width: 6,
      height: 6,
      borderRadius: theme.radii.pill,
      backgroundColor: theme.colors.scannerCyan,
    },
    promptEyebrow: {
      color: theme.colors.goldBright,
      fontSize: 8,
      fontWeight: '900',
      letterSpacing: 1.35,
    },
    promptHeading: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
    },
    promptIcon: {
      width: 38,
      height: 38,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 12,
      borderCurve: 'continuous',
      borderWidth: 1,
      borderColor: 'rgba(242, 211, 138, 0.28)',
      backgroundColor: 'rgba(215, 168, 74, 0.10)',
    },
    promptCopy: { flex: 1, gap: 5 },
    promptTitle: {
      color: theme.colors.cream,
      fontSize: 20,
      lineHeight: 24,
      fontWeight: '900',
      letterSpacing: -0.2,
    },
    promptBody: {
      color: theme.colors.textMuted,
      fontSize: 13,
      lineHeight: 19,
    },
    promptError: {
      color: '#FFB8B1',
      fontSize: 11,
      lineHeight: 16,
    },
    promptActions: { gap: 9 },
    primaryAction: {
      minHeight: 48,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      borderRadius: 11,
      borderCurve: 'continuous',
      backgroundColor: theme.colors.goldBright,
    },
    primaryActionText: {
      color: theme.colors.backgroundDeep,
      fontSize: 10,
      fontWeight: '900',
      letterSpacing: 0.9,
    },
    secondaryAction: {
      minHeight: 46,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      borderRadius: 11,
      borderCurve: 'continuous',
      borderWidth: 1,
      borderColor: 'rgba(242, 211, 138, 0.38)',
      backgroundColor: 'rgba(215, 168, 74, 0.06)',
    },
    secondaryActionText: {
      color: theme.colors.goldBright,
      fontSize: 10,
      fontWeight: '900',
      letterSpacing: 0.82,
    },
    actionDisabled: { opacity: 0.55 },
    actionPressed: { opacity: 0.76, transform: [{ scale: 0.988 }] },
    dismissAction: {
      minHeight: 38,
      alignItems: 'center',
      justifyContent: 'center',
    },
    dismissActionPressed: { opacity: 0.62 },
    dismissActionText: {
      color: theme.colors.textMuted,
      fontSize: 9,
      fontWeight: '900',
      letterSpacing: 1.1,
    },
  });
  return {
    ...staticStyles,
    promptSignal: [
      staticStyles.promptSignal,
      {
        width: responsiveWidth(6),
        height: responsiveHeight(6),
      },
    ],
    promptEyebrow: [
      staticStyles.promptEyebrow,
      {
        fontSize: responsiveFont(8),
      },
    ],
    promptIcon: [
      staticStyles.promptIcon,
      {
        width: responsiveWidth(38),
        height: responsiveHeight(38),
      },
    ],
    promptTitle: [
      staticStyles.promptTitle,
      {
        fontSize: responsiveFont(20),
      },
    ],
    promptBody: [
      staticStyles.promptBody,
      {
        fontSize: responsiveFont(13),
      },
    ],
    promptError: [
      staticStyles.promptError,
      {
        fontSize: responsiveFont(11),
      },
    ],
    primaryActionText: [
      staticStyles.primaryActionText,
      {
        fontSize: responsiveFont(10),
      },
    ],
    secondaryActionText: [
      staticStyles.secondaryActionText,
      {
        fontSize: responsiveFont(10),
      },
    ],
    dismissActionText: [
      staticStyles.dismissActionText,
      {
        fontSize: responsiveFont(9),
      },
    ],
  };
}
