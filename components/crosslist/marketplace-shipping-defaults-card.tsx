import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { MarketplaceShippingChoice } from '@/components/crosslist/marketplace-shipping-choice';
import { KeepFlipText as Text } from '@/components/ui/keepflip-text';
import { keepFlipTheme as theme } from '@/constants/keepflip-theme';
import {
  getMarketplaceShippingPreferences,
  saveMarketplaceShippingPreferences,
  SHIPPING_MARKETPLACES,
  type MarketplaceShippingPreference,
  type MarketplaceShippingPreferences,
  type ShippingMarketplace,
} from '@/services/marketplace-shipping-preferences-service';
import type { ListingPlatform } from '@/services/listingService';

const EMPTY_PREFERENCES: MarketplaceShippingPreferences = { facebookMarketplace: null, offerUp: null };

export function MarketplaceShippingDefaultsCard({ userId, displayName, selections }: {
  userId: string;
  displayName?: string | null;
  selections: readonly ListingPlatform[];
}) {
  const selected = SHIPPING_MARKETPLACES.filter((marketplace) => selections.includes(marketplace));
  const selectedKey = selected.join(',');
  const [draft, setDraft] = useState<MarketplaceShippingPreferences>(EMPTY_PREFERENCES);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedKey) return;
    let mounted = true;
    void getMarketplaceShippingPreferences(userId, displayName).then((saved) => {
      if (mounted) setDraft(saved);
    }).catch((caught: unknown) => {
      if (mounted) setError(caught instanceof Error ? caught.message : 'Could not load shipping defaults.');
    }).finally(() => {
      if (mounted) setLoading(false);
    });
    return () => { mounted = false; };
  }, [displayName, selectedKey, userId]);

  if (!selected.length) return null;

  async function save() {
    const changes: Partial<Record<ShippingMarketplace, MarketplaceShippingPreference>> = {};
    for (const marketplace of selected) {
      const value = draft[marketplace];
      if (value === null) {
        setError('Choose a shipping option for each selected marketplace.');
        return;
      }
      changes[marketplace] = value;
    }
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const saved = await saveMarketplaceShippingPreferences(userId, changes, displayName);
      setDraft(saved);
      setNotice('Shipping defaults saved to your profile. You can change them for each item.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save shipping defaults.');
    } finally {
      setSaving(false);
    }
  }

  return <View style={styles.card}>
    <Text style={styles.title}>Shipping defaults</Text>
    <Text style={styles.body}>How do you usually want to handle shipping? These choices prefill each listing, and you can change them for an individual item.</Text>
    {loading ? <Text style={styles.body}>Loading your choices…</Text> : selected.map((marketplace) =>
      <MarketplaceShippingChoice
        key={marketplace}
        marketplace={marketplace}
        value={draft[marketplace]}
        disabled={saving}
        onChange={(value) => {
          setDraft((current) => ({ ...current, [marketplace]: value }));
          setError(null);
          setNotice(null);
        }}
      />,
    )}
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    {notice ? <Text style={styles.notice}>{notice}</Text> : null}
    <Pressable accessibilityRole="button" accessibilityState={{ disabled: loading || saving }} disabled={loading || saving} onPress={() => { void save(); }} style={[styles.save, (loading || saving) && styles.disabled]}>
      <Text style={styles.saveText}>{saving ? 'Saving…' : 'Save shipping defaults'}</Text>
    </Pressable>
  </View>;
}

const styles = StyleSheet.create({
  card: { gap: 10, borderWidth: 1, borderColor: theme.colors.dividerStrong, borderRadius: 12, backgroundColor: theme.colors.card, padding: 14 },
  title: { color: theme.colors.cream, fontSize: 14, fontWeight: '900' },
  body: { color: theme.colors.textMuted, fontSize: 11, lineHeight: 17 },
  error: { color: theme.colors.danger, fontSize: 11 },
  notice: { color: theme.colors.scannerCyan, fontSize: 11 },
  save: { minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: theme.colors.goldBright },
  saveText: { color: theme.colors.textOnAccent, fontSize: 12, fontWeight: '900' },
  disabled: { opacity: 0.6 },
});
