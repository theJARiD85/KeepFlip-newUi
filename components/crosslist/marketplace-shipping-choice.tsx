import { Pressable, StyleSheet, View } from 'react-native';

import { KeepFlipText as Text } from '@/components/ui/keepflip-text';
import { keepFlipTheme as theme } from '@/constants/keepflip-theme';
import {
  SHIPPING_CHOICES,
  SHIPPING_MARKETPLACES,
  type MarketplaceShippingPreference,
  type MarketplaceShippingPreferences,
  type ShippingMarketplace,
} from '@/services/marketplace-shipping-preferences-service';

const MARKETPLACE_LABELS: Record<ShippingMarketplace, string> = {
  facebookMarketplace: 'Facebook Marketplace',
  offerUp: 'OfferUp',
};

export function MarketplaceShippingChoice({ marketplace, value, onChange, disabled = false, title }: {
  marketplace: ShippingMarketplace;
  value: MarketplaceShippingPreference | null;
  onChange: (value: MarketplaceShippingPreference) => void;
  disabled?: boolean;
  title?: string;
}) {
  return <View style={styles.group}>
    <Text style={styles.heading}>{title ?? MARKETPLACE_LABELS[marketplace]}</Text>
    <View style={styles.options}>{SHIPPING_CHOICES.map((choice) => {
      const checked = value === choice.value;
      return <Pressable
        key={choice.value}
        accessibilityLabel={`${MARKETPLACE_LABELS[marketplace]}: ${choice.label}`}
        accessibilityRole="radio"
        accessibilityState={{ checked, disabled }}
        disabled={disabled}
        onPress={() => onChange(choice.value)}
        style={[styles.option, checked && styles.optionSelected]}
      ><Text style={[styles.optionText, checked && styles.optionTextSelected]}>{checked ? '● ' : '○ '}{choice.label}</Text></Pressable>;
    })}</View>
  </View>;
}

export function ListingShippingReview({ selected, choices, defaults, confirmed, disabled, loading, error, onChange, onConfirm, onRetry }: {
  selected: readonly string[];
  choices: MarketplaceShippingPreferences;
  defaults: MarketplaceShippingPreferences;
  confirmed: boolean;
  disabled: boolean;
  loading: boolean;
  error: string | null;
  onChange: (marketplace: ShippingMarketplace, value: MarketplaceShippingPreference) => void;
  onConfirm: () => void;
  onRetry: () => void;
}) {
  const shippingMarketplaces = SHIPPING_MARKETPLACES.filter((marketplace) => selected.includes(marketplace));
  if (!shippingMarketplaces.length) return null;
  return <View style={styles.review}>
    <Text style={styles.reviewTitle}>Shipping for this item</Text>
    <Text style={styles.body}>Check your saved choice for each marketplace. An item change stays with this run; your first choice also becomes your default.</Text>
    {loading ? <Text style={styles.body}>Loading your shipping defaults…</Text> : null}
    {error ? <View style={styles.errorRow}><Text accessibilityRole="alert" style={styles.error}>{error}</Text><Pressable accessibilityRole="button" onPress={onRetry}><Text style={styles.retry}>Retry</Text></Pressable></View> : null}
    {!loading && !error ? shippingMarketplaces.map((marketplace) =>
      <View key={marketplace} style={styles.group}>
        <MarketplaceShippingChoice
          marketplace={marketplace}
          value={choices[marketplace]}
          onChange={(value) => onChange(marketplace, value)}
          disabled={disabled}
        />
        {defaults[marketplace] === null ? <Text style={styles.body}>No saved default yet. This choice will become your default when you start this listing.</Text> : null}
        <Text style={styles.body}>{marketplace === 'offerUp'
          ? 'Set and check this shipping choice in OfferUp before posting.'
          : 'KeepFlip will use this choice in the Facebook listing form. Check the result before posting.'}</Text>
      </View>,
    ) : null}
    {!loading && !error ? <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: confirmed, disabled: disabled || shippingMarketplaces.some((marketplace) => choices[marketplace] === null) }}
      disabled={disabled || shippingMarketplaces.some((marketplace) => choices[marketplace] === null)}
      onPress={onConfirm}
      style={[styles.confirm, confirmed && styles.confirmSelected]}
    ><Text style={styles.confirmText}>{confirmed ? '☑' : '☐'} I checked shipping for this item</Text></Pressable> : null}
  </View>;
}

const styles = StyleSheet.create({
  review: { gap: 10, borderWidth: 1, borderColor: theme.colors.dividerStrong, borderRadius: 9, backgroundColor: theme.colors.surfaceInset, padding: 12 },
  reviewTitle: { color: theme.colors.cream, fontSize: 13, fontWeight: '900' },
  group: { gap: 7 },
  heading: { color: theme.colors.cream, fontSize: 12, fontWeight: '800' },
  body: { color: theme.colors.textMuted, fontSize: 11, lineHeight: 16 },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  option: { minHeight: 40, justifyContent: 'center', borderWidth: 1, borderColor: theme.colors.dividerStrong, borderRadius: 8, paddingHorizontal: 10 },
  optionSelected: { borderColor: theme.colors.scannerCyan, backgroundColor: theme.colors.iconSurfaceCyan },
  optionText: { color: theme.colors.textMuted, fontSize: 11, fontWeight: '700' },
  optionTextSelected: { color: theme.colors.cream },
  confirm: { minHeight: 42, justifyContent: 'center', borderWidth: 1, borderColor: theme.colors.dividerStrong, borderRadius: 8, paddingHorizontal: 10 },
  confirmSelected: { borderColor: theme.colors.scannerCyan, backgroundColor: theme.colors.iconSurfaceCyan },
  confirmText: { color: theme.colors.cream, fontSize: 11, fontWeight: '800' },
  errorRow: { gap: 7 },
  error: { color: theme.colors.danger, fontSize: 11 },
  retry: { color: theme.colors.scannerCyan, fontSize: 11, fontWeight: '800' },
});
