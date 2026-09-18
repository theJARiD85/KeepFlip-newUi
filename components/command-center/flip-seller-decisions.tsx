import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { ItemReview } from '@/components/seller-assistance/item-review';
import { OfferReview } from '@/components/seller-assistance/offer-review';
import { PreferencesEditor } from '@/components/seller-assistance/preferences-editor';
import {
  Button,
  Field,
  Section,
  useSellerAssistanceStyles,
} from '@/components/seller-assistance/ui';
import { useKeepFlipSubscription } from '@/components/subscription/keepflip-subscription-context';
import { KeepFlipText as Text } from '@/components/ui/keepflip-text';
import { keepFlipTheme as theme } from '@/constants/keepflip-theme';
import { ID } from '@/lib/appwrite';
import responsiveFont from '@/lib/responsiveFont';
import {
  responseReminder,
  summarizeManualHistory,
  type AssistanceHistory,
  type SellerPreferences,
} from '@/lib/seller-assistance';
import {
  getInventoryItem,
  listInventoryItems,
  type InventoryItem,
} from '@/services/inventory-service';
import {
  getMarketplaceMailboxThreads,
  getMarketplaceThread,
  type MarketplaceInquiry,
  type MarketplaceMailboxThread,
} from '@/services/marketplaceInquiryService';
import {
  getSellerPreferences,
  saveSellerPreferences,
  type SellerPreferencesSnapshot,
} from '@/services/seller-preferences-service';

import { useResponsiveLayout, useResponsiveStyles } from '@/hooks/use-responsive-layout';
export type FlipSellerDecision =
  | 'inbox'
  | 'preferences'
  | 'review'
  | 'history'
  | 'seller-operations';

const DECISIONS: {
  id: FlipSellerDecision;
  title: string;
  detail: string;
}[] = [
    {
      id: 'inbox',
      title: 'Review buyer messages and draft a reply',
      detail: 'See open conversations, reminders, and a reply draft.',
    },
    {
      id: 'preferences',
      title: 'Use saved replies or shipping presets',
      detail: 'Manage reusable responses, package defaults, handling, and returns.',
    },
    {
      id: 'review',
      title: 'Review an item, listing age, or buyer offer',
      detail: 'Check item facts, 7/14/30/45-day actions, and offer floor guardrails.',
    },
    {
      id: 'history',
      title: 'Check seller-assistance history and performance',
      detail: 'Review the manual decisions Flip has helped record.',
    },
    {
      id: 'seller-operations',
      title: 'Handle sold items, fulfillment, and realized profit',
      detail: 'Expand seller operations in Command Center for orders, shipping, Money Sync, and final margin.',
    },
  ];

function message(cause: unknown) {
  return cause instanceof Error
    ? cause.message
    : 'This seller decision could not load. Try refreshing.';
}

export function FlipSellerDecisions({
  ownerId,
  onOpenSellerOperations,
}: {
  ownerId: string;
  onOpenSellerOperations: () => void;
}) {
  const localStyles = useResponsiveStyles(createLocalStylesResponsiveStyles);
  const sellerStyles = useSellerAssistanceStyles();
  const { canUse } = useKeepFlipSubscription();
  const [decision, setDecision] = useState<FlipSellerDecision | null>(null);
  const [snapshot, setSnapshot] = useState<SellerPreferencesSnapshot | null>(null);
  const [threads, setThreads] = useState<MarketplaceMailboxThread[]>([]);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [selectedThread, setSelectedThread] =
    useState<MarketplaceMailboxThread | null>(null);
  const [conversation, setConversation] = useState<MarketplaceInquiry[]>([]);
  const [draft, setDraft] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [visibleCount, setVisibleCount] = useState(12);
  const saveLock = useRef(false);
  const mounted = useRef(true);
  const itemRequest = useRef(0);
  const threadRequest = useRef(0);

  useEffect(
    () => () => {
      mounted.current = false;
      itemRequest.current += 1;
      threadRequest.current += 1;
    },
    [],
  );

  useEffect(() => {
    let active = true;
    setLoading(true);
    setErrors({});
    void Promise.allSettled([
      getSellerPreferences(),
      getMarketplaceMailboxThreads(ownerId, 'selling'),
      listInventoryItems(ownerId),
    ]).then((results) => {
      if (!active) return;
      const [preferencesResult, inboxResult, inventoryResult] = results;
      const nextErrors: Record<string, string> = {};

      if (preferencesResult.status === 'fulfilled') {
        setSnapshot(preferencesResult.value);
      } else {
        nextErrors.preferences = message(preferencesResult.reason);
      }

      if (inboxResult.status === 'fulfilled') {
        setThreads(inboxResult.value.filter((thread) => thread.sellerId === ownerId));
      } else {
        nextErrors.inbox = message(inboxResult.reason);
      }

      if (inventoryResult.status === 'fulfilled') {
        setItems(inventoryResult.value);
      } else {
        nextErrors.inventory = message(inventoryResult.reason);
      }

      setErrors(nextErrors);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [ownerId, refresh]);

  useEffect(() => {
    const request = ++threadRequest.current;
    setConversation([]);
    if (!selectedThread) return;
    void getMarketplaceThread(selectedThread.threadKey)
      .then((rows) => {
        if (!mounted.current || request !== threadRequest.current) return;
        setConversation(
          rows.filter(
            (row) =>
              row.sellerId === ownerId &&
              row.threadKey === selectedThread.threadKey,
          ),
        );
      })
      .catch((cause) => {
        if (mounted.current && request === threadRequest.current) {
          setErrors((previous) => ({
            ...previous,
            conversation: message(cause),
          }));
        }
      });
  }, [ownerId, selectedThread, refresh]);

  async function selectItem(itemId: string) {
    const request = ++itemRequest.current;
    setSelectedItem(null);
    try {
      const item = await getInventoryItem(ownerId, itemId);
      if (mounted.current && request === itemRequest.current) {
        setSelectedItem(item);
      }
    } catch (cause) {
      if (mounted.current && request === itemRequest.current) {
        setErrors((previous) => ({ ...previous, item: message(cause) }));
      }
    }
  }

  async function save(preferences: SellerPreferences) {
    if (!snapshot || saveLock.current || loading) return false;
    saveLock.current = true;
    setSaving(true);
    setNotice('');
    try {
      const saved = await saveSellerPreferences(preferences, snapshot.revision);
      if (mounted.current) {
        setSnapshot(saved);
        setNotice('Got it — I saved that to your seller preferences.');
        setErrors((previous) => ({ ...previous, save: '' }));
      }
      return true;
    } catch (cause) {
      if (mounted.current) {
        setErrors((previous) => ({ ...previous, save: message(cause) }));
      }
      return false;
    } finally {
      saveLock.current = false;
      if (mounted.current) setSaving(false);
    }
  }

  async function record(
    action: AssistanceHistory['action'],
    notes: string,
  ) {
    if (!snapshot) {
      setErrors((previous) => ({
        ...previous,
        save: 'Seller preferences need to load before I can record that decision.',
      }));
      return false;
    }
    const entry: AssistanceHistory = {
      id: ID.unique(),
      itemId: selectedItem?.id ?? selectedThread?.listingId ?? '',
      itemTitle:
        selectedItem?.title ??
        selectedThread?.listingTitle ??
        'Seller review',
      occurredAt: new Date().toISOString(),
      action,
      notes: notes.slice(0, 1000),
    };
    return save({
      ...snapshot.preferences,
      manualHistory: [
        entry,
        ...snapshot.preferences.manualHistory,
      ].slice(0, 100),
    });
  }

  const history = snapshot?.preferences.manualHistory ?? [];
  const stats = summarizeManualHistory(history);

  function chooseDecision(next: FlipSellerDecision) {
    setNotice('');
    setVisibleCount(12);
    if (next === 'seller-operations') {
      onOpenSellerOperations();
      return;
    }
    setDecision(next);
  }

  return (
    <View style={localStyles.wrap}>
      <View style={localStyles.flipDialogue}>
        <Text style={localStyles.speaker}>FLIP</Text>
        <Text style={localStyles.greeting}>
          Hi there! What can I help you take care of today?
        </Text>
        <View
          accessibilityLabel="Next seller decisions"
          style={localStyles.decisionList}
        >
          {DECISIONS.map((entry) => (
            <Pressable
              key={entry.id}
              accessibilityRole="button"
              accessibilityState={{ selected: decision === entry.id }}
              onPress={() => chooseDecision(entry.id)}
              style={({ pressed }) => [
                localStyles.decisionRow,
                decision === entry.id && localStyles.decisionRowSelected,
                pressed && localStyles.decisionRowPressed,
              ]}
            >
              <Text style={localStyles.bullet}>•</Text>
              <View style={localStyles.decisionCopy}>
                <Text style={localStyles.decisionTitle}>{entry.title}</Text>
                <Text style={localStyles.decisionDetail}>{entry.detail}</Text>
              </View>
            </Pressable>
          ))}
        </View>
      </View>

      {loading ? (
        <View style={localStyles.statusRow}>
          <ActivityIndicator color={theme.colors.scannerCyan} size="small" />
          <Text style={localStyles.statusText}>
            I’m checking your seller workspace…
          </Text>
        </View>
      ) : null}

      {Object.entries(errors)
        .filter(([, value]) => value)
        .map(([key, value]) => (
          <Text key={key} accessibilityRole="alert" style={sellerStyles.error}>
            {key}: {value}
          </Text>
        ))}
      {notice ? (
        <Text accessibilityLiveRegion="polite" style={localStyles.notice}>
          {notice}
        </Text>
      ) : null}

      {decision ? (
        <View style={localStyles.activeDecision}>
          <View style={localStyles.activeHeader}>
            <Text style={localStyles.activeEyebrow}>CURRENT DECISION</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => setDecision(null)}
              style={localStyles.backButton}
            >
              <Text style={localStyles.backText}>Back to choices</Text>
            </Pressable>
          </View>
          <Button
            title={loading ? 'Refreshing…' : 'Refresh seller context'}
            disabled={loading || saving}
            onPress={() => {
              setRefresh((value) => value + 1);
              setNotice('');
            }}
          />

          {decision === 'inbox' ? (
            <>
              <Section title="Buyer conversations">
                <Text style={sellerStyles.muted}>
                  I’ll show KeepFlip seller conversations, unanswered-message
                  reminders, and a draft area. I won’t send anything without you.
                </Text>
                {!loading && !errors.inbox && threads.length === 0 ? (
                  <Text style={sellerStyles.text}>
                    No seller conversations are waiting in the loaded messages.
                  </Text>
                ) : null}
                {threads.slice(0, visibleCount).map((thread) => {
                  const reminder = responseReminder(
                    thread,
                    ownerId,
                    snapshot?.preferences.responseReminderHours ?? 24,
                  );
                  return (
                    <View key={thread.threadKey} style={sellerStyles.row}>
                      <Text style={sellerStyles.text}>{thread.listingTitle}</Text>
                      <Text style={sellerStyles.muted}>{thread.latest.body}</Text>
                      {reminder ? (
                        <Text style={sellerStyles.text}>{reminder.label}</Text>
                      ) : null}
                      <Button
                        title={`Review conversation for ${thread.listingTitle}`}
                        onPress={() => {
                          setSelectedThread(thread);
                          setErrors((previous) => ({
                            ...previous,
                            conversation: '',
                          }));
                        }}
                      />
                    </View>
                  );
                })}
                {threads.length > visibleCount ? (
                  <Button
                    title="Show more loaded conversations"
                    onPress={() => setVisibleCount((value) => value + 12)}
                  />
                ) : null}
                {selectedThread ? (
                  <View style={sellerStyles.row}>
                    <Text style={sellerStyles.heading}>
                      {selectedThread.listingTitle}
                    </Text>
                    {conversation.slice(-20).map((row) => (
                      <Text key={row.id} selectable style={sellerStyles.text}>
                        {row.senderId === ownerId ? 'You' : 'Buyer'}: {row.body}
                      </Text>
                    ))}
                  </View>
                ) : null}
              </Section>
              <Section title="Draft a reply">
                <Text style={sellerStyles.muted}>
                  Write or edit the response here. Saved replies can be inserted
                  from the shipping/replies decision.
                </Text>
                <Field
                  label="Reply draft — never sent automatically"
                  value={draft}
                  onChangeText={setDraft}
                  multiline
                />
                <Text selectable style={sellerStyles.text}>
                  {draft || 'Your draft preview will appear here.'}
                </Text>
                <Button
                  title="Record that I reviewed this draft"
                  disabled={!draft.trim() || !snapshot || saving}
                  onPress={() => {
                    void record(
                      'reply_draft',
                      'Seller manually reviewed a reply draft. Draft text is not stored in activity history; no message was sent automatically.',
                    );
                  }}
                />
              </Section>
            </>
          ) : null}

          {decision === 'preferences' && snapshot ? (
            <PreferencesEditor
              key={`preferences-${snapshot.revision}`}
              preferences={snapshot.preferences}
              busy={saving || loading}
              onSave={save}
              onUseResponse={(body) => {
                setDraft(body);
                setDecision('inbox');
              }}
            />
          ) : null}

          {decision === 'preferences' && !snapshot && !loading ? (
            <Text style={sellerStyles.text}>
              Seller preferences are unavailable. Refresh after fixing the
              reported service error.
            </Text>
          ) : null}

          {decision === 'review' ? (
            <>
              <Section title="Choose an inventory item">
                <Text style={sellerStyles.muted}>
                  Pick the item you want Flip to help review.
                </Text>
                {items.slice(0, visibleCount).map((item) => (
                  <Button
                    key={item.id}
                    title={`${selectedItem?.id === item.id ? 'Selected: ' : ''}${item.title}`}
                    onPress={() => {
                      void selectItem(item.id);
                    }}
                  />
                ))}
                {items.length > visibleCount ? (
                  <Button
                    title="Show more loaded items"
                    onPress={() => setVisibleCount((value) => value + 12)}
                  />
                ) : null}
                {!loading && items.length === 0 && !errors.inventory ? (
                  <Text style={sellerStyles.text}>
                    No inventory items are loaded yet.
                  </Text>
                ) : null}
              </Section>
              {selectedItem ? (
                <ItemReview
                  key={selectedItem.id}
                  item={selectedItem}
                  onRecord={(notes) => record('review', notes)}
                />
              ) : null}
              <OfferReview
                key={`offer-${selectedItem?.id ?? 'manual'}`}
                serious={canUse('offer_guardrails')}
                presets={snapshot?.preferences.shippingPresets ?? []}
                onRecord={(notes) => record('offer_review', notes)}
              />
            </>
          ) : null}

          {decision === 'history' ? (
            <>
              <Section title="Seller-assistance history">
                <Text style={sellerStyles.text}>
                  {stats.recordedActions} recorded actions · {stats.reviews} item
                  reviews · {stats.draftReviews} draft reviews · {stats.offerReviews}{' '}
                  offer reviews
                </Text>
                <Text style={sellerStyles.muted}>
                  These are your last 100 saved manual assistance actions. They
                  are not sales, response rates, or realized profit.
                </Text>
                {history.slice(0, visibleCount).map((entry) => (
                  <View key={entry.id} style={sellerStyles.row}>
                    <Text style={sellerStyles.text}>
                      {entry.itemTitle} · {entry.action.replaceAll('_', ' ')}
                    </Text>
                    <Text style={sellerStyles.muted}>
                      {new Date(entry.occurredAt).toLocaleString()}
                    </Text>
                    <Text selectable style={sellerStyles.text}>
                      {entry.notes}
                    </Text>
                  </View>
                ))}
                {history.length > visibleCount ? (
                  <Button
                    title="Show more history"
                    onPress={() => setVisibleCount((value) => value + 12)}
                  />
                ) : null}
                <Button
                  title="Open orders and realized profit"
                  onPress={onOpenSellerOperations}
                />
              </Section>
              <Section title="Advanced seller performance · Serious">
                <Text style={sellerStyles.muted}>
                  {canUse('seller_analytics')
                    ? 'Seller operations can show aggregate seller performance from recorded orders.'
                    : 'Serious adds aggregate seller analytics. Your basic manual history stays available here.'}
                </Text>
                {canUse('seller_analytics') ? (
                  <Button
                    title="Open advanced seller performance"
                    onPress={onOpenSellerOperations}
                  />
                ) : null}
              </Section>
            </>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function createLocalStylesResponsiveStyles(responsiveLayout: ReturnType<typeof useResponsiveLayout>) {
  const { responsiveFont } = responsiveLayout;
  const staticStyles = StyleSheet.create({
    wrap: { gap: 12 },
    flipDialogue: {
      gap: 10,
      padding: 12,
      borderWidth: 1,
      borderColor: theme.colors.accentCyanBorder,
      borderRadius: 12,
      backgroundColor: theme.colors.iconSurfaceCyan,
    },
    speaker: {
      color: theme.colors.scannerCyan,
      fontSize: 8,
      fontWeight: '900',
      letterSpacing: 1.5,
    },
    greeting: {
      color: theme.colors.cream,
      fontSize: 15,
      fontWeight: '800',
      lineHeight: 21,
    },
    decisionList: { gap: 4 },
    decisionRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
      paddingVertical: 8,
      paddingHorizontal: 8,
      borderRadius: 9,
    },
    decisionRowSelected: {
      backgroundColor: theme.colors.iconSurfaceGold,
    },
    decisionRowPressed: { opacity: 0.72 },
    bullet: {
      color: theme.colors.goldBright,
      fontSize: 18,
      lineHeight: 18,
    },
    decisionCopy: { flex: 1, gap: 2 },
    decisionTitle: {
      color: theme.colors.text,
      fontSize: 11,
      fontWeight: '800',
      lineHeight: 16,
    },
    decisionDetail: {
      color: theme.colors.textMuted,
      fontSize: 9,
      lineHeight: 13,
    },
    statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    statusText: { color: theme.colors.textMuted, fontSize: 10 },
    notice: { color: theme.colors.scannerCyan, fontSize: 10, lineHeight: 14 },
    activeDecision: {
      gap: 12,
      paddingTop: 4,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.colors.divider,
    },
    activeHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    activeEyebrow: {
      color: theme.colors.goldBright,
      fontSize: 8,
      fontWeight: '900',
      letterSpacing: 1.2,
    },
    backButton: { paddingVertical: 5, paddingHorizontal: 7 },
    backText: {
      color: theme.colors.scannerCyan,
      fontSize: 9,
      fontWeight: '800',
    },
  });
  return {
    ...staticStyles,
    speaker: [
      staticStyles.speaker,
      {
        fontSize: responsiveFont(8),
      },
    ],
    greeting: [
      staticStyles.greeting,
      {
        fontSize: responsiveFont(15),
      },
    ],
    bullet: [
      staticStyles.bullet,
      {
        fontSize: responsiveFont(18),
      },
    ],
    decisionTitle: [
      staticStyles.decisionTitle,
      {
        fontSize: responsiveFont(11),
      },
    ],
    decisionDetail: [
      staticStyles.decisionDetail,
      {
        fontSize: responsiveFont(9),
      },
    ],
    statusText: [
      staticStyles.statusText,
      {
        fontSize: responsiveFont(10),
      },
    ],
    notice: [
      staticStyles.notice,
      {
        fontSize: responsiveFont(10),
      },
    ],
    activeEyebrow: [
      staticStyles.activeEyebrow,
      {
        fontSize: responsiveFont(8),
      },
    ],
    backText: [
      staticStyles.backText,
      {
        fontSize: responsiveFont(9),
      },
    ],
  };
}
