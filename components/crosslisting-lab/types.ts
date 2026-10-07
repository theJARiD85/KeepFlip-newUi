export type ProductCondition =
  | 'new_with_tags'
  | 'new_without_tags'
  | 'like_new'
  | 'good'
  | 'fair'
  | 'for_parts';

export interface InventoryProduct {
  id: string;
  title: string;
  targetPrice: number;
  condition?: ProductCondition;
  status?: string;
}

export interface NewInventoryProduct {
  title: string;
  targetPrice: number;
  condition: ProductCondition;
}

export const channels = [
  { id: 'ebay', name: 'eBay', method: 'Official API', type: 'API' },
  { id: 'shopify', name: 'Shopify', method: 'Admin GraphQL API', type: 'API' },
  { id: 'poshmark', name: 'Poshmark', method: 'In-app WebView assist', type: 'WEB' },
  { id: 'mercari', name: 'Mercari', method: 'In-app WebView assist', type: 'WEB' },
  { id: 'depop', name: 'Depop', method: 'In-app WebView assist', type: 'WEB' },
  { id: 'facebook_marketplace', name: 'Facebook Marketplace', method: 'In-app WebView assist', type: 'WEB' },
  { id: 'offerup', name: 'OfferUp', method: 'In-app WebView assist', type: 'WEB' },
] as const;

export type MarketplaceId = (typeof channels)[number]['id'];
export type MarketplaceConnectionStatus = 'connected' | 'disconnected' | 'attention';

export interface ListingJob {
  id: string;
  productId: string;
  marketplace: MarketplaceId;
  status: string;
  lastError?: string | null;
  createdAt: string;
}

export interface ProductPhoto {
  id: string;
  fileId: string;
  position: number;
  viewUrl: string;
}
