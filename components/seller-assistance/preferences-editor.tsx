import { useState } from 'react';
import { Switch, Text, View } from 'react-native';
import { ID } from '@/lib/appwrite';
import { parseMoneyInput, validateShippingPreset, type SellerPreferences } from '@/lib/seller-assistance';
import { Button, Field, Section, styles } from './ui';

export function PreferencesEditor({ preferences, busy, onSave, onUseResponse }: { preferences: SellerPreferences; busy: boolean; onSave: (value: SellerPreferences) => Promise<boolean>; onUseResponse: (body: string) => void }) {
  const [responseId, setResponseId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [presetId, setPresetId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [shipping, setShipping] = useState('');
  const [packaging, setPackaging] = useState('');
  const [packageType, setPackageType] = useState('');
  const [weight, setWeight] = useState('');
  const [length, setLength] = useState('');
  const [width, setWidth] = useState('');
  const [height, setHeight] = useState('');
  const [handling, setHandling] = useState('');
  const [services, setServices] = useState('');
  const [returnsAccepted, setReturnsAccepted] = useState(false);
  const [returnDays, setReturnDays] = useState('');
  const [returnPayer, setReturnPayer] = useState<'seller' | 'buyer' | null>(null);
  const [hours, setHours] = useState(String(preferences.responseReminderHours));
  const [error, setError] = useState('');
  async function saveResponse() {
    setError('');
    if (!title.trim() || !body.trim()) { setError('Enter a response title and body.'); return; }
    const response = { id: responseId ?? ID.unique(), title: title.trim(), body: body.trim() };
    if (await onSave({ ...preferences, savedResponses: responseId ? preferences.savedResponses.map(x => x.id === responseId ? response : x) : [...preferences.savedResponses, response] })) { setResponseId(null); setTitle(''); setBody(''); }
  }
  async function savePreset() {
    setError('');
    try {
      const shippingExpenseCents = parseMoneyInput(shipping), packagingCents = parseMoneyInput(packaging);
      if (!name.trim()) throw new Error('Enter a preset name.');
      const numeric = (value: string) => { if (!value.trim()) return null; if (!/^\d+(?:\.\d{1,2})?$/.test(value.trim())) throw new Error('Use non-negative numbers with at most two decimal places.'); return Number(value); };
      const preset = validateShippingPreset({ id: presetId ?? ID.unique(), name: name.trim(), shippingExpenseCents, packagingCents, packageType, weightGrams: numeric(weight), lengthCm: numeric(length), widthCm: numeric(width), heightCm: numeric(height), handlingDays: numeric(handling), shippingServices: services.split(',').map(x => x.trim()).filter(Boolean), returnsAccepted, returnWindowDays: returnsAccepted ? numeric(returnDays) : null, returnShippingPaidBy: returnsAccepted ? returnPayer : null });
      if (await onSave({ ...preferences, shippingPresets: presetId ? preferences.shippingPresets.map(x => x.id === presetId ? preset : x) : [...preferences.shippingPresets, preset] })) { setPresetId(null); setName(''); setShipping(''); setPackaging(''); }
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Check the preset values.'); }
  }
  return <>
    <Section title="Saved responses · everyone">
      <Text style={styles.muted}>Reusable seller-written text. Keep buyer names, addresses and private item locations out of saved replies. Review every draft before using it.</Text>
      {preferences.savedResponses.map(response => <View key={response.id} style={styles.row}><Text style={styles.text}>{response.title}</Text><Text selectable style={styles.muted}>{response.body}</Text><Button title={`Use ${response.title} in draft`} onPress={() => onUseResponse(response.body)} /><Button title={`Edit ${response.title}`} onPress={() => { setResponseId(response.id); setTitle(response.title); setBody(response.body); }} disabled={busy} /><Button title={`Delete ${response.title}`} onPress={() => { void onSave({ ...preferences, savedResponses: preferences.savedResponses.filter(x => x.id !== response.id) }); }} disabled={busy} /></View>)}
      <Field label="Response title (120 characters maximum)" value={title} onChangeText={setTitle} />
      <Field label="Response body (2,000 characters maximum)" value={body} onChangeText={setBody} multiline />
      <Button title={responseId ? 'Save response changes' : 'Save new response'} onPress={() => { void saveResponse(); }} disabled={busy} />
      {responseId ? <Button title="Cancel response edit" onPress={() => { setResponseId(null); setTitle(''); setBody(''); }} /> : null}
      <Field label="Remind me after unanswered hours (1–168)" value={hours} onChangeText={setHours} numeric />
      <Button title="Save reminder timing" disabled={busy} onPress={() => { void onSave({ ...preferences, responseReminderHours: Number(hours) }); }} />
      <Text style={styles.muted}>Reminders appear when you open or refresh this screen. No notifications or messages are scheduled.</Text>
    </Section>
    <Section title="Shipping presets · everyone">
      <Text style={styles.muted}>Planning estimates in USD. Confirm the actual package, destination and carrier quote before using a preset. These are not purchased labels or shipping promises.</Text>
      {preferences.shippingPresets.map(preset => <View key={preset.id} style={styles.row}><Text style={styles.text}>{preset.name} · shipping {preset.shippingExpenseCents === null ? 'unknown' : `$${(preset.shippingExpenseCents / 100).toFixed(2)}`} · packaging {preset.packagingCents === null ? 'unknown' : `$${(preset.packagingCents / 100).toFixed(2)}`}</Text><Button title={`Edit ${preset.name}`} onPress={() => { setPresetId(preset.id); setName(preset.name); setPackageType(preset.packageType); setWeight(preset.weightGrams === null ? '' : String(preset.weightGrams)); setLength(preset.lengthCm === null ? '' : String(preset.lengthCm)); setWidth(preset.widthCm === null ? '' : String(preset.widthCm)); setHeight(preset.heightCm === null ? '' : String(preset.heightCm)); setHandling(preset.handlingDays === null ? '' : String(preset.handlingDays)); setServices(preset.shippingServices.join(', ')); setReturnsAccepted(preset.returnsAccepted); setReturnDays(preset.returnWindowDays === null ? '' : String(preset.returnWindowDays)); setReturnPayer(preset.returnShippingPaidBy); setShipping(preset.shippingExpenseCents === null ? '' : String(preset.shippingExpenseCents / 100)); setPackaging(preset.packagingCents === null ? '' : String(preset.packagingCents / 100)); }} disabled={busy} /><Button title={`Delete ${preset.name}`} onPress={() => { void onSave({ ...preferences, shippingPresets: preferences.shippingPresets.filter(x => x.id !== preset.id) }); }} disabled={busy} /></View>)}
      <Field label="Preset name (120 characters maximum)" value={name} onChangeText={setName} />
            <Field label="Package type (e.g. box, padded mailer; blank = unknown)" value={packageType} onChangeText={setPackageType} />
      <Field label="Packed weight in grams (blank = unknown)" value={weight} onChangeText={setWeight} numeric />
      <Field label="Length in cm (blank = unknown)" value={length} onChangeText={setLength} numeric />
      <Field label="Width in cm (blank = unknown)" value={width} onChangeText={setWidth} numeric />
      <Field label="Height in cm (blank = unknown)" value={height} onChangeText={setHeight} numeric />
      <Field label="Handling days (0–30; blank = unknown)" value={handling} onChangeText={setHandling} numeric />
      <Field label="Shipping services (comma-separated; at most 10)" value={services} onChangeText={setServices} />
      <Text style={styles.label}>Accept returns in this preset</Text>
      <Switch accessibilityLabel="Accept returns in this preset" value={returnsAccepted} onValueChange={setReturnsAccepted} />
      {returnsAccepted ? <><Field label="Return window in days (1–365)" value={returnDays} onChangeText={setReturnDays} numeric /><Button title={`Return shipping paid by buyer${returnPayer === 'buyer' ? ' · selected' : ''}`} onPress={() => setReturnPayer('buyer')} /><Button title={`Return shipping paid by seller${returnPayer === 'seller' ? ' · selected' : ''}`} onPress={() => setReturnPayer('seller')} /></> : null}
      <Text style={styles.muted}>Return defaults are your preference only. Check the marketplace rules for each sale; saving does not change a listing or override buyer protections. Blank costs are unknown.</Text>
      <Field label="Estimated shipping expense (USD)" value={shipping} onChangeText={setShipping} numeric />
      <Field label="Estimated packaging expense (USD)" value={packaging} onChangeText={setPackaging} numeric />
      <Button title={presetId ? 'Save preset changes' : 'Save shipping preset'} disabled={busy} onPress={() => { void savePreset(); }} />
      {presetId ? <Button title="Cancel preset edit" onPress={() => { setPresetId(null); setName(''); setShipping(''); setPackaging(''); }} /> : null}
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    </Section>
  </>;
}

