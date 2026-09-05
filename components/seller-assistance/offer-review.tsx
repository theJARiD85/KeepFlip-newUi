import { useState } from 'react';
import { Switch, Text, View } from 'react-native';
import { assessOffer, parseMoneyInput, type ShippingPreset } from '@/lib/seller-assistance';
import { type NetProceedsInput } from '@/lib/seller-net-proceeds';
import { getSellerAssistanceCapabilities } from '@/services/seller-preferences-service';
import { Button, Field, Section, styles } from './ui';

const MONEY_FIELDS = [
  ['salePriceCents', 'Offer / counteroffer price'], ['acquisitionCostCents', 'Acquisition cost for the units being sold'],
  ['buyerShippingCents', 'Shipping paid by buyer'], ['shippingExpenseCents', 'Actual / estimated shipping expense'],
  ['packagingCents', 'Packaging'], ['fixedFeeCents', 'Fixed marketplace fee'], ['discountCents', 'Discount'],
  ['refundAllowanceCents', 'Refund allowance'], ['marketplaceCollectedTaxCents', 'Marketplace-collected tax'], ['sellerTaxReserveCents', 'Seller tax reserve'],
] as const;
type MoneyKey = (typeof MONEY_FIELDS)[number][0];
const money = (cents: number | null) => cents === null ? 'Unknown' : `$${(cents / 100).toFixed(2)}`;
export function OfferReview({ serious, presets, onRecord }: { serious: boolean; presets: ShippingPreset[]; onRecord: (notes: string) => Promise<boolean> }) {
  const [values, setValues] = useState<Record<MoneyKey, string>>({ salePriceCents: '', acquisitionCostCents: '', buyerShippingCents: '0', shippingExpenseCents: '', packagingCents: '0', fixedFeeCents: '0', discountCents: '0', refundAllowanceCents: '0', marketplaceCollectedTaxCents: '0', sellerTaxReserveCents: '0' });
  const [fee, setFee] = useState('');
  const [promoted, setPromoted] = useState('0');
  const [minimum, setMinimum] = useState('');
  const [includeTax, setIncludeTax] = useState(false);
  const [result, setResult] = useState<ReturnType<typeof assessOffer> | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  function change(key: MoneyKey, value: string) { setValues(previous => ({ ...previous, [key]: value })); setResult(null); }
  async function calculate() {
    setBusy(true); setError(''); setResult(null);
    try {
      const capabilities = await getSellerAssistanceCapabilities();
      const parsed = Object.fromEntries(MONEY_FIELDS.map(([key]) => [key, parseMoneyInput(values[key])])) as Record<MoneyKey, number | null>;
      for (const [key, label] of MONEY_FIELDS) if (parsed[key] === null && key !== 'acquisitionCostCents' && key !== 'shippingExpenseCents') throw new Error(`Enter ${label.toLowerCase()}; use 0 only when appropriate.`);
      const target = parseMoneyInput(minimum);
      if (target === null) throw new Error('Enter your minimum desired net profit.');
      const rate = parseMoneyInput(fee), promotedRate = parseMoneyInput(promoted);
      if ((rate !== null && rate > 10_000) || promotedRate === null || promotedRate > 10_000) throw new Error('Enter fee percentages from 0 to 100.');
      const input = { ...parsed, marketplaceFeeBps: rate, promotedFeeBps: promotedRate, feesIncludeCollectedTax: includeTax } as NetProceedsInput;
      setResult(assessOffer(input, target, capabilities.offerGuardrails));
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Offer review failed.'); }
    finally { setBusy(false); }
  }
  const summary = result ? `Planning review: ${result.status.replaceAll('_', ' ')}; estimated net profit ${money(result.estimate.profitCents)}; seller-selected profit floor price ${money(result.floorCents)}. No offer submitted.` : '';
  return <Section title="Offer floor guardrails · Serious">
    <Text style={styles.muted}>Compare a buyer offer or a counteroffer you choose with your minimum net profit. All amounts below are USD planning assumptions. Confirm every visible zero; taxes, fee rates and shipping depend on the actual transaction.</Text>
    {!serious ? <Text style={styles.text}>Serious access is required for offer floor calculations. Manual replies, reminders, aging reviews and history remain available to everyone.</Text> : <>
      {presets.map(preset => <Button key={preset.id} title={`Apply shipping estimate: ${preset.name}`} onPress={() => { setValues(previous => ({ ...previous, shippingExpenseCents: preset.shippingExpenseCents === null ? '' : String(preset.shippingExpenseCents / 100), packagingCents: preset.packagingCents === null ? '' : String(preset.packagingCents / 100) })); setResult(null); }} />)}
      {MONEY_FIELDS.map(([key, label]) => <Field key={key} label={`${label} (USD)`} value={values[key]} onChangeText={value => change(key, value)} numeric />)}
      <Field label="Marketplace percentage fee (blank = unknown)" value={fee} onChangeText={value => { setFee(value); setResult(null); }} numeric />
      <Field label="Promoted percentage fee" value={promoted} onChangeText={value => { setPromoted(value); setResult(null); }} numeric />
      <View><Text style={styles.label}>Percentage fees include marketplace-collected tax</Text><Switch accessibilityLabel="Percentage fees include marketplace-collected tax" value={includeTax} onValueChange={value => { setIncludeTax(value); setResult(null); }} /></View>
      <Field label="My minimum net profit (USD)" value={minimum} onChangeText={value => { setMinimum(value); setResult(null); }} numeric />
      <Button title={busy ? 'Checking access and calculating…' : 'Review my offer assumptions'} disabled={busy} onPress={() => { void calculate(); }} />
      {result ? <View style={styles.row}><Text selectable style={styles.text}>{summary}</Text><Text style={styles.text}>Estimated proceeds: {money(result.estimate.proceedsCents)}</Text>{result.estimate.missing.length ? <Text style={styles.error}>Missing: {result.estimate.missing.join(', ')}. A floor cannot be confirmed.</Text> : null}<Text style={styles.muted}>Meeting your floor is not a recommendation to accept. You choose any accept, decline or counteroffer action in the selling channel.</Text><Button title="Record this offer review in manual history" onPress={() => { void onRecord(summary); }} /></View> : null}
    </>}
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
  </Section>;
}
