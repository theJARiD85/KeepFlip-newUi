import type { ListingPlatform } from '@/services/listingService';

export const MARKETPLACE_CHOICES: { id: ListingPlatform; label: string }[] = [
  { id: 'ebay', label: 'eBay' },
  { id: 'poshmark', label: 'Poshmark' },
  { id: 'mercari', label: 'Mercari' },
  { id: 'depop', label: 'Depop' },
  { id: 'facebookMarketplace', label: 'Facebook Marketplace' },
  { id: 'offerUp', label: 'OfferUp' },
];

export function normalizeMarketplaceSelections(value: unknown): ListingPlatform[] {
  if (!Array.isArray(value)) return [];
  return MARKETPLACE_CHOICES.map((choice) => choice.id).filter((id) => value.includes(id));
}
