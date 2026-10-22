import { APPWRITE, tablesDB } from '@/lib/appwrite';
import { ensureUserProfile } from '@/services/user-profile-onboarding-service';

export const SHIPPING_MARKETPLACES = ['facebookMarketplace', 'offerUp'] as const;
export type ShippingMarketplace = (typeof SHIPPING_MARKETPLACES)[number];
export type MarketplaceShippingPreference = 'pickupOnly' | 'buyerPays' | 'sellerPays';
export type MarketplaceShippingPreferences = Record<ShippingMarketplace, MarketplaceShippingPreference | null>;

const PROFILE_COLUMNS: Record<ShippingMarketplace, string> = {
  facebookMarketplace: 'facebookShippingDefault',
  offerUp: 'offerUpShippingDefault',
};

export const SHIPPING_CHOICES: { value: MarketplaceShippingPreference; label: string }[] = [
  { value: 'pickupOnly', label: 'Local pickup only' },
  { value: 'buyerPays', label: 'Offer shipping · buyer pays' },
  { value: 'sellerPays', label: 'Offer shipping · seller pays' },
];

function parsePreference(value: unknown): MarketplaceShippingPreference | null {
  return value === 'pickupOnly' || value === 'buyerPays' || value === 'sellerPays' ? value : null;
}

function preferencesFromRow(row: Record<string, unknown>): MarketplaceShippingPreferences {
  return {
    facebookMarketplace: parsePreference(row[PROFILE_COLUMNS.facebookMarketplace]),
    offerUp: parsePreference(row[PROFILE_COLUMNS.offerUp]),
  };
}

export async function getMarketplaceShippingPreferences(userId: string, displayName?: string | null) {
  const row = await ensureUserProfile({ userId, displayName });
  return preferencesFromRow(row);
}

export async function saveMarketplaceShippingPreferences(
  userId: string,
  changes: Partial<Record<ShippingMarketplace, MarketplaceShippingPreference>>,
  displayName?: string | null,
) {
  const data: Record<string, string> = {};
  for (const marketplace of SHIPPING_MARKETPLACES) {
    const value = changes[marketplace];
    if (value === undefined) continue;
    if (parsePreference(value) !== value) throw new Error('Choose a valid shipping option.');
    data[PROFILE_COLUMNS[marketplace]] = value;
  }
  if (!Object.keys(data).length) throw new Error('Choose a shipping option to save.');

  const row = await ensureUserProfile({ userId, displayName });
  try {
    const updated = await tablesDB.updateRow({
      databaseId: APPWRITE.databaseId,
      tableId: APPWRITE.userProfilesTableId,
      rowId: row.$id,
      data: { ...data, updatedAt: new Date().toISOString() },
    });
    return preferencesFromRow(updated as Record<string, unknown>);
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : '';
    if (message.includes('facebookshippingdefault') || message.includes('offerupshippingdefault')) {
      throw new Error('The user_profiles shipping columns are not ready in Appwrite. Try again after the schema update.');
    }
    throw error;
  }
}
