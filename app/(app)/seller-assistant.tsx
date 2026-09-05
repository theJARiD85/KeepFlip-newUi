import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { type Href, Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useKeepFlipAuth } from '@/components/auth/keepflip-auth-context';
import { useKeepFlipSubscription } from '@/components/subscription/keepflip-subscription-context';
import { ItemReview } from '@/components/seller-assistance/item-review';
import { OfferReview } from '@/components/seller-assistance/offer-review';
import { PreferencesEditor } from '@/components/seller-assistance/preferences-editor';
import { Button, Field, Section, styles } from '@/components/seller-assistance/ui';
import { ID } from '@/lib/appwrite';
import { responseReminder, summarizeManualHistory, type AssistanceHistory, type SellerPreferences } from '@/lib/seller-assistance';
import { getInventoryItem, listInventoryItems, type InventoryItem } from '@/services/inventory-service';
import { getMarketplaceMailboxThreads, getMarketplaceThread, type MarketplaceInquiry, type MarketplaceMailboxThread } from '@/services/marketplaceInquiryService';
import { getSellerPreferences, saveSellerPreferences, type SellerPreferencesSnapshot } from '@/services/seller-preferences-service';

type Tab = 'inbox' | 'preferences' | 'review' | 'history';
function message(cause: unknown) { return cause instanceof Error ? cause.message : 'This section could not load. Try refreshing.'; }
export default function SellerAssistantRoute() {
  const { user } = useKeepFlipAuth();
  const params = useLocalSearchParams<{ itemId?: string; threadKey?: string; section?: string }>();
  return <><Stack.Screen options={{ title: 'Seller assistant', headerShown: true }} />{user ? <SellerAssistant key={user.$id} ownerId={user.$id} initialItemId={typeof params.itemId === 'string' ? params.itemId : undefined} initialThreadKey={typeof params.threadKey === 'string' ? params.threadKey : undefined} initialTab={typeof params.section === 'string' ? params.section : undefined} /> : <View style={styles.content}><Text style={styles.text}>Sign in to open your seller assistant.</Text></View>}</>;
}
function SellerAssistant({ ownerId, initialItemId, initialThreadKey, initialTab }: { ownerId: string; initialItemId?: string; initialThreadKey?: string; initialTab?: string }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { canUse } = useKeepFlipSubscription();
  const [tab, setTab] = useState<Tab>(initialTab === 'preferences' || initialTab === 'history' || initialTab === 'review' ? initialTab : initialItemId ? 'review' : 'inbox');
  const [snapshot, setSnapshot] = useState<SellerPreferencesSnapshot | null>(null);
  const [threads, setThreads] = useState<MarketplaceMailboxThread[]>([]);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [selectedThread, setSelectedThread] = useState<MarketplaceMailboxThread | null>(null);
  const [conversation, setConversation] = useState<MarketplaceInquiry[]>([]);
  const [draft, setDraft] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [visibleCount, setVisibleCount] = useState(20);
  const saveLock = useRef(false);
  const mounted = useRef(true);
  const itemRequest = useRef(0);
  const threadRequest = useRef(0);
  useEffect(() => () => { mounted.current = false; itemRequest.current++; threadRequest.current++; }, []);
  useEffect(() => {
    let active = true;
    setLoading(true); setErrors({}); setSnapshot(null);
    void Promise.allSettled([getSellerPreferences(), getMarketplaceMailboxThreads(ownerId, 'selling'), listInventoryItems(ownerId)]).then(results => {
      if (!active) return;
      const [preferencesResult, inboxResult, inventoryResult] = results;
      const nextErrors: Record<string, string> = {};
      if (preferencesResult.status === 'fulfilled') setSnapshot(preferencesResult.value); else nextErrors.preferences = message(preferencesResult.reason);
      if (inboxResult.status === 'fulfilled') { const owned = inboxResult.value.filter(x => x.sellerId === ownerId); setThreads(owned); if (initialThreadKey) setSelectedThread(owned.find(x => x.threadKey === initialThreadKey) ?? null); } else { setThreads([]); nextErrors.inbox = message(inboxResult.reason); }
      if (inventoryResult.status === 'fulfilled') setItems(inventoryResult.value); else { setItems([]); nextErrors.inventory = message(inventoryResult.reason); }
      setErrors(nextErrors); setLoading(false);
    });
    return () => { active = false; };
  }, [ownerId, refresh, initialThreadKey]);
  useEffect(() => {
    if (!initialItemId) return;
    let active = true;
    void getInventoryItem(ownerId, initialItemId).then(item => { if (active) setSelectedItem(item); }).catch(cause => { if (active) setErrors(previous => ({ ...previous, item: message(cause) })); });
    return () => { active = false; };
  }, [ownerId, initialItemId]);
  useEffect(() => {
    const request = ++threadRequest.current;
    setConversation([]); setDraft('');
    if (!selectedThread) return;
    void getMarketplaceThread(selectedThread.threadKey).then(rows => {
      if (mounted.current && request === threadRequest.current) setConversation(rows.filter(row => row.sellerId === ownerId && row.threadKey === selectedThread.threadKey));
    }).catch(cause => { if (mounted.current && request === threadRequest.current) setErrors(previous => ({ ...previous, conversation: message(cause) })); });
  }, [ownerId, selectedThread, refresh]);
  async function selectItem(itemId: string) {
    const request = ++itemRequest.current; setSelectedItem(null);
    try { const item = await getInventoryItem(ownerId, itemId); if (mounted.current && request === itemRequest.current) setSelectedItem(item); }
    catch (cause) { if (mounted.current && request === itemRequest.current) setErrors(previous => ({ ...previous, item: message(cause) })); }
  }
  async function save(preferences: SellerPreferences) {
    if (!snapshot || saveLock.current || loading) return false;
    saveLock.current = true; setSaving(true); setNotice('');
    try {
      const saved = await saveSellerPreferences(preferences, snapshot.revision);
      if (mounted.current) { setSnapshot(saved); setNotice('Saved to your seller preferences.'); setErrors(previous => ({ ...previous, save: '' })); }
      return true;
    } catch (cause) { if (mounted.current) setErrors(previous => ({ ...previous, save: message(cause) })); return false; }
    finally { saveLock.current = false; if (mounted.current) setSaving(false); }
  }
  async function record(action: AssistanceHistory['action'], notes: string) {
    if (!snapshot) { setErrors(previous => ({ ...previous, save: 'Load preferences before recording history.' })); return false; }
    const entry: AssistanceHistory = { id: ID.unique(), itemId: selectedItem?.id ?? selectedThread?.listingId ?? '', itemTitle: selectedItem?.title ?? selectedThread?.listingTitle ?? 'Seller review', occurredAt: new Date().toISOString(), action, notes: notes.slice(0, 1000) };
    return save({ ...snapshot.preferences, manualHistory: [entry, ...snapshot.preferences.manualHistory].slice(0, 100) });
  }
  const history = snapshot?.preferences.manualHistory ?? [];
  const stats = summarizeManualHistory(history);
  return <ScrollView style={styles.page} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]} keyboardShouldPersistTaps="handled" contentInsetAdjustmentBehavior="automatic">
    <Text accessibilityRole="header" style={styles.heading}>Your next seller decision</Text>
    <Text style={styles.muted}>Review conversations, reuse your own replies and shipping defaults, and decide what each listing needs. Every marketplace action remains yours.</Text>
    <Button title={loading ? 'Refreshing…' : 'Refresh inbox, inventory and preferences'} disabled={loading || saving} onPress={() => { setRefresh(value => value + 1); setNotice(''); }} />
    <View style={styles.row}>{(['inbox', 'preferences', 'review', 'history'] as const).map(value => <Button key={value} title={`${tab === value ? 'Selected: ' : ''}${value === 'review' ? 'Item and offer reviews' : value === 'preferences' ? 'Saved replies and shipping' : value === 'history' ? 'Manual history and performance' : 'Seller inbox and draft'}`} onPress={() => { setTab(value); setVisibleCount(20); }} />)}</View>
    {loading ? <ActivityIndicator accessibilityLabel="Loading seller assistance" /> : null}
    {Object.entries(errors).filter(([, value]) => value).map(([key, value]) => <Text key={key} accessibilityRole="alert" style={styles.error}>{key}: {value}</Text>)}
    {notice ? <Text accessibilityLiveRegion="polite" style={styles.text}>{notice}</Text> : null}
    {tab === 'inbox' ? <>
      <Section title="Seller inbox · everyone">
        <Text style={styles.muted}>KeepFlip conversations only. The existing service loads at most 100 message rows, so this is a partial inbox and reminder view, not a complete response-time metric.</Text>
        {!loading && !errors.inbox && threads.length === 0 ? <Text style={styles.text}>No seller conversations in the loaded messages.</Text> : null}
        {threads.slice(0, visibleCount).map(thread => { const reminder = responseReminder(thread, ownerId, snapshot?.preferences.responseReminderHours ?? 24); return <View key={thread.threadKey} style={styles.row}><Text style={styles.text}>{thread.listingTitle}</Text><Text style={styles.muted}>{thread.latest.body}</Text>{reminder ? <Text style={styles.text}>{reminder.label}</Text> : null}<Button title={`Review conversation for ${thread.listingTitle}`} onPress={() => { setSelectedThread(thread); setErrors(previous => ({ ...previous, conversation: '' })); }} /></View>; })}
        {threads.length > visibleCount ? <Button title="Show more loaded conversations" onPress={() => setVisibleCount(value => value + 20)} /> : null}
        {selectedThread ? <View style={styles.row}><Text style={styles.heading}>{selectedThread.listingTitle}</Text>{conversation.slice(-20).map(row => <Text key={row.id} selectable style={styles.text}>{row.senderId === ownerId ? 'You' : 'Buyer'}: {row.body}</Text>)}<Text style={styles.muted}>Showing the last 20 messages from this loaded conversation. No automatic matching to inventory facts.</Text></View> : null}
      </Section>
      <Section title="Buyer reply draft · everyone">
        <Text style={styles.muted}>Write or edit a reply below. Select a saved response from the Saved replies and shipping section. Long-press to copy the final text and send it yourself in the correct conversation.</Text>
        <Field label="Draft reply — never sent automatically" value={draft} onChangeText={setDraft} multiline />
        <Text selectable style={styles.text}>{draft || 'Your draft preview will appear here.'}</Text>
        <Button title="Record that I reviewed this draft" disabled={!draft.trim() || !snapshot || saving} onPress={() => { void record('reply_draft', 'Seller manually reviewed a reply draft. Draft text is not stored in activity history; no message was sent by this assistant.'); }} />
      </Section>
    </> : null}
    {tab === 'preferences' && snapshot ? <PreferencesEditor key={`preferences-${snapshot.revision}`} preferences={snapshot.preferences} busy={saving || loading} onSave={save} onUseResponse={body => { setDraft(body); setTab('inbox'); }} /> : null}
    {tab === 'preferences' && !snapshot && !loading ? <Text style={styles.text}>Preferences are unavailable. Fix the reported service error and refresh; unsaved changes are not presented as durable.</Text> : null}
    {tab === 'review' ? <>
      <Section title="Choose an inventory item">
        <Text style={styles.muted}>The first 100 inventory items are available here. Open this route with itemId to load another owned item directly.</Text>
        {items.slice(0, visibleCount).map(item => <Button key={item.id} title={`${selectedItem?.id === item.id ? 'Selected: ' : ''}${item.title}`} onPress={() => { void selectItem(item.id); }} />)}
        {items.length > visibleCount ? <Button title="Show more loaded items" onPress={() => setVisibleCount(value => value + 20)} /> : null}
        {!loading && items.length === 0 && !errors.inventory ? <Text style={styles.text}>No inventory items loaded. Save an item to review its facts.</Text> : null}
      </Section>
      {selectedItem ? <ItemReview key={selectedItem.id} item={selectedItem} onRecord={notes => record('review', notes)} /> : null}
      <OfferReview key={`offer-${selectedItem?.id ?? 'manual'}`} serious={canUse('offer_guardrails')} presets={snapshot?.preferences.shippingPresets ?? []} onRecord={notes => record('offer_review', notes)} />
    </> : null}
    {tab === 'history' ? <>
      <Section title="Manual activity and basic performance · everyone">
        <Text style={styles.text}>{stats.recordedActions} recorded actions · {stats.reviews} item reviews · {stats.draftReviews} draft reviews · {stats.offerReviews} offer reviews</Text>
        <Text style={styles.muted}>Counts cover your last 100 saved manual assistance actions. Draft reviews do not prove messages were sent; these counts are not sales, response rates or realized profit.</Text>
        {history.slice(0, visibleCount).map(entry => <View key={entry.id} style={styles.row}><Text style={styles.text}>{entry.itemTitle} · {entry.action.replaceAll('_', ' ')}</Text><Text style={styles.muted}>{new Date(entry.occurredAt).toLocaleString()}</Text><Text selectable style={styles.text}>{entry.notes}</Text></View>)}
        {history.length > visibleCount ? <Button title="Show more history" onPress={() => setVisibleCount(value => value + 20)} /> : null}
        <Button title="Open manual orders and realized results" onPress={() => router.push('/seller-center' as Href)} />
      </Section>
      <Section title="Advanced seller performance · Serious">
        <Text style={styles.muted}>{canUse('seller_analytics') ? 'Open Seller Center for server-gated advanced analytics based on its recorded orders.' : 'Serious access is required for advanced seller analytics. Manual order history remains available to everyone.'}</Text>
        {canUse('seller_analytics') ? <Button title="Open advanced seller performance" onPress={() => router.push('/seller-center' as Href)} /> : null}
      </Section>
    </> : null}
    <Text style={styles.muted}>Cross-marketplace inbox sync, automated replies, automatic offers, repricing, relisting, listing writes and marketplace policy changes are deferred. Shipping presets are saved preferences only.</Text>
  </ScrollView>;
}
