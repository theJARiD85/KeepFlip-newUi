import { SymbolView } from 'expo-symbols';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { File } from 'expo-file-system';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
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
import type { InventoryItem } from '@/services/inventory-service';
import { useResponsiveLayout, useResponsiveStyles } from '@/hooks/use-responsive-layout';

type AddProductResult = {
  product: InventoryProduct;
  failedPhotoCount: number;
};

export interface InventoryScreenProps {
  items: InventoryProduct[];
  inventoryItems: InventoryItem[];
  isLoading?: boolean;
  inventoryLoading?: boolean;
  loadError?: string | null;
  inventoryError?: string | null;
  onRetry?: () => void;
  onRetryInventory?: () => void;
  onViewInventory?: () => void;
  onOpenInventoryItem?: (item: InventoryItem) => void;
  onAddProduct: (item: NewInventoryProduct, images: ImagePicker.ImagePickerAsset[]) => Promise<AddProductResult>;
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
  inventoryItems,
  isLoading = false,
  inventoryLoading = false,
  loadError = null,
  inventoryError = null,
  onRetry,
  onRetryInventory,
  onViewInventory,
  onOpenInventoryItem,
  onAddProduct,
  onOpenProduct,
}: InventoryScreenProps) {
  const responsiveStyles = useResponsiveStyles(createStylesWebResponsive);
  const [title, setTitle] = useState('');
  const [price, setPrice] = useState('');
  const [condition, setCondition] = useState<ProductCondition>('good');
  const [inventorySearch, setInventorySearch] = useState('');
  const [selectedImages, setSelectedImages] = useState<ImagePicker.ImagePickerAsset[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [photoUploadWarning, setPhotoUploadWarning] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [savedDraft, setSavedDraft] = useState<AddProductResult | null>(null);
  const products = items;
  const matchingInventoryItems = useMemo(() => {
    const query = inventorySearch.trim().toLocaleLowerCase();
    if (!query) return inventoryItems;
    return inventoryItems.filter((item) => [item.title, item.brand, item.category, item.sku]
      .some((value) => value?.toLocaleLowerCase().includes(query)));
  }, [inventoryItems, inventorySearch]);
  const visibleInventoryItems = matchingInventoryItems.slice(0, 6);

  async function chooseImages() {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setFormError('Allow photo library access to add listing images.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        allowsMultipleSelection: true,
        selectionLimit: 10,
        quality: 0.9,
      });
      if (result.canceled) return;

      setSelectedImages((current) => {
        const merged = [...current];
        for (const image of result.assets) {
          if (!merged.some((selected) => selected.uri === image.uri) && merged.length < 10) {
            merged.push(image);
          }
        }
        return merged;
      });
      setFormError(null);
      setPhotoUploadWarning(null);
      setSavedDraft(null);
      setSaveState('idle');
    } catch {
      setFormError('Photos could not be opened. Check photo access and try again.');
    }
  }

  function removeImage(uri: string) {
    setSelectedImages((current) => current.filter((image) => image.uri !== uri));
    setFormError(null);
    setPhotoUploadWarning(null);
    setSavedDraft(null);
    setSaveState('idle');
  }

  async function addProduct() {
    if (saveState === 'saving') return;
    const cleanTitle = title.trim();
    const unsupportedImage = selectedImages.some((image) => {
      const fileSize = image.fileSize || new File(image.uri).size;
      return !['image/jpeg', 'image/png', 'image/webp'].includes(image.mimeType ?? '')
        || !fileSize
        || fileSize > 12_000_000;
    });
    let validationError: string | null = null;
    if (selectedImages.length === 0) {
      validationError = 'Choose at least one photo before creating a listing draft.';
    } else if (unsupportedImage) {
      validationError = 'Use JPG, PNG, or WebP photos under 12 MB each.';
    } else if (cleanTitle.length < 2) {
      validationError = 'Enter an item title of at least two characters.';
    } else {
      validationError = priceError(price);
    }
    if (validationError) {
      setFormError(validationError);
      setSaveState('idle');
      return;
    }

    const draft = { title: cleanTitle, targetPrice: Number(price.trim()), condition };
    setFormError(null);
    setPhotoUploadWarning(null);
    setSavedDraft(null);
    setSaveState('saving');
    try {
      const result = await onAddProduct(draft, selectedImages);
      setTitle('');
      setPrice('');
      setCondition('good');
      setSelectedImages([]);
      setSavedDraft(result);
      setPhotoUploadWarning(result.failedPhotoCount > 0
        ? `${result.failedPhotoCount} photo${result.failedPhotoCount === 1 ? '' : 's'} could not upload. Open the draft to add them again.`
        : null);
      setSaveState('saved');
    } catch {
      setFormError('The listing draft could not be saved. Check your connection and try again.');
      setSaveState('idle');
    }
  }

  const header = (
    <View style={responsiveStyles.headerContent}>
      <View style={responsiveStyles.brandRow}>
        <View style={responsiveStyles.brandMark}><Text style={responsiveStyles.brandLetter}>K</Text></View>
        <View style={responsiveStyles.brandCopy}>
          <Text style={responsiveStyles.brandName}>KEEPFLIP</Text>
          <Text style={responsiveStyles.brandLabel}>CROSSLISTING LAB</Text>
        </View>
        <View style={responsiveStyles.previewPill}><View style={responsiveStyles.previewDot} /><Text style={responsiveStyles.previewText}>PROTOTYPE</Text></View>
      </View>

      <View style={responsiveStyles.headingBlock}>
        <Text style={responsiveStyles.eyebrow}>INVENTORY / MASTER CATALOG</Text>
        <Text style={responsiveStyles.heading}>List once. Start here.</Text>
        <Text style={responsiveStyles.subtitle}>Create one item record, then prepare it for each marketplace.</Text>
      </View>
      <View style={responsiveStyles.inventorySection}>
        <View style={responsiveStyles.inventoryHeadingRow}>
          <View style={responsiveStyles.inventoryHeadingCopy}>
            <Text style={responsiveStyles.eyebrow}>KEEPFLIP INVENTORY</Text>
            <Text style={responsiveStyles.sectionTitle}>Pick a saved item</Text>
          </View>
          {onViewInventory ? (
            <Pressable accessibilityRole="button" onPress={onViewInventory} style={responsiveStyles.viewInventoryButton}>
              <Text style={responsiveStyles.viewInventoryText}>View inventory →</Text>
            </Pressable>
          ) : null}
        </View>
        <TextInput
          accessibilityLabel="Search KeepFlip inventory"
          autoCapitalize="none"
          onChangeText={setInventorySearch}
          placeholder="Search title, brand, or SKU"
          placeholderTextColor={brand.colors.textMuted}
          style={responsiveStyles.input}
          value={inventorySearch}
        />
        {inventoryLoading ? (
          <View style={responsiveStyles.inventoryState}>
            <ActivityIndicator color={brand.colors.goldBright} size="small" />
            <Text style={responsiveStyles.inventoryStateText}>Loading your KeepFlip inventory…</Text>
          </View>
        ) : inventoryError ? (
          <View style={responsiveStyles.errorCard}>
            <Text style={responsiveStyles.errorTitle}>KeepFlip inventory unavailable</Text>
            <Text style={responsiveStyles.errorBody}>{inventoryError}</Text>
            {onRetryInventory ? (
              <Pressable accessibilityRole="button" onPress={onRetryInventory} style={responsiveStyles.retryButton}>
                <Text style={responsiveStyles.retryText}>Try again</Text>
              </Pressable>
            ) : null}
          </View>
        ) : inventoryItems.length === 0 ? (
          <View style={responsiveStyles.inventoryEmpty}>
            <Text style={responsiveStyles.inventoryStateText}>No saved items yet. Add inventory in KeepFlip or start below with photos.</Text>
          </View>
        ) : matchingInventoryItems.length === 0 ? (
          <View style={responsiveStyles.inventoryEmpty}>
            <Text style={responsiveStyles.inventoryStateText}>No inventory items match that search.</Text>
          </View>
        ) : (
          <>
            {visibleInventoryItems.map((item) => {
              const priceValue = item.listingCurrentPrice ?? item.estimatedValue;
              return (
                <View key={item.id} style={responsiveStyles.keepFlipItemCard}>
                  <View style={responsiveStyles.productIcon}>
                    <SymbolView name={{ ios: 'shippingbox', android: 'inventory_2', web: 'inventory_2' }} size={21} tintColor={brand.colors.cyan} />
                  </View>
                  <View style={responsiveStyles.productCopy}>
                    <Text numberOfLines={2} style={responsiveStyles.productTitle}>{item.title}</Text>
                    <Text style={responsiveStyles.productMeta}>
                      {[item.brand, `${item.photoCount} photo${item.photoCount === 1 ? '' : 's'}`].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                  <View style={responsiveStyles.productRight}>
                    <Text style={responsiveStyles.productPrice}>{priceValue === null ? 'Price needed' : money(priceValue)}</Text>
                    {onOpenInventoryItem ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Prepare listing for ${item.title}`}
                        onPress={() => onOpenInventoryItem(item)}
                        style={responsiveStyles.listButton}>
                        <Text style={responsiveStyles.listButtonText}>Prepare →</Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              );
            })}
            {matchingInventoryItems.length > visibleInventoryItems.length ? (
              <Text style={responsiveStyles.inventoryHint}>
                Showing {visibleInventoryItems.length} of {matchingInventoryItems.length}. Search to narrow the list.
              </Text>
            ) : null}
          </>
        )}
      </View>

      <View style={responsiveStyles.formCard}>
        <View style={responsiveStyles.formHeadingRow}>
          <View style={responsiveStyles.formIcon}>
            <SymbolView name={{ ios: 'plus', android: 'add', web: 'add' }} size={19} tintColor={brand.colors.goldBright} />
          </View>
          <View style={responsiveStyles.formHeadingCopy}>
            <Text style={responsiveStyles.formTitle}>Start a listing with photos</Text>
            <Text style={responsiveStyles.formSubtitle}>Choose up to 10 photos first, then add a title, price, and condition. This creates a Crosslisting Lab draft.</Text>
          </View>
        </View>
        <Text style={responsiveStyles.fieldLabel}>1. LISTING PHOTOS · {selectedImages.length}/10</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={selectedImages.length ? 'Add listing photos' : 'Choose listing photos'}
          accessibilityState={{ disabled: saveState === 'saving' }}
          disabled={saveState === 'saving'}
          onPress={() => { void chooseImages(); }}
          style={({ pressed }) => [responsiveStyles.photoPickerButton, pressed && responsiveStyles.addButtonPressed]}>
          <SymbolView name={{ ios: 'photo', android: 'add_photo_alternate', web: 'add_photo_alternate' }} size={20} tintColor={brand.colors.goldBright} />
          <Text style={responsiveStyles.photoPickerText}>{selectedImages.length ? 'Add more photos' : 'Choose photos'}</Text>
        </Pressable>
        {selectedImages.length > 0 ? (
          <ScrollView horizontal contentContainerStyle={responsiveStyles.photoPreviewList} showsHorizontalScrollIndicator={false}>
            {selectedImages.map((image) => (
              <View key={image.uri} style={responsiveStyles.photoPreviewWrap}>
                <Image contentFit="cover" source={{ uri: image.uri }} style={responsiveStyles.photoPreview} />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${image.fileName ?? 'photo'}`}
                  onPress={() => removeImage(image.uri)}
                  style={responsiveStyles.removePhotoButton}>
                  <Text style={responsiveStyles.removePhotoText}>×</Text>
                </Pressable>
              </View>
            ))}
          </ScrollView>
        ) : (
          <Text style={responsiveStyles.previewNote}>JPG, PNG, or WebP · up to 12 MB each</Text>
        )}
        <Text style={responsiveStyles.fieldLabel}>2. ITEM TITLE</Text>
        <TextInput
          accessibilityLabel="Item title"
          autoCapitalize="sentences"
          maxLength={200}
          onChangeText={(value) => { setTitle(value); setFormError(null); setPhotoUploadWarning(null); setSavedDraft(null); setSaveState('idle'); }}
          placeholder="e.g. Vintage denim jacket"
          placeholderTextColor={brand.colors.textMuted}
          style={responsiveStyles.input}
          value={title}
        />
        <Text style={responsiveStyles.fieldLabel}>TARGET PRICE</Text>
        <View style={responsiveStyles.priceField}>
          <Text style={responsiveStyles.dollarSign}>$</Text>
          <TextInput
            accessibilityLabel="Target price in dollars"
            keyboardType="decimal-pad"
            onChangeText={(value) => { setPrice(value); setFormError(null); setPhotoUploadWarning(null); setSavedDraft(null); setSaveState('idle'); }}
            placeholder="0.00"
            placeholderTextColor={brand.colors.textMuted}
            style={responsiveStyles.priceInput}
            value={price}
          />
        </View>
        <Text style={responsiveStyles.fieldLabel}>CONDITION</Text>
        <View style={responsiveStyles.conditionRow}>
          {conditionChoices.map((choice) => (
            <Pressable
              key={choice.value}
              accessibilityRole="radio"
              accessibilityState={{ checked: condition === choice.value }}
              onPress={() => { setCondition(choice.value); setPhotoUploadWarning(null); setSavedDraft(null); setSaveState('idle'); }}
              style={[responsiveStyles.conditionChip, condition === choice.value && responsiveStyles.conditionChipActive]}>
              <Text style={[responsiveStyles.conditionText, condition === choice.value && responsiveStyles.conditionTextActive]}>{choice.label}</Text>
            </Pressable>
          ))}
        </View>
        {formError ? <Text accessibilityRole="alert" style={responsiveStyles.formError}>{formError}</Text> : null}
        {saveState === 'saved' ? <Text style={responsiveStyles.formSuccess}>Draft saved to your Crosslisting Lab catalog.</Text> : null}
        {photoUploadWarning ? <Text accessibilityRole="alert" style={responsiveStyles.formWarning}>{photoUploadWarning}</Text> : null}
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: saveState === 'saving' }}
          disabled={saveState === 'saving'}
          onPress={() => { void addProduct(); }}
          style={({ pressed }) => [responsiveStyles.addButton, pressed && responsiveStyles.addButtonPressed, saveState === 'saving' && responsiveStyles.addButtonDisabled]}>
          {saveState === 'saving' ? <ActivityIndicator color={brand.colors.background} size="small" /> : null}
          <Text style={responsiveStyles.addButtonText}>{saveState === 'saving' ? 'Saving listing…' : 'Create listing draft'}</Text>
          {saveState !== 'saving' ? <Text style={responsiveStyles.addArrow}>→</Text> : null}
        </Pressable>
        {savedDraft && onOpenProduct ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => onOpenProduct(savedDraft.product)}
            style={responsiveStyles.continueButton}>
            <Text style={responsiveStyles.continueButtonText}>Continue to listing →</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={responsiveStyles.listHeading}>
        <View>
          <Text style={responsiveStyles.eyebrow}>YOUR ITEMS</Text>
          <Text style={responsiveStyles.sectionTitle}>Master catalog</Text>
        </View>
        <View style={responsiveStyles.countPill}><Text style={responsiveStyles.countText}>{products.length}</Text></View>
      </View>
      {loadError ? (
        <View style={responsiveStyles.errorCard}>
          <Text style={responsiveStyles.errorTitle}>Catalog unavailable</Text>
          <Text style={responsiveStyles.errorBody}>{loadError}</Text>
          {onRetry ? <Pressable accessibilityRole="button" onPress={onRetry} style={responsiveStyles.retryButton}><Text style={responsiveStyles.retryText}>Try again</Text></Pressable> : null}
        </View>
      ) : null}
    </View>
  );

  return (
    <SafeAreaView edges={['top']} style={responsiveStyles.safeArea}>
      <FlatList
        contentContainerStyle={responsiveStyles.listContent}
        data={products}
        initialNumToRender={8}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={header}
        ListEmptyComponent={isLoading ? (
          <View style={responsiveStyles.emptyCard}><ActivityIndicator color={brand.colors.goldBright} /><Text style={responsiveStyles.emptyTitle}>Loading your catalog…</Text></View>
        ) : loadError ? null : (
          <View style={responsiveStyles.emptyCard}>
            <View style={responsiveStyles.emptyIcon}><SymbolView name={{ ios: 'shippingbox', android: 'inventory_2', web: 'inventory_2' }} size={30} tintColor={brand.colors.goldBright} /></View>
            <Text style={responsiveStyles.emptyTitle}>Your catalog starts here</Text>
            <Text style={responsiveStyles.emptyBody}>Add an item above to create your first master draft.</Text>
          </View>
        )}
        renderItem={({ item }) => (
          <View style={responsiveStyles.productCard}>
            <View style={responsiveStyles.productIcon}><SymbolView name={{ ios: 'shippingbox', android: 'inventory_2', web: 'inventory_2' }} size={22} tintColor={brand.colors.cyan} /></View>
            <View style={responsiveStyles.productCopy}>
              <Text numberOfLines={2} style={responsiveStyles.productTitle}>{item.title}</Text>
              <Text style={responsiveStyles.productMeta}>Master item{item.condition ? ` · ${conditionChoices.find((choice) => choice.value === item.condition)?.label ?? item.condition}` : ''}</Text>
            </View>
            <View style={responsiveStyles.productRight}>
              <Text style={responsiveStyles.productPrice}>{money(item.targetPrice)}</Text>
              <View style={responsiveStyles.draftPill}><Text style={responsiveStyles.draftText}>{(item.status ?? 'draft').toUpperCase()}</Text></View>
              {onOpenProduct ? <Pressable accessibilityRole="button" accessibilityLabel={`Prepare listing for ${item.title}`} onPress={() => onOpenProduct(item)} style={responsiveStyles.listButton}><Text style={responsiveStyles.listButtonText}>List →</Text></Pressable> : null}
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
  inventorySection: { gap: 10, marginBottom: 18 },
  inventoryHeadingRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10 },
  inventoryHeadingCopy: { flex: 1, gap: 4 },
  viewInventoryButton: { paddingVertical: 7, paddingLeft: 8 },
  viewInventoryText: { color: brand.colors.cyan, fontSize: 11, fontWeight: '800' },
  inventoryState: { minHeight: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, backgroundColor: brand.colors.card, borderWidth: 1, borderColor: brand.colors.border, borderRadius: brand.radii.small, padding: 12 },
  inventoryStateText: { color: brand.colors.textMuted, fontSize: 11, lineHeight: 16, flexShrink: 1 },
  inventoryEmpty: { backgroundColor: brand.colors.card, borderWidth: 1, borderColor: brand.colors.border, borderRadius: brand.radii.small, padding: 13 },
  inventoryHint: { color: brand.colors.textMuted, fontSize: 10, lineHeight: 15, textAlign: 'center' },
  keepFlipItemCard: { width: '100%', maxWidth: 760, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 11, backgroundColor: brand.colors.card, borderWidth: 1, borderColor: brand.colors.border, borderRadius: brand.radii.medium, padding: 13 },
  formCard: { backgroundColor: brand.colors.card, borderWidth: 1, borderColor: brand.colors.borderStrong, borderRadius: brand.radii.medium, padding: 16, gap: 9 },
  formHeadingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 5 },
  formIcon: { width: 38, height: 38, borderRadius: brand.radii.small, alignItems: 'center', justifyContent: 'center', backgroundColor: brand.colors.goldSurface },
  formHeadingCopy: { flex: 1 },
  formTitle: { color: brand.colors.text, fontSize: 16, fontWeight: '800' },
  formSubtitle: { color: brand.colors.textMuted, fontSize: 11, lineHeight: 16, marginTop: 2 },
  fieldLabel: { color: brand.colors.goldBright, fontSize: 9, fontWeight: '900', letterSpacing: 1.15, marginTop: 5 },
  photoPickerButton: { minHeight: 46, borderRadius: brand.radii.small, borderWidth: 1, borderColor: brand.colors.borderStrong, backgroundColor: brand.colors.inset, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  photoPickerText: { color: brand.colors.goldBright, fontSize: 12, fontWeight: '800' },
  photoPreviewList: { gap: 9, paddingVertical: 2, paddingRight: 4 },
  photoPreviewWrap: { width: 78, height: 78, position: 'relative' },
  photoPreview: { width: 78, height: 78, borderRadius: brand.radii.small, backgroundColor: brand.colors.inset },
  removePhotoButton: { position: 'absolute', top: 3, right: 3, width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(12, 16, 22, 0.88)', borderWidth: 1, borderColor: brand.colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
  removePhotoText: { color: brand.colors.text, fontSize: 18, fontWeight: '700', lineHeight: 21 },
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
  formWarning: { color: brand.colors.goldBright, fontSize: 12, lineHeight: 17 },
  formSuccess: { color: brand.colors.success, fontSize: 12, lineHeight: 17 },
  addButton: { minHeight: 48, borderRadius: brand.radii.small, backgroundColor: brand.colors.goldBright, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 5 },
  addButtonPressed: { opacity: 0.8 },
  addButtonDisabled: { opacity: 0.7 },
  addButtonText: { color: brand.colors.background, fontSize: 14, fontWeight: '900' },
  addArrow: { color: brand.colors.background, fontSize: 19, fontWeight: '700' },
  continueButton: { minHeight: 42, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: brand.colors.cyan, borderRadius: brand.radii.small, backgroundColor: brand.colors.cyanSurface },
  continueButtonText: { color: brand.colors.cyan, fontSize: 12, fontWeight: '900' },
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

function createStylesWebResponsive(layout: ReturnType<typeof useResponsiveLayout>) {
  return StyleSheet.create({
    ...styles,
    listContent: {
      ...styles["listContent"],
      paddingHorizontal: layout.isWeb ? layout.webResponsiveWidth(16) : 16,
      paddingBottom: layout.isWeb ? layout.webResponsiveHeight(32) : 32,
    },
    headerContent: {
      ...styles["headerContent"],
      maxWidth: layout.isWeb ? layout.webResponsiveWidth(760) : 760,
    },
    brandRow: {
      ...styles["brandRow"],
      paddingTop: layout.isWeb ? layout.webResponsiveHeight(15) : 15,
      paddingBottom: layout.isWeb ? layout.webResponsiveHeight(24) : 24,
      gap: layout.isWeb ? layout.webResponsiveWidth(10) : 10,
    },
    brandMark: {
      ...styles["brandMark"],
      width: layout.isWeb ? layout.webResponsiveWidth(38) : 38,
      height: layout.isWeb ? layout.webResponsiveHeight(38) : 38,
      borderRadius: layout.isWeb ? layout.webResponsiveWidth(13) : 13,
    },
    brandLetter: {
      ...styles["brandLetter"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(23) : 23,
    },
    brandName: {
      ...styles["brandName"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(14) : 14,
    },
    brandLabel: {
      ...styles["brandLabel"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(9) : 9,
    },
    previewPill: {
      ...styles["previewPill"],
      gap: layout.isWeb ? layout.webResponsiveWidth(6) : 6,
      paddingHorizontal: layout.isWeb ? layout.webResponsiveWidth(9) : 9,
      paddingVertical: layout.isWeb ? layout.webResponsiveHeight(7) : 7,
    },
    previewDot: {
      ...styles["previewDot"],
      width: layout.isWeb ? layout.webResponsiveWidth(6) : 6,
      height: layout.isWeb ? layout.webResponsiveHeight(6) : 6,
      borderRadius: layout.isWeb ? layout.webResponsiveWidth(3) : 3,
    },
    previewText: {
      ...styles["previewText"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(9) : 9,
    },
    headingBlock: {
      ...styles["headingBlock"],
      gap: layout.isWeb ? layout.webResponsiveWidth(5) : 5,
      marginBottom: layout.isWeb ? layout.webResponsiveHeight(20) : 20,
    },
    accountRow: {
      ...styles["accountRow"],
      gap: layout.isWeb ? layout.webResponsiveWidth(10) : 10,
      marginBottom: layout.isWeb ? layout.webResponsiveHeight(16) : 16,
    },
    accountLabel: {
      ...styles["accountLabel"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(11) : 11,
    },
    signOutButton: {
      ...styles["signOutButton"],
      paddingHorizontal: layout.isWeb ? layout.webResponsiveWidth(11) : 11,
      paddingVertical: layout.isWeb ? layout.webResponsiveHeight(7) : 7,
    },
    signOutText: {
      ...styles["signOutText"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(10) : 10,
    },
    eyebrow: {
      ...styles["eyebrow"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(9) : 9,
    },
    heading: {
      ...styles["heading"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(29) : 29,
      lineHeight: layout.isWeb ? layout.webResponsiveFont(34) : 34,
    },
    subtitle: {
      ...styles["subtitle"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(13) : 13,
      lineHeight: layout.isWeb ? layout.webResponsiveFont(19) : 19,
      maxWidth: layout.isWeb ? layout.webResponsiveWidth(560) : 560,
    },
    summaryRow: {
      ...styles["summaryRow"],
      gap: layout.isWeb ? layout.webResponsiveWidth(10) : 10,
      marginBottom: layout.isWeb ? layout.webResponsiveHeight(18) : 18,
    },
    summaryCard: {
      ...styles["summaryCard"],
      gap: layout.isWeb ? layout.webResponsiveWidth(4) : 4,
    },
    summaryLabel: {
      ...styles["summaryLabel"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(9) : 9,
    },
    summaryValue: {
      ...styles["summaryValue"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(27) : 27,
    },
    summaryNote: {
      ...styles["summaryNote"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(11) : 11,
      lineHeight: layout.isWeb ? layout.webResponsiveFont(15) : 15,
    },
    inventorySection: {
      ...styles["inventorySection"],
      gap: layout.isWeb ? layout.webResponsiveWidth(10) : 10,
      marginBottom: layout.isWeb ? layout.webResponsiveHeight(18) : 18,
    },
    inventoryHeadingRow: {
      ...styles["inventoryHeadingRow"],
      gap: layout.isWeb ? layout.webResponsiveWidth(10) : 10,
    },
    inventoryHeadingCopy: {
      ...styles["inventoryHeadingCopy"],
      gap: layout.isWeb ? layout.webResponsiveWidth(4) : 4,
    },
    viewInventoryButton: {
      ...styles["viewInventoryButton"],
      paddingVertical: layout.isWeb ? layout.webResponsiveHeight(7) : 7,
      paddingLeft: layout.isWeb ? layout.webResponsiveWidth(8) : 8,
    },
    viewInventoryText: {
      ...styles["viewInventoryText"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(11) : 11,
    },
    inventoryState: {
      ...styles["inventoryState"],
      minHeight: layout.isWeb ? layout.webResponsiveHeight(58) : 58,
      gap: layout.isWeb ? layout.webResponsiveWidth(9) : 9,
    },
    inventoryStateText: {
      ...styles["inventoryStateText"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(11) : 11,
      lineHeight: layout.isWeb ? layout.webResponsiveFont(16) : 16,
    },
    inventoryHint: {
      ...styles["inventoryHint"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(10) : 10,
      lineHeight: layout.isWeb ? layout.webResponsiveFont(15) : 15,
    },
    keepFlipItemCard: {
      ...styles["keepFlipItemCard"],
      maxWidth: layout.isWeb ? layout.webResponsiveWidth(760) : 760,
      gap: layout.isWeb ? layout.webResponsiveWidth(11) : 11,
    },
    formCard: {
      ...styles["formCard"],
      gap: layout.isWeb ? layout.webResponsiveWidth(9) : 9,
    },
    formHeadingRow: {
      ...styles["formHeadingRow"],
      gap: layout.isWeb ? layout.webResponsiveWidth(10) : 10,
      marginBottom: layout.isWeb ? layout.webResponsiveHeight(5) : 5,
    },
    formIcon: {
      ...styles["formIcon"],
      width: layout.isWeb ? layout.webResponsiveWidth(38) : 38,
      height: layout.isWeb ? layout.webResponsiveHeight(38) : 38,
    },
    formTitle: {
      ...styles["formTitle"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(16) : 16,
    },
    formSubtitle: {
      ...styles["formSubtitle"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(11) : 11,
      lineHeight: layout.isWeb ? layout.webResponsiveFont(16) : 16,
    },
    fieldLabel: {
      ...styles["fieldLabel"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(9) : 9,
      marginTop: layout.isWeb ? layout.webResponsiveHeight(5) : 5,
    },
    photoPickerButton: {
      ...styles["photoPickerButton"],
      minHeight: layout.isWeb ? layout.webResponsiveHeight(46) : 46,
      gap: layout.isWeb ? layout.webResponsiveWidth(9) : 9,
    },
    photoPickerText: {
      ...styles["photoPickerText"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(12) : 12,
    },
    photoPreviewList: {
      ...styles["photoPreviewList"],
      gap: layout.isWeb ? layout.webResponsiveWidth(9) : 9,
      paddingRight: layout.isWeb ? layout.webResponsiveWidth(4) : 4,
    },
    photoPreviewWrap: {
      ...styles["photoPreviewWrap"],
      width: layout.isWeb ? layout.webResponsiveWidth(78) : 78,
      height: layout.isWeb ? layout.webResponsiveHeight(78) : 78,
    },
    photoPreview: {
      ...styles["photoPreview"],
      width: layout.isWeb ? layout.webResponsiveWidth(78) : 78,
      height: layout.isWeb ? layout.webResponsiveHeight(78) : 78,
    },
    removePhotoButton: {
      ...styles["removePhotoButton"],
      width: layout.isWeb ? layout.webResponsiveWidth(24) : 24,
      height: layout.isWeb ? layout.webResponsiveHeight(24) : 24,
      borderRadius: layout.isWeb ? layout.webResponsiveWidth(12) : 12,
    },
    removePhotoText: {
      ...styles["removePhotoText"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(18) : 18,
      lineHeight: layout.isWeb ? layout.webResponsiveFont(21) : 21,
    },
    input: {
      ...styles["input"],
      minHeight: layout.isWeb ? layout.webResponsiveHeight(48) : 48,
      paddingHorizontal: layout.isWeb ? layout.webResponsiveWidth(13) : 13,
      fontSize: layout.isWeb ? layout.webResponsiveFont(14) : 14,
    },
    priceField: {
      ...styles["priceField"],
      minHeight: layout.isWeb ? layout.webResponsiveHeight(48) : 48,
      paddingHorizontal: layout.isWeb ? layout.webResponsiveWidth(13) : 13,
    },
    dollarSign: {
      ...styles["dollarSign"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(17) : 17,
      marginRight: layout.isWeb ? layout.webResponsiveWidth(5) : 5,
    },
    priceInput: {
      ...styles["priceInput"],
      minHeight: layout.isWeb ? layout.webResponsiveHeight(46) : 46,
      fontSize: layout.isWeb ? layout.webResponsiveFont(14) : 14,
    },
    conditionRow: {
      ...styles["conditionRow"],
      gap: layout.isWeb ? layout.webResponsiveWidth(7) : 7,
    },
    conditionChip: {
      ...styles["conditionChip"],
      minHeight: layout.isWeb ? layout.webResponsiveHeight(35) : 35,
      paddingHorizontal: layout.isWeb ? layout.webResponsiveWidth(10) : 10,
    },
    conditionText: {
      ...styles["conditionText"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(11) : 11,
    },
    formError: {
      ...styles["formError"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(12) : 12,
      lineHeight: layout.isWeb ? layout.webResponsiveFont(17) : 17,
    },
    formWarning: {
      ...styles["formWarning"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(12) : 12,
      lineHeight: layout.isWeb ? layout.webResponsiveFont(17) : 17,
    },
    formSuccess: {
      ...styles["formSuccess"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(12) : 12,
      lineHeight: layout.isWeb ? layout.webResponsiveFont(17) : 17,
    },
    addButton: {
      ...styles["addButton"],
      minHeight: layout.isWeb ? layout.webResponsiveHeight(48) : 48,
      gap: layout.isWeb ? layout.webResponsiveWidth(8) : 8,
      marginTop: layout.isWeb ? layout.webResponsiveHeight(5) : 5,
    },
    addButtonText: {
      ...styles["addButtonText"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(14) : 14,
    },
    addArrow: {
      ...styles["addArrow"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(19) : 19,
    },
    continueButton: {
      ...styles["continueButton"],
      minHeight: layout.isWeb ? layout.webResponsiveHeight(42) : 42,
    },
    continueButtonText: {
      ...styles["continueButtonText"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(12) : 12,
    },
    previewNote: {
      ...styles["previewNote"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(11) : 11,
      lineHeight: layout.isWeb ? layout.webResponsiveFont(16) : 16,
      marginTop: layout.isWeb ? layout.webResponsiveHeight(3) : 3,
    },
    listHeading: {
      ...styles["listHeading"],
      marginTop: layout.isWeb ? layout.webResponsiveHeight(25) : 25,
      marginBottom: layout.isWeb ? layout.webResponsiveHeight(12) : 12,
    },
    sectionTitle: {
      ...styles["sectionTitle"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(20) : 20,
      marginTop: layout.isWeb ? layout.webResponsiveHeight(4) : 4,
    },
    countPill: {
      ...styles["countPill"],
      minWidth: layout.isWeb ? layout.webResponsiveWidth(29) : 29,
      height: layout.isWeb ? layout.webResponsiveHeight(29) : 29,
      paddingHorizontal: layout.isWeb ? layout.webResponsiveWidth(8) : 8,
    },
    countText: {
      ...styles["countText"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(12) : 12,
    },
    errorCard: {
      ...styles["errorCard"],
      marginBottom: layout.isWeb ? layout.webResponsiveHeight(12) : 12,
    },
    errorTitle: {
      ...styles["errorTitle"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(14) : 14,
    },
    errorBody: {
      ...styles["errorBody"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(12) : 12,
      lineHeight: layout.isWeb ? layout.webResponsiveFont(18) : 18,
      marginTop: layout.isWeb ? layout.webResponsiveHeight(4) : 4,
    },
    retryButton: {
      ...styles["retryButton"],
      paddingVertical: layout.isWeb ? layout.webResponsiveHeight(8) : 8,
      marginTop: layout.isWeb ? layout.webResponsiveHeight(5) : 5,
    },
    retryText: {
      ...styles["retryText"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(12) : 12,
    },
    emptyCard: {
      ...styles["emptyCard"],
      maxWidth: layout.isWeb ? layout.webResponsiveWidth(760) : 760,
      gap: layout.isWeb ? layout.webResponsiveWidth(7) : 7,
    },
    emptyIcon: {
      ...styles["emptyIcon"],
      width: layout.isWeb ? layout.webResponsiveWidth(58) : 58,
      height: layout.isWeb ? layout.webResponsiveHeight(58) : 58,
      borderRadius: layout.isWeb ? layout.webResponsiveWidth(19) : 19,
      marginBottom: layout.isWeb ? layout.webResponsiveHeight(5) : 5,
    },
    emptyTitle: {
      ...styles["emptyTitle"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(15) : 15,
    },
    emptyBody: {
      ...styles["emptyBody"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(12) : 12,
      lineHeight: layout.isWeb ? layout.webResponsiveFont(18) : 18,
    },
    productCard: {
      ...styles["productCard"],
      maxWidth: layout.isWeb ? layout.webResponsiveWidth(760) : 760,
      gap: layout.isWeb ? layout.webResponsiveWidth(11) : 11,
      marginBottom: layout.isWeb ? layout.webResponsiveHeight(10) : 10,
    },
    productIcon: {
      ...styles["productIcon"],
      width: layout.isWeb ? layout.webResponsiveWidth(46) : 46,
      height: layout.isWeb ? layout.webResponsiveHeight(46) : 46,
    },
    productTitle: {
      ...styles["productTitle"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(14) : 14,
      lineHeight: layout.isWeb ? layout.webResponsiveFont(19) : 19,
    },
    productMeta: {
      ...styles["productMeta"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(10) : 10,
      lineHeight: layout.isWeb ? layout.webResponsiveFont(15) : 15,
      marginTop: layout.isWeb ? layout.webResponsiveHeight(3) : 3,
    },
    productRight: {
      ...styles["productRight"],
      gap: layout.isWeb ? layout.webResponsiveWidth(6) : 6,
    },
    productPrice: {
      ...styles["productPrice"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(14) : 14,
    },
    draftPill: {
      ...styles["draftPill"],
      paddingHorizontal: layout.isWeb ? layout.webResponsiveWidth(7) : 7,
      paddingVertical: layout.isWeb ? layout.webResponsiveHeight(4) : 4,
    },
    draftText: {
      ...styles["draftText"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(8) : 8,
    },
    listButton: {
      ...styles["listButton"],
      paddingHorizontal: layout.isWeb ? layout.webResponsiveWidth(10) : 10,
      paddingVertical: layout.isWeb ? layout.webResponsiveHeight(7) : 7,
    },
    listButtonText: {
      ...styles["listButtonText"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(11) : 11,
    },
  });
}
