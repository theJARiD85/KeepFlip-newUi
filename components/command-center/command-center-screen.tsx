import * as Haptics from 'expo-haptics';
import { type Href, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useKeepFlipAuth } from '@/components/auth/keepflip-auth-context';
import { KeepFlipAssistantPanel } from '@/components/command-center/keepflip-assistant-panel';
import { BusinessPulse } from '@/components/command-center/business-pulse';
import {
  KeepFlipControlRow,
  type KeepFlipStatusBadgeProps,
} from '@/components/ui/keepflip-control-row';
import { KeepFlipBackground } from '@/components/ui/keepflip-background';
import { KeepFlipText as Text } from '@/components/ui/keepflip-text';
import { keepFlipTheme as theme } from '@/constants/keepflip-theme';
import {
  connectEbayAccount,
  getEbayConnectionStatus,
} from '@/services/ebayConnectionService';
import { openKeepFlipSupportEmail } from '@/lib/keepflip-feedback';
import {
  buildResellerBusinessOverview,
  type ResellerBusinessOverview,
} from '@/services/reseller-business-overview';
import {
  getBookkeepingOverview,
  syncEbayBookkeeping,
  isResellerBookkeepingConfigured,
  type BookkeepingMoneyEvent,
} from '@/services/reseller-bookkeeping-service';
import { listInventoryItems } from '@/services/inventory-service';
import {
  isResellerBooksConfigured,
  listResellerLedgerEntries,
  type ResellerLedgerEntry,
} from '@/services/reseller-ledger-service';

type EbayConnectionViewState =
  | 'checking'
  | 'connected'
  | 'connecting'
  | 'disconnected'
  | 'error';

function bookkeepingEventsForBusinessPulse(
  ownerId: string,
  events: BookkeepingMoneyEvent[],
): ResellerLedgerEntry[] {
  return events.map((event) => ({
    amountCents: event.amountCents,
    channel: 'KeepFlip Books',
    createdAt: event.occurredAt,
    currency: 'USD',
    direction: event.direction,
    entryType: event.entryType,
    externalId: null,
    id: `books-v2-${event.id}`,
    itemId: event.itemId,
    notes: null,
    occurredAt: event.occurredAt,
    ownerId,
    receiptFileId: null,
    saleGroupId: null,
    source: 'migration',
    updatedAt: event.occurredAt,
    voidedAt: null,
  }));
}

function hapticSelection() {
  if (process.env.EXPO_OS === 'ios') {
    void Haptics.selectionAsync().catch(() => undefined);
  }
}

function hapticSuccess() {
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
    () => undefined,
  );
}

function eBayStateDetails(
  state: EbayConnectionViewState,
  errorMessage: string | null,
): { description: string; status: KeepFlipStatusBadgeProps } {
  switch (state) {
    case 'connected':
      return {
        description: 'Your eBay connection is active and ready for seller features.',
        status: { label: 'CONNECTED', tone: 'active' },
      };
    case 'connecting':
      return {
        description: 'Finish the secure connection in eBay. KeepFlip will confirm it here.',
        status: { label: 'CONNECTING', tone: 'warning' },
      };
    case 'disconnected':
      return {
        description: 'Connect eBay to bring marketplace tools into your command center.',
        status: { label: 'NOT CONNECTED', tone: 'muted' },
      };
    case 'error':
      return {
        description:
          errorMessage ??
          'We could not check the eBay connection. Try again when you are ready.',
        status: { label: 'ATTENTION', tone: 'danger' },
      };
    default:
      return {
        description: 'Checking the secure connection linked to this KeepFlip account.',
        status: { label: 'CHECKING', tone: 'violet' },
      };
  }
}

export function CommandCenterScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useKeepFlipAuth();
  const [supportError, setSupportError] = useState<string | null>(null);
  const [eBayState, setEbayState] =
    useState<EbayConnectionViewState>('checking');
  const [eBayErrorMessage, setEbayErrorMessage] = useState<string | null>(null);
  const eBayRequestId = useRef(0);
  const businessRequestId = useRef(0);
  const [businessOverview, setBusinessOverview] =
    useState<ResellerBusinessOverview | null>(null);
  const [businessLoading, setBusinessLoading] = useState(true);
  const [businessError, setBusinessError] = useState<string | null>(null);
  const [eBayBooksSyncing, setEbayBooksSyncing] = useState(false);
  const [eBayBooksSyncMessage, setEbayBooksSyncMessage] = useState<string | null>(null);

  const resolveEbayStatus = useCallback(async () => {
    try {
      const result = await getEbayConnectionStatus();
      return {
        state: result.connected
          ? ('connected' as const)
          : ('disconnected' as const),
        errorMessage: null,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error && error.message.trim()
          ? error.message.trim()
          : 'We could not check eBay right now. Tap retry to try again.';

      console.warn('[KeepFlip eBay OAuth] Status check failed', {
        message: errorMessage,
      });

      return {
        state: 'error' as const,
        errorMessage,
      };
    }
  }, []);

  const refreshEbayStatus = useCallback(async (): Promise<EbayConnectionViewState> => {
    const requestId = ++eBayRequestId.current;
    setEbayState('checking');
    setEbayErrorMessage(null);

    const result = await resolveEbayStatus();
    if (requestId === eBayRequestId.current) {
      setEbayState(result.state);
      setEbayErrorMessage(result.errorMessage);
    }

    return result.state;
  }, [resolveEbayStatus]);
  const refreshBusinessOverview = useCallback(async () => {
    if (!user?.$id) {
      setBusinessOverview(null);
      setBusinessLoading(false);
      return;
    }

    const ownerId = user.$id;
    const requestId = ++businessRequestId.current;
    setBusinessLoading(true);
    setBusinessError(null);

    const [inventoryResult, legacyResult, advancedResult] = await Promise.allSettled([
      listInventoryItems(ownerId),
      isResellerBooksConfigured()
        ? listResellerLedgerEntries(ownerId)
        : Promise.resolve([]),
      isResellerBookkeepingConfigured()
        ? getBookkeepingOverview()
        : Promise.resolve(null),
    ]);

    if (requestId !== businessRequestId.current) return;

    if (inventoryResult.status !== 'fulfilled') {
      setBusinessOverview(null);
      setBusinessError(
        inventoryResult.reason instanceof Error
          ? inventoryResult.reason.message
          : 'KeepFlip could not load the current business picture.',
      );
      setBusinessLoading(false);
      return;
    }

    const entries: ResellerLedgerEntry[] = [];
    const notes: string[] = [];
    if (legacyResult.status === 'fulfilled') {
      entries.push(...legacyResult.value);
    } else {
      notes.push('Some saved money records could not be loaded right now.');
    }
    if (advancedResult.status === 'fulfilled' && advancedResult.value) {
      entries.push(
        ...bookkeepingEventsForBusinessPulse(
          ownerId,
          advancedResult.value.moneyEvents,
        ),
      );
      if (advancedResult.value.truncated) {
        notes.push('This view is showing the latest 1,000 Books lines.');
      }
    } else if (isResellerBookkeepingConfigured()) {
      notes.push('Advanced Books is set up, but its latest records are unavailable right now.');
    }

    setBusinessOverview(
      buildResellerBusinessOverview({
        entries,
        inventory: inventoryResult.value,
      }),
    );
    setBusinessError(notes.join(' ') || null);
    setBusinessLoading(false);
  }, [user?.$id]);
  const handleEbayBooksSync = async () => {
    if (eBayBooksSyncing) return;
    if (eBayState !== 'connected') {
      setEbayBooksSyncMessage('Connect eBay first, then sync its sales, fees, labels, refunds, and payouts.');
      return;
    }

    hapticSelection();
    setEbayBooksSyncing(true);
    setEbayBooksSyncMessage(null);
    try {
      const result = await syncEbayBookkeeping();
      const attention = result.needsItemMatch + result.needsItemCost + result.needsReview;
      setEbayBooksSyncMessage(
        `${result.posted} record${result.posted === 1 ? '' : 's'} added from eBay. ` +
          (attention > 0
            ? `${attention} item${attention === 1 ? '' : 's'} need${attention === 1 ? 's' : ''} a quick review.`
            : 'Everything matched cleanly.'),
      );
      hapticSuccess();
      await refreshBusinessOverview();
    } catch (error) {
      setEbayBooksSyncMessage(
        error instanceof Error
          ? error.message
          : 'KeepFlip could not sync eBay financial activity right now.',
      );
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(
        () => undefined,
      );
    } finally {
      setEbayBooksSyncing(false);
    }
  };

  useEffect(() => {
    const message =
      supportError ??
      (eBayState === 'error' ? eBayErrorMessage : null);

    if (message && Platform.OS === 'ios') {
      AccessibilityInfo.announceForAccessibility(message);
    }
  }, [eBayErrorMessage, eBayState, supportError]);

  useEffect(() => {
    if (!user?.$id) return;

    const requestId = ++eBayRequestId.current;
    void resolveEbayStatus().then((result) => {
      if (requestId === eBayRequestId.current) {
        setEbayState(result.state);
        setEbayErrorMessage(result.errorMessage);
      }
    });

    return () => {
      eBayRequestId.current += 1;
    };
  }, [resolveEbayStatus, user?.$id]);
  useEffect(() => {
    void refreshBusinessOverview();
    return () => {
      businessRequestId.current += 1;
    };
  }, [refreshBusinessOverview]);

  if (!user) return null;

  const eBayDetails = eBayStateDetails(eBayState, eBayErrorMessage);
  const eBayIsBusy = eBayState === 'checking' || eBayState === 'connecting';
  const eBayActionLabel =
    eBayState === 'connected'
      ? 'REFRESH'
      : eBayState === 'disconnected'
        ? 'CONNECT'
        : eBayState === 'error'
          ? 'RETRY'
          : undefined;


  const handleEbayConnection = async () => {
    if (eBayIsBusy) return;

    hapticSelection();
    setEbayErrorMessage(null);

    if (eBayState === 'connected') {
      await refreshEbayStatus();
      return;
    }

    const connectionAttempt = ++eBayRequestId.current;
    setEbayState('connecting');

    try {
      const result = await connectEbayAccount();
      if (connectionAttempt !== eBayRequestId.current) return;

      if (result.status !== 'connected') {
        setEbayState('disconnected');
        setEbayErrorMessage(
          result.status === 'declined'
            ? 'You declined the eBay connection. Nothing was linked.'
            : result.status === 'dismissed'
              ? 'The eBay sign-in window was closed before it finished.'
              : 'eBay could not complete the connection. Please try again.',
        );
        return;
      }

      const nextState = await refreshEbayStatus();
      if (nextState === 'disconnected') {
        setEbayState('error');
        setEbayErrorMessage(
          'eBay returned to KeepFlip, but the connection is not ready yet. Try again in a moment.',
        );
      }
    } catch (error) {
      if (connectionAttempt !== eBayRequestId.current) return;

      setEbayState('error');
      setEbayErrorMessage(
        error instanceof Error && error.message
          ? error.message
          : 'The eBay connection could not start. Tap retry to try again.',
      );
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(
        () => undefined,
      );
    }
  };

  const handleOpenSupport = async () => {
    hapticSelection();
    setSupportError(null);

    try {
      await openKeepFlipSupportEmail();
    } catch {
      setSupportError(
        'Your device could not open email. Contact support@keep-flip.com for help.',
      );
    }
  };

  return (
    <KeepFlipBackground>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 34, paddingBottom: insets.bottom + 32 },
        ]}
        style={{marginBottom: insets.bottom}}
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}>
        <Animated.View entering={FadeInDown.duration(260)} style={styles.header}>
          <Text style={styles.eyebrow}>KEEPFLIP / COMMAND CENTER</Text>
          <Text style={styles.title}>Run the business</Text>
          <Text style={styles.subtitle}>
            Marketplace access, inventory, books, and workspace controls in one place.
          </Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(260).delay(45)} style={styles.section}>
          <KeepFlipAssistantPanel
            onNavigate={(route) => {
              hapticSelection();
              router.push(route as Href);
            }}
          />
        </Animated.View>
        <Animated.View entering={FadeInDown.duration(260).delay(60)} style={styles.section}>
          <BusinessPulse
            errorMessage={businessError}
            loading={businessLoading}
            onOpenBooks={() => {
              hapticSelection();
              router.push('/books' as Href);
            }}
            onOpenFlipPlan={() => {
              hapticSelection();
              router.push('/flip-plan' as Href);
            }}
            onOpenInventory={() => {
              hapticSelection();
              router.push('/inventory' as Href);
            }}
            overview={businessOverview}
          />
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(260).delay(75)} style={styles.section}>
          <View style={styles.sectionHeading}>
            <Text style={styles.sectionEyebrow}>MARKETPLACE</Text>
            <Text style={styles.sectionTitle}>Connected services</Text>
          </View>
          <View style={styles.eBaySurface}>
            <KeepFlipControlRow
              accent="cyan"
              actionBusy={eBayIsBusy}
              actionLabel={eBayActionLabel}
              accessibilityHint={
                eBayState === 'connected'
                  ? 'Refreshes the eBay connection status.'
                  : 'Starts the secure eBay connection.'
              }
              description={eBayDetails.description}
              label="eBay"
              leading={
                <Image
                  accessible={false}
                  resizeMode="contain"
                  source={require('@/assets/images/ebay-seeklogo.png')}
                  style={styles.eBayLogo}
                />
              }
              onPress={eBayIsBusy ? undefined : () => void handleEbayConnection()}
              status={eBayDetails.status}
            />
          </View>
          {isResellerBookkeepingConfigured() ? (
            <View style={styles.eBaySurface}>
              <KeepFlipControlRow
                accent="gold"
                actionBusy={eBayBooksSyncing}
                actionLabel={eBayState === 'connected' ? 'SYNC' : undefined}
                accessibilityHint="Brings in eBay sales, fees, labels, refunds, and payouts using the connected seller account."
                description={
                  eBayBooksSyncMessage ??
                  'Bring in eBay sales, fees, shipping labels, refunds, and payouts. Payouts are matched without counting them as a second sale.'
                }
                icon="chart.bar.fill"
                label="eBay money sync"
                onPress={eBayBooksSyncing ? undefined : () => void handleEbayBooksSync()}
                status={{
                  label:
                    eBayBooksSyncing
                      ? 'SYNCING'
                      : eBayState === 'connected'
                        ? 'READY'
                        : 'CONNECT FIRST',
                  tone:
                    eBayBooksSyncing
                      ? 'violet'
                      : eBayState === 'connected'
                        ? 'active'
                        : 'muted',
                }}
              />
            </View>
          ) : null}
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(260).delay(90)} style={styles.section}>
          <View style={styles.sectionHeading}>
            <Text style={styles.sectionEyebrow}>BUSINESS TOOLS</Text>
            <Text style={styles.sectionTitle}>Seller workspace</Text>
          </View>
          <View style={styles.settingsList}>
            <KeepFlipControlRow
              accent="gold"
              accessibilityHint="Opens the reseller ledger, reports, and export."
              description="Record actual sales, fees, expenses, and inventory cost."
              icon="chart.bar.fill"
              label="Books & reports"
              onPress={() => {
                hapticSelection();
                router.push('/books' as Href);
              }}
            />
            <KeepFlipControlRow
              accent="cyan"
              accessibilityHint="Opens your saved inventory."
              description="Review saved finds, market analysis, and item records."
              icon="shippingbox.fill"
              label="Inventory & data"
              onPress={() => {
                hapticSelection();
                router.push('/inventory' as Href);
              }}
            />
            <KeepFlipControlRow
              accessibilityHint="Opens your collection of possible buys."
              description="Review pending finds before you commit money or shelf space."
              icon="tag.fill"
              label="Deal shelf"
              onPress={() => {
                hapticSelection();
                router.push('/deal-shelf' as Href);
              }}
            />
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(260).delay(135)} style={styles.section}>
          <View style={styles.sectionHeading}>
            <Text style={styles.sectionEyebrow}>WORKSPACE</Text>
            <Text style={styles.sectionTitle}>KeepFlip controls</Text>
          </View>
          <View style={styles.settingsList}>
            <KeepFlipControlRow
              accent="violet"
              description="Analysis defaults and evidence guidance will appear here."
              icon="bolt.fill"
              label="AI preferences"
              staticLabel="COMING SOON"
            />
            <KeepFlipControlRow
              accent="cyan"
              description="Seller alerts and scan updates are being prepared."
              icon="envelope.fill"
              label="Notifications"
              staticLabel="COMING SOON"
            />
            <KeepFlipControlRow
              description="KeepFlip follows your device’s dark appearance."
              icon="eye.fill"
              label="Appearance"
              staticLabel="SYSTEM"
            />
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(260).delay(180)} style={styles.section}>
          <View style={styles.sectionHeading}>
            <Text style={styles.sectionEyebrow}>ACCOUNT & HELP</Text>
            <Text style={styles.sectionTitle}>Your KeepFlip access</Text>
          </View>
          <View style={styles.settingsList}>
            <KeepFlipControlRow
              accent="violet"
              accessibilityHint="Opens your identity, security, privacy, and session controls."
              description="Profile, security, legal controls, and this device session."
              icon="person.crop.circle.fill"
              label="Account & access"
              onPress={() => {
                hapticSelection();
                router.push('/account' as Href);
              }}
            />
            <KeepFlipControlRow
              accent="cyan"
              accessibilityHint="Replays the scan, analysis, and inventory walkthrough."
              description="Revisit the first-item walkthrough with the real scanner."
              icon="viewfinder"
              label="Scanner walkthrough"
              onPress={() => {
                hapticSelection();
                router.push('/walkthrough' as Href);
              }}
            />
            <KeepFlipControlRow
              accent="cyan"
              accessibilityHint="Opens an email to KeepFlip support."
              description="Contact KeepFlip support for your account or the app."
              icon="envelope.fill"
              label="Get help"
              onPress={() => void handleOpenSupport()}
            />
          </View>
        </Animated.View>

        {supportError ? (
          <Text accessibilityLiveRegion="polite" selectable style={styles.errorText}>
            {supportError}
          </Text>
        ) : null}
      </ScrollView>
    </KeepFlipBackground>
  );
}

const styles = StyleSheet.create({
  content: {
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
    gap: 16,
    paddingHorizontal: 18,
  },
  header: { gap: 4 },
  eyebrow: {
    color: theme.colors.gold,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.7,
  },
  title: {
    color: theme.colors.cream,
    fontSize: 28,
    lineHeight: 33,
    fontWeight: '900',
    letterSpacing: -0.35,
  },
  subtitle: {
    maxWidth: 520,
    color: theme.colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
  },
  section: { gap: 7 },
  sectionHeading: { gap: 2 },
  sectionEyebrow: {
    color: theme.colors.goldBright,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1.4,
  },
  sectionTitle: {
    color: theme.colors.text,
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '800',
  },
  eBaySurface: {
    overflow: 'hidden',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(88, 223, 232, 0.23)',
    backgroundColor: 'rgba(6, 11, 14, 0.76)',
  },
  eBayLogo: {
    width: 25,
    height: 27,
  },
  settingsList: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(242, 211, 138, 0.20)',
  },
  errorText: {
    color: '#FFB8B1',
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center',
  },
});