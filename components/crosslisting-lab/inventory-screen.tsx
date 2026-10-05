import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { KeepFlipText as Text, KeepFlipTextInput as TextInput } from '@/components/ui/keepflip-text';
import { brand } from '@/components/crosslisting-lab/brand';
import type {
  InventoryProduct,
  NewInventoryProduct,
  ProductCondition,
} from '@/components/crosslisting-lab/types';

export interface InventoryScreenProps {
  items: InventoryProduct[];
  isLoading?: boolean;
  loadError?: string | null;
  onRetry?: () => void;
  onAddProduct: (item: NewInventoryProduct) => Promise<void> | void;
  onOpenProduct?: (item: InventoryProduct) => void;
}

const conditionChoices: { value: ProductCondition; label: string }[] = [
  { value: 'new_with_tags', label: 'New with tags' },
  { value: 'new_without_tags', label: 'New without tags' },
  { value: 'like_new', label: 'Like new' },
  { value: 'good', label: 'Good' },
  { value: 'fair', label: 'Fair' },
  { value: 'for_parts', label: 'For parts' },
];

function priceError(value: string): string | null {
  if (!value.trim()) return 'Enter a target price.';
  if (!/^\d+(\.\d{1,2})?$/.test(value.trim())) {
    return 'Use a dollar amount with up to two decimal places.';
  }
  const amount = Number(value.trim());
  if (amount <= 0) return 'Target price must be more than $0.';
  if (amount > 21_474_836.47) return 'Target price is too high.';
  return null;
}

function money(value: number): string {
  return `$${value.toFixed(2)}`;
}

export function InventoryScreen({
  items,
  isLoading = false,
  loadError = null,
  onRetry,
  onAddProduct,
  onOpenProduct,
}: InventoryScreenProps) {
  const [title, setTitle] = useState('');
  const [price, setPrice] = useState('');
  const [condition, setCondition] = useState<ProductCondition>('good');
  const [formError, setFormError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const products = items;

  async function addProduct() {
    if (saveState === 'saving') return;
    const cleanTitle = title.trim();
    const validationError = cleanTitle.length < 2
      ? 'Enter an item title of at least two characters.'
      : priceError(price);
    if (validationError) {
      setFormError(validationError);
      setSaveState('idle');
      return;
    }

    const draft = { title: cleanTitle, targetPrice: Number(price.trim()), condition };
    setFormError(null);
    setSaveState('saving');
    try {
      await onAddProduct(draft);
      setTitle('');
      setPrice('');
      setCondition('good');
      setSaveState('saved');
    } catch {
      setFormError('The item could not be saved. Check your connection and try again.');
      setSaveState('idle');
    }
  }

  const header = (
    <View style={styles.headerContent}>
      <View style={styles.brandRow}>
        <View style={styles.brandMark}><Text style={styles.brandLetter}>K</Text></View>
        <View style={styles.brandCopy}>
          <Text style={styles.brandName}>KEEPFLIP</Text>
          <Text style={styles.brandLabel}>CROSSLISTING LAB</Text>
        </View>
        <View style={styles.previewPill}><View style={styles.previewDot} /><Text style={styles.previewText}>PROTOTYPE</Text></View>
      </View>

      <View style={styles.headingBlock}>
        <Text style={styles.eyebrow}>INVENTORY / MASTER CATALOG</Text>
        <Text style={styles.heading}>List once. Start here.</Text>
        <Text style={styles.subtitle}>Create one item record, then prepare it for each marketplace.</Text>
      </View>
      <View style={styles.summaryRow}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>MASTER DRAFTS</Text>
          <Text style={styles.summaryValue}>{products.length}</Text>
          <Text style={styles.summaryNote}>Items in this catalog</Text>
        </View>
        <View style={[styles.summaryCard, styles.summaryCardMuted]}>
          <Text style={styles.summaryLabel}>MARKETPLACES</Text>
          <Text style={styles.summaryValue}>7</Text>
          <Text style={styles.summaryNote}>Adapter paths in progress</Text>
        </View>
      </View>

      <View style={styles.formCard}>
        <View style={styles.formHeadingRow}>
          <View style={styles.formIcon}>
            <SymbolView name={{ ios: 'plus', android: 'add', web: 'add' }} size={19} tintColor={brand.colors.goldBright} />
          </View>
          <View style={styles.formHeadingCopy}>
            <Text style={styles.formTitle}>Add a master item</Text>
            <Text style={styles.formSubtitle}>You can add marketplace details after the draft is saved.</Text>
          </View>
        </View>
        <Text style={styles.fieldLabel}>ITEM TITLE</Text>
        <TextInput
          accessibilityLabel="Item title"
          autoCapitalize="sentences"
          maxLength={200}
          onChangeText={(value) => { setTitle(value); setFormError(null); setSaveState('idle'); }}
          placeholder="e.g. Vintage denim jacket"
          placeholderTextColor={brand.colors.textMuted}
          style={styles.input}
          value={title}
        />
        <Text style={styles.fieldLabel}>TARGET PRICE</Text>
        <View style={styles.priceField}>
          <Text style={styles.dollarSign}>$</Text>
          <TextInput
            accessibilityLabel="Target price in dollars"
            keyboardType="decimal-pad"
            onChangeText={(value) => { setPrice(value); setFormError(null); setSaveState('idle'); }}
            placeholder="0.00"
            placeholderTextColor={brand.colors.textMuted}
            style={styles.priceInput}
            value={price}
          />
        </View>
        <Text style={styles.fieldLabel}>CONDITION</Text>
        <View style={styles.conditionRow}>
          {conditionChoices.map((choice) => (
            <Pressable
              key={choice.value}
              accessibilityRole="radio"
              accessibilityState={{ checked: condition === choice.value }}
              onPress={() => { setCondition(choice.value); setSaveState('idle'); }}
              style={[styles.conditionChip, condition === choice.value && styles.conditionChipActive]}>
              <Text style={[styles.conditionText, condition === choice.value && styles.conditionTextActive]}>{choice.label}</Text>
            </Pressable>
          ))}
        </View>
        {formError ? <Text accessibilityRole="alert" style={styles.formError}>{formError}</Text> : null}
        {saveState === 'saved' ? <Text accessibilityRole="alert" style={styles.formSuccess}>Item saved to your master catalog.</Text> : null}
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: saveState === 'saving' }}
          onPress={() => { void addProduct(); }}
          style={({ pressed }) => [styles.addButton, pressed && styles.addButtonPressed, saveState === 'saving' && styles.addButtonDisabled]}>
          {saveState === 'saving' ? <ActivityIndicator color={brand.colors.background} size="small" /> : null}
          <Text style={styles.addButtonText}>{saveState === 'saving' ? 'Saving item…' : 'Add item'}</Text>
          {saveState !== 'saving' ? <Text style={styles.addArrow}>→</Text> : null}
        </Pressable>
      </View>

      <View style={styles.listHeading}>
        <View>
          <Text style={styles.eyebrow}>YOUR ITEMS</Text>
          <Text style={styles.sectionTitle}>Master catalog</Text>
        </View>
        <View style={styles.countPill}><Text style={styles.countText}>{products.length}</Text></View>
      </View>
      {loadError ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorTitle}>Catalog unavailable</Text>
          <Text style={styles.errorBody}>{loadError}</Text>
          {onRetry ? <Pressable accessibilityRole="button" onPress={onRetry} style={styles.retryButton}><Text style={styles.retryText}>Try again</Text></Pressable> : null}
        </View>
      ) : null}
    </View>
  );

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <FlatList
        contentContainerStyle={styles.listContent}
        data={products}
        initialNumToRender={8}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={header}
        ListEmptyComponent={isLoading ? (
          <View style={styles.emptyCard}><ActivityIndicator color={brand.colors.goldBright} /><Text style={styles.emptyTitle}>Loading your catalog…</Text></View>
        ) : loadError ? null : (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIcon}><SymbolView name={{ ios: 'shippingbox', android: 'inventory_2', web: 'inventory_2' }} size={30} tintColor={brand.colors.goldBright} /></View>
            <Text style={styles.emptyTitle}>Your catalog starts here</Text>
            <Text style={styles.emptyBody}>Add an item above to create your first master draft.</Text>
          </View>
        )}
        renderItem={({ item }) => (
          <View style={styles.productCard}>
            <View style={styles.productIcon}><SymbolView name={{ ios: 'shippingbox', android: 'inventory_2', web: 'inventory_2' }} size={22} tintColor={brand.colors.cyan} /></View>
            <View style={styles.productCopy}>
              <Text numberOfLines={2} style={styles.productTitle}>{item.title}</Text>
              <Text style={styles.productMeta}>Master item{item.condition ? ` · ${conditionChoices.find((choice) => choice.value === item.condition)?.label ?? item.condition}` : ''}</Text>
            </View>
            <View style={styles.productRight}>
              <Text style={styles.productPrice}>{money(item.targetPrice)}</Text>
              <View style={styles.draftPill}><Text style={styles.draftText}>{(item.status ?? 'draft').toUpperCase()}</Text></View>
              {onOpenProduct ? <Pressable accessibilityRole="button" accessibilityLabel={`Prepare listing for ${item.title}`} onPress={() => onOpenProduct(item)} style={styles.listButton}><Text style={styles.listButtonText}>List →</Text></Pressable> : null}
            </View>
          </View>
        )}
        maxToRenderPerBatch={8}
        windowSize={7}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: brand.colors.background },
  listContent: { paddingHorizontal: 16, paddingBottom: 32 },
  headerContent: { width: '100%', maxWidth: 760, alignSelf: 'center' },
  brandRow: { flexDirection: 'row', alignItems: 'center', paddingTop: 15, paddingBottom: 24, gap: 10 },
  brandMark: { width: 38, height: 38, borderRadius: 13, backgroundColor: brand.colors.goldSurface, borderWidth: 1, borderColor: brand.colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
  brandLetter: { color: brand.colors.goldBright, fontSize: 23, fontWeight: '900' },
  brandCopy: { flex: 1, gap: 2 },
  brandName: { color: brand.colors.text, fontSize: 14, fontWeight: '900', letterSpacing: 2.1 },
  brandLabel: { color: brand.colors.gold, fontSize: 9, fontWeight: '800', letterSpacing: 1.4 },
  previewPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 9, paddingVertical: 7, borderRadius: brand.radii.pill, backgroundColor: brand.colors.cyanSurface, borderWidth: 1, borderColor: 'rgba(88, 223, 232, 0.35)' },
  previewDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: brand.colors.cyan },
  previewText: { color: brand.colors.cyan, fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
  headingBlock: { gap: 5, marginBottom: 20 },
  accountRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 16 },
  accountLabel: { flex: 1, color: brand.colors.textMuted, fontSize: 11 },
  signOutButton: { borderRadius: brand.radii.pill, borderWidth: 1, borderColor: brand.colors.border, paddingHorizontal: 11, paddingVertical: 7 },
  signOutText: { color: brand.colors.goldBright, fontSize: 10, fontWeight: '800' },
  eyebrow: { color: brand.colors.gold, fontSize: 9, fontWeight: '900', letterSpacing: 1.5 },
  heading: { color: brand.colors.text, fontSize: 29, lineHeight: 34, fontWeight: '900', letterSpacing: -0.5 },
  subtitle: { color: brand.colors.textMuted, fontSize: 13, lineHeight: 19, maxWidth: 560 },
  summaryRow: { flexDirection: 'row', gap: 10, marginBottom: 18 },
  summaryCard: { flex: 1, minWidth: 0, backgroundColor: brand.colors.card, borderColor: brand.colors.borderStrong, borderWidth: 1, borderRadius: brand.radii.medium, padding: 14, gap: 4 },
  summaryCardMuted: { borderColor: brand.colors.border },
  summaryLabel: { color: brand.colors.gold, fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  summaryValue: { color: brand.colors.goldBright, fontSize: 27, fontWeight: '900' },
  summaryNote: { color: brand.colors.textMuted, fontSize: 11, lineHeight: 15 },
  formCard: { backgroundColor: brand.colors.card, borderWidth: 1, borderColor: brand.colors.borderStrong, borderRadius: brand.radii.medium, padding: 16, gap: 9 },
  formHeadingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 5 },
  formIcon: { width: 38, height: 38, borderRadius: brand.radii.small, alignItems: 'center', justifyContent: 'center', backgroundColor: brand.colors.goldSurface },
  formHeadingCopy: { flex: 1 },
  formTitle: { color: brand.colors.text, fontSize: 16, fontWeight: '800' },
  formSubtitle: { color: brand.colors.textMuted, fontSize: 11, lineHeight: 16, marginTop: 2 },
  fieldLabel: { color: brand.colors.goldBright, fontSize: 9, fontWeight: '900', letterSpacing: 1.15, marginTop: 5 },
  input: { minHeight: 48, borderRadius: brand.radii.small, borderWidth: 1, borderColor: brand.colors.border, backgroundColor: brand.colors.inset, paddingHorizontal: 13, color: brand.colors.text, fontSize: 14 },
  priceField: { minHeight: 48, borderRadius: brand.radii.small, borderWidth: 1, borderColor: brand.colors.border, backgroundColor: brand.colors.inset, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 13 },
  dollarSign: { color: brand.colors.goldBright, fontSize: 17, fontWeight: '800', marginRight: 5 },
  priceInput: { flex: 1, minHeight: 46, color: brand.colors.text, fontSize: 14, padding: 0 },
  conditionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  conditionChip: { minHeight: 35, borderRadius: brand.radii.pill, borderWidth: 1, borderColor: brand.colors.border, backgroundColor: brand.colors.inset, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center' },
  conditionChipActive: { borderColor: brand.colors.goldBright, backgroundColor: brand.colors.goldSurface },
  conditionText: { color: brand.colors.textMuted, fontSize: 11, fontWeight: '700' },
  conditionTextActive: { color: brand.colors.goldBright },
  formError: { color: brand.colors.danger, fontSize: 12, lineHeight: 17 },
  formSuccess: { color: brand.colors.success, fontSize: 12, lineHeight: 17 },
  addButton: { minHeight: 48, borderRadius: brand.radii.small, backgroundColor: brand.colors.goldBright, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 5 },
  addButtonPressed: { opacity: 0.8 },
  addButtonDisabled: { opacity: 0.7 },
  addButtonText: { color: brand.colors.background, fontSize: 14, fontWeight: '900' },
  addArrow: { color: brand.colors.background, fontSize: 19, fontWeight: '700' },
  previewNote: { color: brand.colors.textMuted, fontSize: 11, lineHeight: 16, marginTop: 3 },
  listHeading: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 25, marginBottom: 12 },
  sectionTitle: { color: brand.colors.text, fontSize: 20, fontWeight: '900', marginTop: 4 },
  countPill: { minWidth: 29, height: 29, borderRadius: brand.radii.pill, backgroundColor: brand.colors.goldSurface, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  countText: { color: brand.colors.goldBright, fontSize: 12, fontWeight: '800' },
  errorCard: { backgroundColor: brand.colors.dangerSurface, borderRadius: brand.radii.small, borderWidth: 1, borderColor: brand.colors.danger, padding: 14, marginBottom: 12 },
  errorTitle: { color: brand.colors.text, fontSize: 14, fontWeight: '800' },
  errorBody: { color: brand.colors.textMuted, fontSize: 12, lineHeight: 18, marginTop: 4 },
  retryButton: { alignSelf: 'flex-start', paddingVertical: 8, marginTop: 5 },
  retryText: { color: brand.colors.goldBright, fontSize: 12, fontWeight: '800' },
  emptyCard: { width: '100%', maxWidth: 760, alignSelf: 'center', backgroundColor: brand.colors.card, borderWidth: 1, borderColor: brand.colors.border, borderRadius: brand.radii.medium, padding: 24, alignItems: 'center', gap: 7 },
  emptyIcon: { width: 58, height: 58, borderRadius: 19, backgroundColor: brand.colors.goldSurface, alignItems: 'center', justifyContent: 'center', marginBottom: 5 },
  emptyTitle: { color: brand.colors.text, fontSize: 15, fontWeight: '800', textAlign: 'center' },
  emptyBody: { color: brand.colors.textMuted, fontSize: 12, lineHeight: 18, textAlign: 'center' },
  productCard: { width: '100%', maxWidth: 760, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 11, backgroundColor: brand.colors.card, borderWidth: 1, borderColor: brand.colors.border, borderRadius: brand.radii.medium, padding: 13, marginBottom: 10 },
  productIcon: { width: 46, height: 46, borderRadius: brand.radii.small, backgroundColor: brand.colors.cyanSurface, alignItems: 'center', justifyContent: 'center' },
  productCopy: { flex: 1, minWidth: 0 },
  productTitle: { color: brand.colors.text, fontSize: 14, fontWeight: '800', lineHeight: 19 },
  productMeta: { color: brand.colors.textMuted, fontSize: 10, lineHeight: 15, marginTop: 3 },
  productRight: { alignItems: 'flex-end', gap: 6 },
  productPrice: { color: brand.colors.goldBright, fontSize: 14, fontWeight: '900' },
  draftPill: { backgroundColor: brand.colors.goldSurface, borderRadius: brand.radii.pill, paddingHorizontal: 7, paddingVertical: 4 },
  draftText: { color: brand.colors.goldBright, fontSize: 8, fontWeight: '900', letterSpacing: 0.5 },
  listButton: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: brand.radii.small, backgroundColor: brand.colors.cyanSurface },
  listButtonText: { color: brand.colors.cyan, fontSize: 11, fontWeight: '900' },
});
