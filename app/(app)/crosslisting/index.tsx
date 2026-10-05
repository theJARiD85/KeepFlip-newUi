import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter, type Href } from 'expo-router';

import { InventoryScreen } from '@/components/crosslisting-lab/inventory-screen';
import type {
  InventoryProduct,
  NewInventoryProduct,
} from '@/components/crosslisting-lab/types';
import { createProduct, listProducts } from '@/services/crosslisting-lab-api';
import { useKeepFlipAuth } from '@/components/auth/keepflip-auth-context';

function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : 'Could not load your catalog.';
}

export default function CrosslistingInventoryRoute() {
  const router = useRouter();
  const { status } = useKeepFlipAuth();
  const [items, setItems] = useState<InventoryProduct[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (status !== 'signed-in') return;
    setIsLoading(true);
    setLoadError(null);
    try {
      setItems(await listProducts());
    } catch (error) {
      setLoadError(messageFrom(error));
    } finally {
      setIsLoading(false);
    }
  }, [status]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  async function add(item: NewInventoryProduct) {
    const saved = await createProduct(item);
    setItems((current) => [saved, ...current]);
    setLoadError(null);
  }

  return (
    <InventoryScreen
      items={items}
      isLoading={isLoading}
      loadError={loadError}
      onAddProduct={add}
      onOpenProduct={(item) => router.push(
        `/crosslisting/product/${encodeURIComponent(item.id)}` as Href,
      )}
      onRetry={() => { void load(); }}
    />
  );
}
