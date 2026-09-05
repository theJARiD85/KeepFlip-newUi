import { useState } from 'react';
import { Text } from 'react-native';
import { agingRecommendations, itemFactLines, parseMoneyInput } from '@/lib/seller-assistance';
import { type InventoryItem } from '@/services/inventory-service';
import { Button, Field, Section, styles } from './ui';

export function ItemReview({ item, onRecord }: { item: InventoryItem; onRecord: (notes: string) => Promise<boolean> }) {
  const [listedAt, setListedAt] = useState('');
  const [asking, setAsking] = useState('');
  const [comparable, setComparable] = useState('');
  const [checkedAt, setCheckedAt] = useState('');
  const [source, setSource] = useState('');
  const [result, setResult] = useState<ReturnType<typeof agingRecommendations> | null>(null);
  const [error, setError] = useState('');
  function review() {
    setError(''); setResult(null);
    try {
      const date = (value: string) => {
        if (!value.trim()) return null;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value || Date.parse(value) > Date.now()) throw new Error('Use a valid date in YYYY-MM-DD format, no later than today.');
        return value;
      };
      const comparableCents = parseMoneyInput(comparable);
      if (comparableCents !== null && (!source.trim() || !checkedAt)) throw new Error('Record the source and checked date for your seller-verified comparable.');
      setResult(agingRecommendations({ listedAt: date(listedAt), photoCount: item.photoCount, condition: item.condition, typicalDays: item.resaleTypicalDays, askingPriceCents: parseMoneyInput(asking), verifiedComparableCents: comparableCents, comparableCheckedAt: date(checkedAt) }));
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Check the review evidence.'); }
  }
  return <Section title="Item facts and aging · everyone">
    <Text style={styles.muted}>Saved inventory facts are reference material for your review, not independent verification. Private SKU and storage details stay out of response drafts.</Text>
    {itemFactLines(item).map(line => <Text key={line} selectable style={styles.text}>{line}</Text>)}
    <Field label="Actual listing date (YYYY-MM-DD)" value={listedAt} onChangeText={value => { setListedAt(value); setResult(null); }} />
    <Field label={`Current asking price (${item.currency}) · optional`} value={asking} onChangeText={value => { setAsking(value); setResult(null); }} numeric />
    <Field label={`Matching sold comparable (${item.currency}) · optional, seller verified`} value={comparable} onChangeText={value => { setComparable(value); setResult(null); }} numeric />
    <Field label="Comparable source / evidence reference (no buyer information)" value={source} onChangeText={value => { setSource(value); setResult(null); }} />
    <Field label="Comparable checked date (YYYY-MM-DD)" value={checkedAt} onChangeText={value => { setCheckedAt(value); setResult(null); }} />
    <Text style={styles.muted}>Use the same currency, matching identity and condition. An asking listing or AI summary is not a verified sold comparable. Listing date and evidence inputs are session-only; record a review to retain its summary.</Text>
    <Button title="Review 7 / 14 / 30 / 45 day evidence" onPress={review} />
    {result ? <><Text style={styles.text}>{result.ageDays === null ? 'Listing age unknown' : `${result.ageDays} days listed · ${result.checkpoint ? `${result.checkpoint}-day checkpoint` : 'before first checkpoint'}`}</Text>{result.recommendations.map(line => <Text key={line} style={styles.text}>{line}</Text>)}<Button title="Record this aging review" onPress={() => { void onRecord(`${result.ageDays ?? 'Unknown'} days listed. ${result.recommendations.join(' ')}${source.trim() ? ` Evidence: ${source.trim()}.` : ''}`); }} /></> : null}
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
  </Section>;
}
