import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { KeepFlipText as Text, KeepFlipTextInput as TextInput } from '@/components/ui/keepflip-text';
import { keepFlipTheme as theme } from '@/constants/keepflip-theme';
import { MARKETPLACE_CHOICES } from '@/lib/listing-marketplaces';
import { resolveInventoryCoverImageUri } from '@/services/inventory-cover-image';
import type { InventoryItem } from '@/services/inventory-service';
import { parseSavedListingDraft } from '@/services/listing-draft-service';
import type { ListingPlatform } from '@/services/listingService';

type ListingTab = 'listed' | 'not-listed';

type Props = {
  items: InventoryItem[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  error: string | null;
  selections: ListingPlatform[];
  savingSelections: boolean;
  selectionError: string | null;
  onSaveSelections: (value: ListingPlatform[]) => void;
  onOpenItem: (item: InventoryItem) => void;
  onLoadMore: () => void;
  onRefresh: () => void;
  onAddItem: () => void;
};

function ListingItemCard({ item, onPress }: { item: InventoryItem; onPress: () => void }) {
  const [imageUri, setImageUri] = useState<string | null>(null);
  useEffect(() => {
    let mounted = true;
    void resolveInventoryCoverImageUri(item.coverPhotoId).then((uri) => {
      if (mounted) setImageUri(uri);
    }).catch(() => undefined);
    return () => { mounted = false; };
  }, [item.coverPhotoId]);
  const draft = parseSavedListingDraft(item.listingJson);
  const confirmed = Object.keys(draft?.confirmedMarketplaces ?? {}).length;
  const price = draft?.listing.priceRange.targetPrice ?? item.estimatedValue;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${item.title}, ${item.isListed ? 'listed' : 'not listed'}`} onPress={onPress} style={({ pressed }) => [styles.itemCard, pressed && styles.pressed]}>
      {imageUri ? <Image contentFit="cover" source={{ uri: imageUri }} style={styles.thumbnail} /> : <View style={styles.thumbnailFallback}><Text style={styles.thumbnailGlyph}>◇</Text></View>}
      <View style={styles.itemCopy}>
        <Text numberOfLines={2} style={styles.itemTitle}>{item.title}</Text>
        <Text numberOfLines={1} style={styles.itemMeta}>{[item.brand, item.category, item.sku].filter(Boolean).join(' · ') || 'Saved inventory'}</Text>
        <Text style={styles.itemStatus}>{item.isListed ? `${confirmed || (item.ebayListingId ? 1 : 0)} marketplace${confirmed || item.ebayListingId ? 's' : ''} tracked` : draft ? 'Draft ready to finish' : 'Ready to prepare'}</Text>
      </View>
      <View style={styles.itemRight}>
        <Text style={styles.price}>{typeof price === 'number' && Number.isFinite(price) ? `$${price.toFixed(0)}` : '—'}</Text>
        <Text style={styles.arrow}>›</Text>
      </View>
    </Pressable>
  );
}

export function ListingHubScreen({ items, loading, loadingMore, hasMore, error, selections, savingSelections, selectionError, onSaveSelections, onOpenItem, onLoadMore, onRefresh, onAddItem }: Props) {
  const [tab, setTab] = useState<ListingTab>('not-listed');
  const [query, setQuery] = useState('');
  const [editingPreferences, setEditingPreferences] = useState(false);
  const [draftSelections, setDraftSelections] = useState<ListingPlatform[]>(selections);
  useEffect(() => { if (!editingPreferences) setDraftSelections(selections); }, [editingPreferences, selections]);
  const visible = items.filter((item) => {
    if (tab === 'listed' ? !item.isListed : item.isListed) return false;
    const needle = query.trim().toLocaleLowerCase();
    return !needle || [item.title, item.brand, item.category, item.sku].some((value) => value?.toLocaleLowerCase().includes(needle));
  });
  const listedCount = items.filter((item) => item.isListed).length;
  const notListedCount = items.length - listedCount;
  const selectedLabels = MARKETPLACE_CHOICES.filter((choice) => selections.includes(choice.id)).map((choice) => choice.label);
  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <FlatList
        contentContainerStyle={styles.listContent}
        data={visible}
        keyExtractor={(item) => item.id}
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        windowSize={7}
        onEndReached={() => { if (hasMore && !loadingMore) onLoadMore(); }}
        onEndReachedThreshold={0.6}
        refreshing={loading && items.length > 0}
        onRefresh={onRefresh}
        ListHeaderComponent={<View style={styles.header}>
          <Text style={styles.eyebrow}>KEEPFLIP / LISTING</Text>
          <Text style={styles.heading}>Your listing desk</Text>
          <Text style={styles.intro}>Pick an item. Flip prepares the draft, then KeepFlip helps you list it where you sell.</Text>
          <View style={styles.preferenceCard}>
            <View style={styles.preferenceHeading}>
              <View style={styles.preferenceCopy}><Text style={styles.preferenceTitle}>Your marketplaces</Text><Text style={styles.preferenceBody}>{selectedLabels.length ? selectedLabels.join(' · ') : 'Tell Flip where you usually sell.'}</Text></View>
              <Pressable accessibilityRole="button" onPress={() => setEditingPreferences((current) => !current)} style={styles.editButton}><Text style={styles.editText}>{editingPreferences ? 'Done' : 'Edit'}</Text></Pressable>
            </View>
            {editingPreferences ? <View style={styles.preferenceChoices}>
              {MARKETPLACE_CHOICES.map((choice) => {
                const checked = draftSelections.includes(choice.id);
                return <Pressable key={choice.id} accessibilityRole="checkbox" accessibilityState={{ checked }} onPress={() => setDraftSelections((current) => checked ? current.filter((id) => id !== choice.id) : [...current, choice.id])} style={[styles.choice, checked && styles.choiceActive]}><Text style={[styles.choiceText, checked && styles.choiceTextActive]}>{checked ? '✓ ' : '+ '}{choice.label}</Text></Pressable>;
              })}
              <Pressable accessibilityRole="button" disabled={savingSelections} onPress={() => { onSaveSelections(draftSelections); setEditingPreferences(false); }} style={[styles.saveButton, savingSelections && styles.disabled]}><Text style={styles.saveText}>{savingSelections ? 'Saving…' : 'Save marketplaces'}</Text></Pressable>
            </View> : null}
            {selectionError ? <Text accessibilityRole="alert" style={styles.errorText}>{selectionError}</Text> : null}
          </View>
          <View style={styles.tabs} accessibilityRole="tablist">
            <Pressable accessibilityRole="tab" accessibilityState={{ selected: tab === 'not-listed' }} onPress={() => setTab('not-listed')} style={[styles.tab, tab === 'not-listed' && styles.activeTab]}><Text style={[styles.tabText, tab === 'not-listed' && styles.activeTabText]}>Not listed · {notListedCount}</Text></Pressable>
            <Pressable accessibilityRole="tab" accessibilityState={{ selected: tab === 'listed' }} onPress={() => setTab('listed')} style={[styles.tab, tab === 'listed' && styles.activeTab]}><Text style={[styles.tabText, tab === 'listed' && styles.activeTabText]}>Listed · {listedCount}</Text></Pressable>
          </View>
          <TextInput accessibilityLabel="Search listing items" autoCapitalize="none" onChangeText={setQuery} placeholder="Search item, brand, or SKU" placeholderTextColor={theme.colors.textMuted} style={styles.search} value={query} />
          {error ? <Text accessibilityRole="alert" style={styles.errorText}>{error}</Text> : null}
        </View>}
        ListEmptyComponent={<View style={styles.emptyCard}>{loading ? <ActivityIndicator color={theme.colors.goldBright} /> : <><Text style={styles.emptyTitle}>{query ? 'No matching items' : tab === 'listed' ? 'No listed items yet' : 'Nothing to list yet'}</Text><Text style={styles.emptyBody}>{query ? 'Try another search.' : tab === 'listed' ? 'Items you publish or confirm will show here.' : 'Add a saved item, then Flip can prepare its listing.'}</Text>{!query && tab === 'not-listed' ? <Pressable accessibilityRole="button" onPress={onAddItem} style={styles.saveButton}><Text style={styles.saveText}>Open inventory</Text></Pressable> : null}</>}</View>}
        ListFooterComponent={loadingMore ? <ActivityIndicator color={theme.colors.goldBright} style={styles.footer} /> : hasMore ? <Pressable accessibilityRole="button" onPress={onLoadMore} style={styles.moreButton}><Text style={styles.moreText}>Load more items</Text></Pressable> : null}
        renderItem={({ item }) => <ListingItemCard item={item} onPress={() => onOpenItem(item)} />}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.colors.backgroundDeep },
  listContent: { width: '100%', maxWidth: 820, alignSelf: 'center', paddingHorizontal: 16, paddingBottom: 40 },
  header: { paddingTop: 24, gap: 12, paddingBottom: 14 },
  eyebrow: { color: theme.colors.goldBright, fontSize: 10, fontWeight: '900', letterSpacing: 1.4 },
  heading: { color: theme.colors.cream, fontSize: 30, fontWeight: '900' },
  intro: { color: theme.colors.textMuted, fontSize: 13, lineHeight: 19 },
  preferenceCard: { backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.dividerStrong, borderRadius: 12, padding: 14, gap: 10 },
  preferenceHeading: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  preferenceCopy: { flex: 1, gap: 3 },
  preferenceTitle: { color: theme.colors.cream, fontSize: 14, fontWeight: '800' },
  preferenceBody: { color: theme.colors.textMuted, fontSize: 11, lineHeight: 16 },
  editButton: { paddingVertical: 8, paddingHorizontal: 10 },
  editText: { color: theme.colors.scannerCyan, fontSize: 12, fontWeight: '800' },
  preferenceChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choice: { borderWidth: 1, borderColor: theme.colors.dividerStrong, borderRadius: 20, paddingHorizontal: 11, paddingVertical: 9 },
  choiceActive: { borderColor: theme.colors.scannerCyan, backgroundColor: theme.colors.iconSurfaceCyan },
  choiceText: { color: theme.colors.textMuted, fontSize: 11, fontWeight: '700' },
  choiceTextActive: { color: theme.colors.scannerCyan },
  saveButton: { minHeight: 40, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.colors.goldBright, borderRadius: 8, paddingHorizontal: 14 },
  saveText: { color: theme.colors.textOnAccent, fontSize: 12, fontWeight: '900' },
  disabled: { opacity: 0.6 },
  tabs: { flexDirection: 'row', borderWidth: 1, borderColor: theme.colors.dividerStrong, borderRadius: 9, overflow: 'hidden' },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center', justifyContent: 'center' },
  activeTab: { backgroundColor: theme.colors.goldBright },
  tabText: { color: theme.colors.textMuted, fontSize: 12, fontWeight: '800' },
  activeTabText: { color: theme.colors.textOnAccent },
  search: { height: 44, backgroundColor: theme.colors.surfaceInset, borderWidth: 1, borderColor: theme.colors.dividerStrong, borderRadius: 8, color: theme.colors.cream, paddingHorizontal: 13 },
  itemCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 11, marginBottom: 9, borderWidth: 1, borderColor: theme.colors.dividerStrong, borderRadius: 11, backgroundColor: theme.colors.card },
  pressed: { opacity: 0.72 },
  thumbnail: { width: 58, height: 58, borderRadius: 8 },
  thumbnailFallback: { width: 58, height: 58, borderRadius: 8, backgroundColor: theme.colors.iconSurfaceCyan, alignItems: 'center', justifyContent: 'center' },
  thumbnailGlyph: { color: theme.colors.scannerCyan, fontSize: 26 },
  itemCopy: { flex: 1, minWidth: 0, gap: 3 },
  itemTitle: { color: theme.colors.cream, fontSize: 14, fontWeight: '800' },
  itemMeta: { color: theme.colors.textMuted, fontSize: 10 },
  itemStatus: { color: theme.colors.scannerCyan, fontSize: 10, fontWeight: '700' },
  itemRight: { alignItems: 'flex-end', gap: 3 },
  price: { color: theme.colors.goldBright, fontSize: 15, fontWeight: '900' },
  arrow: { color: theme.colors.textMuted, fontSize: 23 },
  emptyCard: { marginTop: 20, padding: 25, alignItems: 'center', gap: 7, borderWidth: 1, borderColor: theme.colors.dividerStrong, borderRadius: 11, backgroundColor: theme.colors.card },
  emptyTitle: { color: theme.colors.cream, fontSize: 15, fontWeight: '800' },
  emptyBody: { color: theme.colors.textMuted, fontSize: 12, textAlign: 'center', lineHeight: 18 },
  errorText: { color: theme.colors.danger, fontSize: 12 },
  footer: { paddingVertical: 15 },
  moreButton: { paddingVertical: 15, alignItems: 'center' },
  moreText: { color: theme.colors.scannerCyan, fontSize: 12, fontWeight: '800' },
});
