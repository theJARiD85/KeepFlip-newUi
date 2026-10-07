import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter, type Href } from 'expo-router';

import { useKeepFlipAuth } from '@/components/auth/keepflip-auth-context';
import { ListingCreationGuideScreen } from '@/components/listing/listing-creation-guide-screen';
import { ListingHubScreen } from '@/components/listing/listing-hub-screen';
import { ListedListingDetail } from '@/components/listing/listed-listing-detail';
import { listListingInventoryPage, type InventoryItem } from '@/services/inventory-service';
import { getMarketplaceSelections, saveMarketplaceSelections } from '@/services/marketplace-selections-service';
import type { ListingPlatform } from '@/services/listingService';

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export default function ListingRoute() {
  const router = useRouter();
  const { status, user } = useKeepFlipAuth();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selections, setSelections] = useState<ListingPlatform[]>([]);
  const [savingSelections, setSavingSelections] = useState(false);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [editingListedItem, setEditingListedItem] = useState(false);

  const refresh = useCallback(async () => {
    if (status !== 'signed-in' || !user) {
      setItems([]); setNextCursor(null); setLoading(false); return;
    }
    setLoading(true);
    setError(null);
    const [inventoryResult, selectionResult] = await Promise.allSettled([
      listListingInventoryPage(user.$id),
      getMarketplaceSelections(user.$id, user.name),
    ]);
    if (inventoryResult.status === 'fulfilled') {
      setItems(inventoryResult.value.items);
      setNextCursor(inventoryResult.value.nextCursor);
    } else {
      setError(errorMessage(inventoryResult.reason, 'Could not load your listing items.'));
    }
    if (selectionResult.status === 'fulfilled') setSelections(selectionResult.value);
    else setSelectionError(errorMessage(selectionResult.reason, 'Could not load your marketplaces.'));
    setLoading(false);
  }, [status, user]);

  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));

  async function loadMore() {
    if (!user || !nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await listListingInventoryPage(user.$id, nextCursor);
      setItems((current) => [...current, ...page.items.filter((item) => !current.some((existing) => existing.id === item.id))]);
      setNextCursor(page.nextCursor);
    } catch (caught) {
      setError(errorMessage(caught, 'Could not load more items.'));
    } finally {
      setLoadingMore(false);
    }
  }

  async function saveSelections(value: ListingPlatform[]) {
    if (!user) return;
    setSavingSelections(true);
    setSelectionError(null);
    try {
      setSelections(await saveMarketplaceSelections(user.$id, value, user.name));
    } catch (caught) {
      setSelectionError(errorMessage(caught, 'Could not save marketplaces.'));
    } finally {
      setSavingSelections(false);
    }
  }

  if (selectedItem) {
    return selectedItem.isListed && !editingListedItem ? (
      <ListedListingDetail itemId={selectedItem.id} onBack={() => { setSelectedItem(null); void refresh(); }} onEdit={() => setEditingListedItem(true)} />
    ) : (
      <ListingCreationGuideScreen itemIdOverride={selectedItem.id} onBack={() => { setSelectedItem(null); setEditingListedItem(false); void refresh(); }} selectedMarketplaces={selections} />
    );
  }

  return <ListingHubScreen
    items={items}
    loading={loading}
    loadingMore={loadingMore}
    hasMore={Boolean(nextCursor)}
    error={error}
    selections={selections}
    savingSelections={savingSelections}
    selectionError={selectionError}
    onSaveSelections={(value) => { void saveSelections(value); }}
    onOpenItem={setSelectedItem}
    onLoadMore={() => { void loadMore(); }}
    onRefresh={() => { void refresh(); }}
    onAddItem={() => router.push('/inventory' as Href)}
  />;
}
