import {
  ExecutionMethod,
  ID,
  Permission,
  Role,
  functions,
  storage,
} from '@/lib/appwrite';
import type {
  InventoryProduct,
  MarketplaceConnectionStatus,
  MarketplaceId,
  NewInventoryProduct,
  ProductCondition,
  ProductPhoto,
  ListingJob,
} from '@/components/crosslisting-lab/types';

const crosslistingFunctionId =
  process.env.EXPO_PUBLIC_CROSSLISTING_FUNCTION_ID?.trim() ?? '';

export const CROSSLISTING_PHOTOS_BUCKET_ID = 'crosslisting_photos';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseJson(body: string): unknown {
  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new Error('The crosslisting service returned an invalid response.');
  }
}

async function execute(path: string, method: ExecutionMethod, payload?: Record<string, unknown>, extraHeaders: Record<string, string> = {}): Promise<unknown> {
  if (!crosslistingFunctionId) {
    throw new Error(
      'Crosslisting is not configured for this build. Use the crosslisting-lab build profile.',
    );
  }
  const execution = await functions.createExecution({
    functionId: crosslistingFunctionId,
    xpath: path,
    method,
    async: false,
    body: payload ? JSON.stringify(payload) : '',
    headers: payload ? { 'content-type': 'application/json', ...extraHeaders } : extraHeaders,
  });
  const response = execution.responseBody ? parseJson(execution.responseBody) : null;
  if (execution.responseStatusCode < 200 || execution.responseStatusCode >= 300) {
    if (execution.responseStatusCode === 401) {
      throw new Error('Your session expired. Sign out and sign in again.');
    }
    const message = isRecord(response)
      ? (typeof response.error === 'string' ? response.error : typeof response.message === 'string' ? response.message : null)
      : null;
    throw new Error(message?.slice(0, 200) || `Crosslisting request failed (${execution.responseStatusCode}).`);
  }
  return response;
}

function readProduct(value: unknown): InventoryProduct {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.title !== 'string') {
    throw new Error('The catalog response contains an invalid item.');
  }
  const price = Number(value.targetPrice);
  if (!Number.isFinite(price) || price < 0) {
    throw new Error('The catalog response contains an invalid price.');
  }
  const allowedConditions: ProductCondition[] = ['new_with_tags', 'new_without_tags', 'like_new', 'good', 'fair', 'for_parts'];
  const condition = typeof value.condition === 'string' && allowedConditions.some((item) => item === value.condition)
    ? value.condition as ProductCondition
    : undefined;
  return {
    id: value.id,
    title: value.title,
    targetPrice: price,
    condition,
    status: typeof value.status === 'string' ? value.status : undefined,
  };
}

export async function listProducts(): Promise<InventoryProduct[]> {
  const response = await execute('/v1/products', ExecutionMethod.GET);
  if (!isRecord(response) || !Array.isArray(response.products)) {
    throw new Error('The catalog response is missing its items.');
  }
  return response.products.map(readProduct);
}

export async function createProduct(item: NewInventoryProduct): Promise<InventoryProduct> {
  const response = await execute('/v1/products', ExecutionMethod.POST, {
    title: item.title,
    targetPrice: item.targetPrice,
    condition: item.condition,
  });
  if (!isRecord(response)) {
    throw new Error('The crosslisting service did not return the saved item.');
  }
  return readProduct(response.product);
}

const marketplaceIds = new Set<MarketplaceId>([
  'ebay', 'shopify', 'poshmark', 'mercari', 'depop', 'facebook_marketplace', 'offerup',
]);

function isMarketplaceId(value: unknown): value is MarketplaceId {
  return typeof value === 'string' && marketplaceIds.has(value as MarketplaceId);
}

function connectionStatus(value: unknown): MarketplaceConnectionStatus {
  if (value === 'connected' || value === 'active') return 'connected';
  if (value === 'expired' || value === 'error' || value === 'attention' || value === 'needs_attention') return 'attention';
  return 'disconnected';
}

export async function listConnections(): Promise<Partial<Record<MarketplaceId, MarketplaceConnectionStatus>>> {
  const response = await execute('/v1/connections', ExecutionMethod.GET);
  if (!isRecord(response) || !Array.isArray(response.connections)) {
    throw new Error('The connections response is missing its accounts.');
  }
  const statuses: Partial<Record<MarketplaceId, MarketplaceConnectionStatus>> = {};
  for (const connection of response.connections) {
    if (isRecord(connection) && isMarketplaceId(connection.platform)) {
      statuses[connection.platform] = connectionStatus(connection.status);
    }
  }
  return statuses;
}

export async function saveApiConnection(platform: 'ebay' | 'shopify', accessToken: string, providerAccountId?: string): Promise<void> {
  await execute('/v1/connections/api-token', ExecutionMethod.POST, {
    platform,
    accessToken,
    providerAccountId: providerAccountId?.trim() || null,
  });
}

export async function saveBrowserConnection(platform: Exclude<MarketplaceId, 'ebay' | 'shopify'>, storageState: string, providerAccountId?: string): Promise<void> {
  await execute('/v1/connections/browser-session', ExecutionMethod.POST, {
    platform,
    storageState,
    providerAccountId: providerAccountId?.trim() || null,
  });
}

export async function disconnectMarketplace(platform: MarketplaceId): Promise<void> {
  await execute(`/v1/connections/${platform}`, ExecutionMethod.DELETE);
}

export async function getProduct(id: string): Promise<InventoryProduct> {
  const response = await execute(`/v1/products/${encodeURIComponent(id)}`, ExecutionMethod.GET);
  if (!isRecord(response)) throw new Error('The item could not be loaded.');
  return readProduct(response.product);
}

function readJob(value: unknown): ListingJob {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.productId !== 'string'
    || !isMarketplaceId(value.marketplace) || typeof value.status !== 'string'
    || typeof value.createdAt !== 'string') {
    throw new Error('The listing job response is invalid.');
  }
  return {
    id: value.id,
    productId: value.productId,
    marketplace: value.marketplace,
    status: value.status,
    lastError: typeof value.lastError === 'string' ? value.lastError : null,
    createdAt: value.createdAt,
  };
}

export async function listListingJobs(productId: string): Promise<ListingJob[]> {
  const response = await execute('/v1/listing-jobs', ExecutionMethod.GET);
  if (!isRecord(response) || !Array.isArray(response.jobs)) throw new Error('Listing activity could not be loaded.');
  return response.jobs.map(readJob).filter((job) => job.productId === productId);
}

export async function queueListing(input: {
  productId: string;
  marketplace: MarketplaceId;
  listingPrice: number;
  platformFields: Record<string, unknown>;
  idempotencyKey?: string;
}): Promise<ListingJob> {
  const response = await execute('/v1/listing-jobs', ExecutionMethod.POST, {
    productId: input.productId,
    marketplace: input.marketplace,
    listingPrice: input.listingPrice,
    currency: 'USD',
    platformFields: input.platformFields,
  }, { 'idempotency-key': input.idempotencyKey ?? ID.unique() });
  if (!isRecord(response)) throw new Error('The listing job was not returned.');
  return readJob(response.job);
}

export async function listProductPhotos(productId: string): Promise<ProductPhoto[]> {
  const response = await execute(`/v1/products/${encodeURIComponent(productId)}/images`, ExecutionMethod.GET);
  if (!isRecord(response) || !Array.isArray(response.images)) throw new Error('Item photos could not be loaded.');
  return response.images.map((value: unknown) => {
    if (!isRecord(value) || typeof value.id !== 'string' || typeof value.fileId !== 'string'
      || typeof value.position !== 'number' || typeof value.viewUrl !== 'string') {
      throw new Error('An item photo response is invalid.');
    }
    return { id: value.id, fileId: value.fileId, position: value.position, viewUrl: value.viewUrl };
  });
}

export async function uploadProductPhoto(productId: string, ownerId: string, asset: {
  uri: string;
  fileName?: string | null;
  fileSize?: number;
  mimeType?: string | null;
}): Promise<void> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(asset.mimeType ?? '')) {
    throw new Error('Choose a JPG, PNG, or WebP photo.');
  }
  const mimeType = asset.mimeType as 'image/jpeg' | 'image/png' | 'image/webp';
  if (!asset.fileSize || asset.fileSize <= 0 || asset.fileSize > 12_000_000) {
    throw new Error('Choose a JPG, PNG, or WebP photo under 12 MB.');
  }
  const extension = mimeType === 'image/png' ? '.png' : mimeType === 'image/webp' ? '.webp' : '.jpg';
  const fileId = ID.unique();
  const permissions = [
    Permission.read(Role.user(ownerId)),
    Permission.update(Role.user(ownerId)),
    Permission.delete(Role.user(ownerId)),
  ];
  await storage.createFile({
    bucketId: CROSSLISTING_PHOTOS_BUCKET_ID,
    fileId,
    file: { name: asset.fileName || `${fileId}${extension}`, type: mimeType, size: asset.fileSize, uri: asset.uri },
    permissions,
  });
  try {
    await execute(`/v1/products/${encodeURIComponent(productId)}/images/attach`, ExecutionMethod.POST, { fileId });
  } catch (error) {
    await storage.deleteFile({ bucketId: 'crosslisting_photos', fileId }).catch(() => undefined);
    throw error;
  }
}

export async function deleteProductPhoto(productId: string, imageId: string): Promise<void> {
  await execute(`/v1/products/${encodeURIComponent(productId)}/images/${encodeURIComponent(imageId)}`, ExecutionMethod.DELETE);
}
