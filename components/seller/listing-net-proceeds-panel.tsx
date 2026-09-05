import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Switch, TextInput, View } from 'react-native';
import { KeepFlipText as Text } from '@/components/ui/keepflip-text';
import { useKeepFlipSubscription } from '@/components/subscription/keepflip-subscription-context';
import { keepFlipTheme as theme } from '@/constants/keepflip-theme';
import { calculateNetProceeds, type NetProceedsInput } from '@/lib/seller-net-proceeds';
import { loadSellerProceedsPlan, saveSellerProceedsPlan } from '@/services/seller-net-proceeds-service';
import type { InventoryItem } from '@/services/inventory-service';

type NumericField = Exclude<keyof NetProceedsInput, 'feesIncludeCollectedTax'>;
const fields: { key: NumericField; label: string; percent?: boolean }[] = [
  { key: 'salePriceCents', label: 'Target sale price' },
  { key: 'acquisitionCostCents', label: 'Acquisition cost per unit' },
  { key: 'shippingExpenseCents', label: 'Shipping expense' },
  { key: 'marketplaceFeeBps', label: 'Marketplace fee %', percent: true },
  { key: 'fixedFeeCents', label: 'Fixed marketplace fee' },
  { key: 'buyerShippingCents', label: 'Shipping paid by buyer' },
  { key: 'packagingCents', label: 'Packaging / preparation' },
  { key: 'discountCents', label: 'Seller discount' },
  { key: 'promotedFeeBps', label: 'Promoted listing fee %', percent: true },
  { key: 'refundAllowanceCents', label: 'Refund allowance' },
  { key: 'marketplaceCollectedTaxCents', label: 'Tax collected by marketplace' },
  { key: 'sellerTaxReserveCents', label: 'Your additional tax reserve' },
];

function parseValue(value: string): number | null {
  if (!value.trim()) return null;
  if (!/^\d+(\.\d{0,2})?$/.test(value)) throw new Error('Use positive numbers with at most two decimal places.');
  return Math.round(Number(value) * 100);
}

export function ListingNetProceedsPanel({ item, ownerId, prices, onTargetPriceChange }: {
  item: InventoryItem; ownerId: string;
  prices: { quickSale: number; targetPrice: number; highAsk: number };
  onTargetPriceChange: (price: number) => void;
}) {
  const { canUse } = useKeepFlipSubscription();
  const scenariosAllowed = canUse('net_proceeds_scenarios');
  const [values, setValues] = useState<Record<NumericField, string>>(() => ({
    salePriceCents: String(prices.targetPrice),
    acquisitionCostCents: item.quantityPurchased === 1 && item.acquisitionCost !== null ? String(item.acquisitionCost) : '',
    shippingExpenseCents: '', marketplaceFeeBps: '', fixedFeeCents: '0', buyerShippingCents: '0',
    packagingCents: '0', discountCents: '0', promotedFeeBps: '0', refundAllowanceCents: '0',
    marketplaceCollectedTaxCents: '0', sellerTaxReserveCents: '0',
  }));
  const [quick, setQuick] = useState(String(prices.quickSale));
  const [high, setHigh] = useState(String(prices.highAsk));
  const [includeTax, setIncludeTax] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState('');
  const money = (cents: number | null) => cents === null ? 'Needs inputs' : new Intl.NumberFormat('en-US', { style: 'currency', currency: item.currency || 'USD' }).format(cents / 100);
  useEffect(() => {
    let current = true;
    void loadSellerProceedsPlan(ownerId, item.id).then((plan) => {
      if (!current || !plan) return;
      if (plan.currency !== item.currency) { setMessage('Saved plan uses a different currency. Review all amounts.'); return; }
      setValues(Object.fromEntries(fields.map(({ key }) => [key, plan.input[key] === null ? '' : String(Number(plan.input[key]) / 100)])) as Record<NumericField, string>);
      setIncludeTax(plan.input.feesIncludeCollectedTax);
      setQuick(plan.quickSaleCents === null ? '' : String(plan.quickSaleCents / 100));
      setHigh(plan.highAskCents === null ? '' : String(plan.highAskCents / 100));
    }).catch((error) => { if (current) setMessage(error instanceof Error ? error.message : 'Could not load saved proceeds.'); })
      .finally(() => { if (current) setBusy(false); });
    return () => { current = false; };
  }, [item.id, item.currency, ownerId]);
  const calculation = useMemo(() => {
    try {
      const parsed = Object.fromEntries(fields.map(({ key }) => [key, parseValue(values[key])])) as Record<NumericField, number | null>;
      for (const { key } of fields) {
        if (parsed[key] === null && !['acquisitionCostCents', 'shippingExpenseCents', 'marketplaceFeeBps'].includes(key)) throw new Error(`Enter ${fields.find((field) => field.key === key)?.label.toLowerCase()}, or 0 if it does not apply.`);
      }
      const input = { ...parsed, feesIncludeCollectedTax: includeTax } as NetProceedsInput;
      return { input, projection: calculateNetProceeds(input), error: '' };
    } catch (error) { return { input: null, projection: null, error: error instanceof Error ? error.message : 'Review your inputs.' }; }
  }, [values, includeTax]);
  const scenarioRows = [{ label: 'Target', cents: calculation.input?.salePriceCents ?? null }];
  if (scenariosAllowed) {
    try { scenarioRows.unshift({ label: 'Quick sale', cents: parseValue(quick) }); scenarioRows.push({ label: 'High ask', cents: parseValue(high) }); } catch { /* Invalid scenario remains editable below. */ }
  }
  async function save() {
    if (!calculation.input) return;
    setBusy(true); setMessage('');
    try {
      await saveSellerProceedsPlan(ownerId, item.id, { version: 1, currency: item.currency || 'USD', input: calculation.input, quickSaleCents: parseValue(quick), highAskCents: parseValue(high) });
      setMessage('Proceeds assumptions saved. These estimates do not post transactions to Books.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save proceeds.'); }
    finally { setBusy(false); }
  }
  return <View style={styles.panel}>
    <Text style={styles.title}>Net proceeds</Text>
    <Text style={styles.hint}>Estimates per unit in {item.currency}. For a quantity listing, allocate acquisition, shipping and packaging costs to one unit. Blank costs stay unknown.</Text>
    {busy ? <ActivityIndicator color={theme.colors.scannerCyan} /> : null}
    <View style={styles.grid}>{fields.slice(0, expanded ? fields.length : 5).map((field) => <View key={field.key} style={styles.field}>
      <Text style={styles.hint}>{field.label}</Text>
      <TextInput accessibilityLabel={field.label} editable={!busy} keyboardType="decimal-pad" value={values[field.key]} placeholder="Unknown" placeholderTextColor={theme.colors.textMuted} style={styles.input}
        onChangeText={(value) => setValues((current) => ({ ...current, [field.key]: value }))} />
    </View>)}</View>
    <Pressable accessibilityRole="button" onPress={() => setExpanded(!expanded)}><Text style={styles.link}>{expanded ? 'Fewer inputs' : 'Discounts, packaging, promotion, refunds and taxes'}</Text></Pressable>
    {expanded ? <View style={styles.row}><Text style={[styles.hint, { flex: 1 }]}>Include marketplace-collected tax in percentage fee base</Text><Switch accessibilityLabel="Fees include marketplace collected tax" value={includeTax} onValueChange={setIncludeTax} /></View> : null}
    {scenariosAllowed ? <View style={styles.grid}>{[{ label: 'Quick sale price', value: quick, set: setQuick }, { label: 'High ask price', value: high, set: setHigh }].map((field) => <View key={field.label} style={styles.field}><Text style={styles.hint}>{field.label}</Text><TextInput accessibilityLabel={field.label} style={styles.input} value={field.value} onChangeText={field.set} keyboardType="decimal-pad" /></View>)}</View> : <Text style={styles.hint}>Serious adds side-by-side quick sale and high ask scenarios. Your target calculation is included.</Text>}
    {calculation.error ? <Text style={styles.error}>{calculation.error}</Text> : null}
    {calculation.projection?.missing.length ? <Text style={styles.error}>Missing: {calculation.projection.missing.join(', ')}</Text> : null}
    {scenarioRows.map(({ label, cents }) => {
      let projection = null;
      try { if (calculation.input && cents !== null) projection = calculateNetProceeds({ ...calculation.input, salePriceCents: cents }); } catch { /* Below-discount scenario cannot produce a result. */ }
      return <View key={label} style={styles.result}><Text style={styles.title}>{label} · {money(cents)}</Text><Text style={styles.hint}>Proceeds {money(projection?.proceedsCents ?? null)} · Net profit {money(projection?.profitCents ?? null)}</Text><Text style={styles.hint}>ROI {projection?.roiPercent == null ? '—' : `${projection.roiPercent.toFixed(1)}%`} on acquisition, shipping and packaging</Text></View>;
    })}
    <Text style={styles.hint}>Seller-entered rates; no automatic fee quote. Marketplace-collected tax is excluded from revenue. Your tax reserve is a planning amount, not a calculated tax liability.</Text>
    <View style={styles.row}><Pressable accessibilityRole="button" disabled={busy || !calculation.input} onPress={() => void save()} style={styles.button}><Text style={styles.link}>Save assumptions</Text></Pressable>
      <Pressable accessibilityRole="button" disabled={busy || !calculation.input || calculation.input.salePriceCents <= 0} onPress={() => { if (calculation.input) onTargetPriceChange(calculation.input.salePriceCents / 100); }} style={styles.button}><Text style={styles.link}>Use target price</Text></Pressable></View>
    {message ? <Text selectable style={styles.hint}>{message}</Text> : null}
  </View>;
}

const styles = StyleSheet.create({
  panel: { padding: 16, borderRadius: 18, backgroundColor: theme.colors.surfaceSoft, gap: 12 },
  title: { fontSize: 18, color: theme.colors.text }, hint: { fontSize: 13, color: theme.colors.textMuted, lineHeight: 20 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 }, field: { flexGrow: 1, flexBasis: 140, gap: 5 },
  input: { minHeight: 44, padding: 10, borderWidth: 1, borderColor: theme.colors.goldMuted, borderRadius: 9, color: theme.colors.text },
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 12 },
  link: { color: theme.colors.scannerCyan, fontSize: 14 }, error: { color: theme.colors.danger },
  result: { gap: 5, borderTopWidth: 1, borderTopColor: theme.colors.goldMuted, paddingTop: 10 }, button: { paddingVertical: 12 },
});
