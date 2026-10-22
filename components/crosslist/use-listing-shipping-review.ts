import { useEffect, useState } from 'react';

import {
  getMarketplaceShippingPreferences,
  saveMarketplaceShippingPreferences,
  SHIPPING_MARKETPLACES,
  type MarketplaceShippingPreference,
  type MarketplaceShippingPreferences,
  type ShippingMarketplace,
} from '@/services/marketplace-shipping-preferences-service';

const EMPTY_PREFERENCES: MarketplaceShippingPreferences = { facebookMarketplace: null, offerUp: null };

export function useListingShippingReview(userId: string) {
  const [defaults, setDefaults] = useState<MarketplaceShippingPreferences>(EMPTY_PREFERENCES);
  const [choices, setChoices] = useState<MarketplaceShippingPreferences>(EMPTY_PREFERENCES);
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    if (!userId) return;
    let mounted = true;
    void getMarketplaceShippingPreferences(userId).then((saved) => {
      if (!mounted) return;
      setError(null);
      setDefaults(saved);
      setChoices(saved);
      setConfirmed(false);
    }).catch((caught: unknown) => {
      if (mounted) setError(caught instanceof Error ? caught.message : 'Could not load shipping defaults.');
    }).finally(() => {
      if (mounted) setLoading(false);
    });
    return () => { mounted = false; };
  }, [retryCount, userId]);

  function reload() {
    setLoading(true);
    setError(null);
    setRetryCount((current) => current + 1);
  }

  function setChoice(marketplace: ShippingMarketplace, value: MarketplaceShippingPreference) {
    setChoices((current) => ({ ...current, [marketplace]: value }));
    setConfirmed(false);
  }

  async function prepareForRun(selected: readonly string[]) {
    const shippingMarketplaces = SHIPPING_MARKETPLACES.filter((marketplace) => selected.includes(marketplace));
    if (!shippingMarketplaces.length) return {};
    if (loading || error) throw new Error('Load your shipping defaults before starting this listing.');
    if (shippingMarketplaces.some((marketplace) => choices[marketplace] === null)) {
      throw new Error('Choose a shipping option for each selected marketplace.');
    }
    if (!confirmed) throw new Error('Confirm the shipping choices for this item before starting.');

    const missingDefaults: Partial<Record<ShippingMarketplace, MarketplaceShippingPreference>> = {};
    for (const marketplace of shippingMarketplaces) {
      if (defaults[marketplace] === null) missingDefaults[marketplace] = choices[marketplace]!;
    }
    if (Object.keys(missingDefaults).length) {
      const saved = await saveMarketplaceShippingPreferences(userId, missingDefaults);
      setDefaults(saved);
    }
    const runChoices: Partial<Record<ShippingMarketplace, MarketplaceShippingPreference>> = {};
    for (const marketplace of shippingMarketplaces) runChoices[marketplace] = choices[marketplace]!;
    return runChoices;
  }

  return {
    defaults, choices, confirmed, loading, error, reload, setChoice,
    toggleConfirmed: () => setConfirmed((current) => !current),
    resetConfirmation: () => setConfirmed(false),
    prepareForRun,
  };
}
