import { KeepFlipText as Text } from '@/components/ui/keepflip-text';
import { keepFlipTheme as theme } from '@/constants/keepflip-theme';
import { useResponsiveLayout } from '@/hooks/use-responsive-layout';
import responsiveFont from '@/lib/responsiveFont';
import { checkEbayListingReadiness, type EbayListingReadiness, type EbayListingReview } from '@/services/ebay-listing-readiness-service';
import type { PublishEbayListingInput } from '@/services/ebayListingService';
import { useRouter, type Href } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Switch, TextInput, View } from 'react-native';

import { useResponsiveStyles } from '@/hooks/use-responsive-layout';
const reviews: { key: Exclude<keyof EbayListingReview, 'measurements'>; label: string }[] = [
  { key: 'identityConfirmed', label: 'I checked the identity, title and model against this item.' },
  { key: 'photosReviewed', label: 'Photos clearly show the item, labels and any flaws.' },
  { key: 'conditionConfirmed', label: 'The description discloses wear, defects and testing limits.' },
  { key: 'measurementsConfirmed', label: 'I checked the measurements or marked them not applicable.' },
  { key: 'shippingConfirmed', label: 'Package, shipping costs and handling time are correct.' },
  { key: 'returnsConfirmed', label: 'I reviewed the return and payment policies.' },
];
const names: Record<string, string> = { connection: 'Connected seller account', title: 'Title', description: 'Description', price: 'Price', quantity: 'Available quantity', categoryId: 'Category', currency: 'Currency', sku: 'Seller SKU', merchantLocationKey: 'Inventory location', paymentPolicyId: 'Payment policy', fulfillmentPolicyId: 'Shipping policy', returnPolicyId: 'Return policy', condition: 'Condition', conditionDescription: 'Condition disclosure', photos: 'Saved photos', categoryRequirements: 'Current category requirements', measurements: 'Measurements' };

export function ListingReadinessPanel({ input, review, onReviewChange, onAspectsChange, onMeasurementsChange, onReadyChange, disabled = false }: {
  input: PublishEbayListingInput;
  review: EbayListingReview;
  onReviewChange: (value: EbayListingReview) => void;
  onAspectsChange: (value: Record<string, string[]>) => void;
  onMeasurementsChange: (value: Record<string, string[]>) => void;
  onReadyChange: (ready: boolean) => void;
  disabled?: boolean;
}) {
  const styles = useResponsiveStyles(createResponsiveStyles);
  const {
    responsiveFont
  } = useResponsiveLayout();

  const router = useRouter();
  const signature = JSON.stringify(input);
  const currentSignature = useRef(signature);
  currentSignature.current = signature;
  const [result, setResult] = useState<{ signature: string; data: EbayListingReadiness } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const requestNumber = useRef(0);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { onReadyChange(false); setError(''); }, [signature, onReadyChange]);
  const fresh = result?.signature === signature;
  async function check() {
    if (busy || disabled) return;
    const sequence = ++requestNumber.current;
    setBusy(true); setError(''); onReadyChange(false);
    try {
      const data = await checkEbayListingReadiness(input);
      if (!mounted.current || sequence !== requestNumber.current) return;
      setResult({ signature, data });
      onReadyChange(currentSignature.current === signature && data.ready);
    } catch (caught) { if (mounted.current) setError(caught instanceof Error ? caught.message : 'Could not check readiness.'); }
    finally { if (mounted.current && sequence === requestNumber.current) setBusy(false); }
  }
  return <View style={styles.panel}>
    <Text style={[styles.title, { fontSize: responsiveFont(20) }]}>Listing readiness {fresh && result ? `· ${result.data.score}/100` : ''}</Text>
    <Text style={[styles.hint, { fontSize: responsiveFont(13), lineHeight: 20 }]}>Confirm the physical item, then check category requirements, photos, stock and saved seller policies before publishing.</Text>
    {reviews.map(({ key, label }) => <View key={key} style={styles.row}><Text style={[styles.hint, { flex: 1 }]}>{label}</Text><Switch disabled={disabled || busy} accessibilityLabel={label} value={review[key]} onValueChange={(value) => onReviewChange({ ...review, [key]: value })} /></View>)}
    <Text style={[styles.hint, { fontSize: responsiveFont(13), lineHeight: 20 }]}>Measurements</Text>
    <View style={styles.row}>{(['provided', 'not_applicable'] as const).map((value) => <Pressable key={value} accessibilityRole="radio" accessibilityState={{ checked: review.measurements === value }} disabled={disabled || busy} style={[styles.button, review.measurements === value && styles.selected]} onPress={() => onReviewChange({ ...review, measurements: value, measurementsConfirmed: false })}><Text style={styles.link}>{value === 'provided' ? 'Add measurements' : 'Not applicable'}</Text></Pressable>)}</View>
    {review.measurements === 'provided' ? <TextInput accessibilityLabel="Item measurements with units" placeholder="For example: length 24 in, width 18 in" placeholderTextColor={theme.colors.textMuted} style={styles.input} multiline editable={!disabled && !busy} value={input.measurements?.Measurements?.[0] || ''} onChangeText={(value) => { onMeasurementsChange({ Measurements: value.trim() ? [value] : [] }); onReviewChange({ ...review, measurementsConfirmed: false }); }} /> : null}
    {result?.data.requiredAspects.map((aspect) => <View key={aspect.name} style={{ gap: 6 }}><Text style={[styles.hint, { fontSize: responsiveFont(13), lineHeight: 20 }]}>Required: {aspect.name}</Text><TextInput accessibilityLabel={`Required item specific ${aspect.name}`} editable={!disabled && !busy} style={styles.input} value={(input.aspects?.[aspect.name] ?? aspect.values).join(' | ')} onChangeText={(value) => onAspectsChange({ ...input.aspects, [aspect.name]: aspect.cardinality === 'MULTI' ? value.split('|').map(part => part.trim()).filter(Boolean) : value ? [value] : [] })} />
      {aspect.cardinality === 'MULTI' ? <Text style={[styles.hint, { fontSize: responsiveFont(13), lineHeight: 20 }]}>Separate multiple values with |.</Text> : null}
      {aspect.mode === 'SELECTION_ONLY' ? <Text selectable style={[styles.hint, { fontSize: responsiveFont(13), lineHeight: 20 }]}>Use an exact value: {aspect.allowedValues.slice(0, 40).join(', ')}{aspect.allowedValues.length > 40 ? '…' : ''}</Text> : null}
    </View>)}
    {result && !fresh ? <Text style={[styles.hint, { fontSize: responsiveFont(13), lineHeight: 20 }]}>The draft changed. Check readiness again.</Text> : null}
    {fresh ? result?.data.checks.map((check) => <Text key={check.id} style={check.complete ? styles.hint : styles.error}>{check.complete ? '✓ ' : '○ '}{names[check.id] || reviews.find(entry => `review.${entry.key}` === check.id)?.label || check.id.replace(/^aspects\./, 'Item specific: ')}{check.complete ? '' : ` — ${check.detail}`}</Text>) : null}
    {error ? <Text selectable style={[styles.error, { fontSize: responsiveFont(13), lineHeight: 20 }]}>{error}</Text> : null}
    <View style={styles.row}><Pressable accessibilityRole="button" disabled={busy || disabled} onPress={() => void check()} style={styles.button}>{busy ? <ActivityIndicator color={theme.colors.scannerCyan} /> : <Text style={styles.link}>Check readiness</Text>}</Pressable><Pressable accessibilityRole="link" disabled={busy || disabled} style={styles.button} onPress={() => router.push('/ebay-account' as Href)}><Text style={styles.link}>Seller policies</Text></Pressable></View>
    {fresh && result?.data.ready ? <Text style={styles.link}>Ready for your publish confirmation. eBay rechecks the listing when it is submitted.</Text> : null}
  </View>;
}
function createResponsiveStyles(responsiveLayout: ReturnType<typeof useResponsiveLayout>) {
  const { responsiveFont } = responsiveLayout;
  const staticStyles = StyleSheet.create({ panel: { gap: 12, backgroundColor: theme.colors.surfaceSoft, padding: 16, borderRadius: 18 }, title: { color: theme.colors.text, fontSize: 20 }, hint: { color: theme.colors.textMuted, fontSize: 13, lineHeight: 20 }, row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 12 }, button: { padding: 12, borderRadius: 10, minHeight: 44 }, selected: { borderWidth: 1, borderColor: theme.colors.gold }, input: { color: theme.colors.text, borderWidth: 1, borderColor: theme.colors.goldMuted, borderRadius: 10, padding: 10, minHeight: 44 }, error: { color: theme.colors.danger, fontSize: 13, lineHeight: 20 }, link: { color: theme.colors.scannerCyan, fontSize: 14 } });
  return {
    ...staticStyles,
    title: [
      staticStyles.title,
      {
        fontSize: responsiveFont(20),
      },
    ],
    hint: [
      staticStyles.hint,
      {
        fontSize: responsiveFont(13),
      },
    ],
    error: [
      staticStyles.error,
      {
        fontSize: responsiveFont(13),
      },
    ],
    link: [
      staticStyles.link,
      {
        fontSize: responsiveFont(14),
      },
    ],
  };
}
