import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import type { ImagePickerAsset } from 'expo-image-picker';
import { File } from 'expo-file-system';

import { useKeepFlipAuth } from '@/components/auth/keepflip-auth-context';
import { InventoryScreen } from '@/components/crosslisting-lab/inventory-screen';
import type {
  InventoryProduct,
  NewInventoryProduct,
} from '@/components/crosslisting-lab/types';
import { listInventoryItems, type InventoryItem } from '@/services/inventory-service';
import {
  createProduct,
  listProducts,
  uploadProductPhoto,
} from '@/services/crosslisting-lab-api';

function messageFrom(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export default function CrosslistingInventoryRoute() {
  const router = useRouter();
  const { status, user } = useKeepFlipAuth();
  const [items, setItems] = useState<InventoryProduct[]>([]);
  const [keepFlipItems, setKeepFlipItems] = useState<InventoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingInventory, setIsLoadingInventory] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [inventoryLoadError, setInventoryLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (status !== 'signed-in' || !user) {
      setIsLoading(false);
      setIsLoadingInventory(false);
      setItems([]);
      setKeepFlipItems([]);
      return;
    }

    setIsLoading(true);
    setIsLoadingInventory(true);
    setLoadError(null);
    setInventoryLoadError(null);

    const [labResult, inventoryResult] = await Promise.allSettled([
      listProducts(),
      listInventoryItems(user.$id),
    ]);

    if (labResult.status === 'fulfilled') {
      setItems(labResult.value);
    } else {
      setLoadError(messageFrom(labResult.reason, 'Could not load your crosslisting drafts.'));
    }
    if (inventoryResult.status === 'fulfilled') {
      setKeepFlipItems(inventoryResult.value);
    } else {
      setInventoryLoadError(messageFrom(inventoryResult.reason, 'Could not load KeepFlip inventory.'));
    }

    setIsLoading(false);
    setIsLoadingInventory(false);
  }, [status, user]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  async function add(item: NewInventoryProduct, images: ImagePickerAsset[]) {
    if (!user?.$id) throw new Error('Sign in to create a crosslisting draft.');

    const saved = await createProduct(item);
    const photoResults = await Promise.allSettled(
      images.map((image) => uploadProductPhoto(saved.id, user.$id, {
        uri: image.uri,
        fileName: image.fileName,
        fileSize: image.fileSize || new File(image.uri).size,
        mimeType: image.mimeType,
      })),
    );
    const failedPhotoCount = photoResults.filter((result) => result.status === 'rejected').length;

    setItems((current) => [saved, ...current]);
    setLoadError(null);
    return { product: saved, failedPhotoCount };
  }

  return (
    <InventoryScreen
      inventoryError={inventoryLoadError}
      inventoryItems={keepFlipItems}
      inventoryLoading={isLoadingInventory}
      items={items}
      isLoading={isLoading}
      loadError={loadError}
      onAddProduct={add}
      onOpenInventoryItem={(item) => router.push({
        pathname: '/listing-guide',
        params: { itemId: item.id },
      })}
      onOpenProduct={(item) => router.push(
        `/crosslisting/product/${encodeURIComponent(item.id)}` as Href,
      )}
      onRetry={() => { void load(); }}
      onRetryInventory={() => { void load(); }}
      onViewInventory={() => router.push('/inventory' as Href)}
    />
  );
}
