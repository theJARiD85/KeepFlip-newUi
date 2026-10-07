import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useKeepFlipAuth } from '@/components/auth/keepflip-auth-context';
import { KeepFlipText as Text } from '@/components/ui/keepflip-text';
import { keepFlipTheme as theme } from '@/constants/keepflip-theme';
import { MARKETPLACE_CHOICES } from '@/lib/listing-marketplaces';
import { getInventoryItem, type InventoryItem } from '@/services/inventory-service';
import { parseSavedListingDraft } from '@/services/listing-draft-service';

function dateLabel(value: string | null | undefined) {
  if (!value) return 'Unknown';
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString() : 'Unknown';
}

function daysSince(value: string | null | undefined) {
  if (!value) return null;
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return null;
  return Math.max(0, Math.floor((Date.now() - time) / 86_400_000));
}

export function ListedListingDetail({ itemId, onBack, onEdit }: { itemId: string; onBack: () => void; onEdit: () => void }) {
  const { user } = useKeepFlipAuth();
  const [item, setItem] = useState<InventoryItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try { setItem(await getInventoryItem(user.$id, itemId)); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not load this listing.'); }
    finally { setLoading(false); }
  }, [itemId, user]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  const draft = parseSavedListingDraft(item?.listingJson);
  const confirmed = MARKETPLACE_CHOICES.filter((choice) => draft?.confirmedMarketplaces[choice.id]);
  const platformCount = confirmed.length + (item?.ebayListingId && !confirmed.some((choice) => choice.id === 'ebay') ? 1 : 0);
  const listedDays = daysSince(item?.listedAt);
  const targetPrice = draft?.listing.priceRange.targetPrice ?? item?.listingCurrentPrice ?? item?.estimatedValue;
  return <SafeAreaView edges={['top']} style={styles.safeArea}>
    <ScrollView contentContainerStyle={styles.content}>
      <Pressable accessibilityRole="button" onPress={onBack} style={styles.back}><Text style={styles.backText}>‹  Listing</Text></Pressable>
      {loading ? <ActivityIndicator color={theme.colors.goldBright} /> : error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : item ? <>
        <Text style={styles.eyebrow}>LISTED ITEM</Text>
        <Text style={styles.title}>{draft?.listing.title || item.title}</Text>
        <Text style={styles.meta}>{[item.brand, item.category, item.sku].filter(Boolean).join(' · ')}</Text>
        <View style={styles.stats}>
          <View style={styles.stat}><Text style={styles.statValue}>{platformCount}</Text><Text style={styles.statLabel}>MARKETPLACES TRACKED</Text></View>
          <View style={styles.stat}><Text style={styles.statValue}>{typeof targetPrice === 'number' ? `$${targetPrice.toFixed(0)}` : '—'}</Text><Text style={styles.statLabel}>SAVED ASK</Text></View>
          <View style={styles.stat}><Text style={styles.statValue}>{listedDays ?? '—'}</Text><Text style={styles.statLabel}>DAYS SINCE LISTED</Text></View>
        </View>
        <View style={styles.card}><Text style={styles.cardTitle}>Listing details</Text><Text style={styles.line}>First listed: {dateLabel(item.listedAt)}</Text><Text style={styles.line}>Draft last saved: {dateLabel(draft?.savedAt)}</Text><Text style={styles.line}>Condition: {item.condition}</Text><Text style={styles.line}>Available quantity: {item.quantityOnHand}</Text></View>
        <View style={styles.card}><Text style={styles.cardTitle}>Where it is listed</Text>
          {item.ebayListingId ? <Pressable accessibilityRole="link" onPress={() => { void Linking.openURL(`https://www.ebay.com/itm/${encodeURIComponent(item.ebayListingId!)}`); }}><Text style={styles.link}>eBay · Open live listing ↗</Text></Pressable> : null}
          {confirmed.map((choice) => {
            const saved = draft?.confirmedMarketplaces[choice.id];
            return saved?.externalUrl ? <Pressable key={choice.id} accessibilityRole="link" onPress={() => { void Linking.openURL(saved.externalUrl!); }}><Text style={styles.link}>{choice.label} · Open live listing ↗</Text></Pressable>
              : <Text key={choice.id} style={styles.line}>{choice.label} · Confirmed {dateLabel(saved?.confirmedAt)}</Text>;
          })}
          {!platformCount ? <Text style={styles.line}>No marketplace link is saved yet. Open Edit listing to review the draft and its posting status.</Text> : null}
        </View>
        {draft ? <View style={styles.card}><Text style={styles.cardTitle}>Saved listing copy</Text><Text style={styles.description}>{draft.listing.description}</Text></View> : null}
        <Text style={styles.statsNote}>Views, likes, and watchers are shown only when a marketplace provides verified metrics. KeepFlip does not have those numbers for this listing.</Text>
        <Pressable accessibilityRole="button" onPress={onEdit} style={styles.editButton}><Text style={styles.editText}>Edit listing →</Text></Pressable>
      </> : null}
    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.colors.backgroundDeep },
  content: { width: '100%', maxWidth: 820, alignSelf: 'center', padding: 18, paddingBottom: 40, gap: 14 },
  back: { paddingVertical: 10 }, backText: { color: theme.colors.scannerCyan, fontSize: 13, fontWeight: '800' },
  eyebrow: { color: theme.colors.goldBright, fontSize: 10, fontWeight: '900', letterSpacing: 1.2 },
  title: { color: theme.colors.cream, fontSize: 28, fontWeight: '900' },
  meta: { color: theme.colors.textMuted, fontSize: 12 },
  stats: { flexDirection: 'row', gap: 8 },
  stat: { flex: 1, padding: 12, borderWidth: 1, borderColor: theme.colors.dividerStrong, backgroundColor: theme.colors.card, borderRadius: 10, gap: 4 },
  statValue: { color: theme.colors.goldBright, fontSize: 20, fontWeight: '900' },
  statLabel: { color: theme.colors.textMuted, fontSize: 8, fontWeight: '800', letterSpacing: 0.6 },
  card: { borderWidth: 1, borderColor: theme.colors.dividerStrong, backgroundColor: theme.colors.card, borderRadius: 10, padding: 15, gap: 9 },
  cardTitle: { color: theme.colors.cream, fontSize: 15, fontWeight: '800' },
  line: { color: theme.colors.textMuted, fontSize: 12, lineHeight: 18 },
  description: { color: theme.colors.cream, fontSize: 12, lineHeight: 19 },
  link: { color: theme.colors.scannerCyan, fontSize: 12, fontWeight: '800' },
  statsNote: { color: theme.colors.textMuted, fontSize: 11, lineHeight: 16 },
  editButton: { minHeight: 46, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.goldBright, borderRadius: 9 },
  editText: { color: theme.colors.textOnAccent, fontSize: 13, fontWeight: '900' },
  error: { color: theme.colors.danger, fontSize: 12 },
});
