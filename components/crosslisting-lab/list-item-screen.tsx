import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, type Href } from 'expo-router';
import { File } from 'expo-file-system';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { ID } from 'react-native-appwrite';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useKeepFlipAuth } from '@/components/auth/keepflip-auth-context';
import { KeepFlipText as Text, KeepFlipTextInput as TextInput } from '@/components/ui/keepflip-text';
import { MarketplaceAuthModal } from '@/components/connections/marketplace-auth-modal';
import { CROSSLISTING_DESTINATIONS, createCrosslistingPayload, type CrosslistingMarketplace, type CrosslistingPayload } from '@/services/crosslisting-service';
import { brand } from '@/components/crosslisting-lab/brand';
import type {
  InventoryProduct,
  ListingJob,
  MarketplaceConnectionStatus,
  MarketplaceId,
  ProductPhoto,
} from '@/components/crosslisting-lab/types';
import { channels } from '@/components/crosslisting-lab/types';
import { CROSSLISTING_PHOTOS_BUCKET_ID, deleteProductPhoto, getProduct, listConnections, listListingJobs, listProductPhotos, queueListing, uploadProductPhoto } from '@/services/crosslisting-lab-api';
import { useResponsiveLayout, useResponsiveStyles } from '@/hooks/use-responsive-layout';

const requiredFields: Record<MarketplaceId, string[]> = {
  ebay: ['categoryId', 'merchantLocationKey', 'fulfillmentPolicyId', 'paymentPolicyId', 'returnPolicyId'],
  shopify: ['locationId', 'publicationId'],
  poshmark: ['category', 'size', 'originalPrice'],
  mercari: ['category', 'condition'],
  depop: ['category', 'condition', 'shipping'],
  facebook_marketplace: ['category', 'condition', 'location'],
  offerup: ['category', 'condition', 'location'],
};

function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message.replaceAll('_', ' ') : 'Could not complete the listing request.';
}

function toWebViewMarketplace(platform: MarketplaceId): CrosslistingMarketplace | null {
  switch (platform) {
    case 'poshmark':
    case 'mercari':
    case 'depop':
      return platform;
    case 'facebook_marketplace':
      return 'facebookMarketplace';
    case 'offerup':
      return 'offerUp';
    default:
      return null;
  }
}

function stringFields(value: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    ),
  );
}

export function ListItemScreen({ productId }: { productId: string }) {
  const responsiveStyles = useResponsiveStyles(createStylesWebResponsive);
  const router = useRouter();
  const { user } = useKeepFlipAuth();
  const [product, setProduct] = useState<InventoryProduct | null>(null);
  const [connections, setConnections] = useState<Partial<Record<MarketplaceId, MarketplaceConnectionStatus>>>({});
  const [jobs, setJobs] = useState<ListingJob[]>([]);
  const [photos, setPhotos] = useState<ProductPhoto[]>([]);
  const [platform, setPlatform] = useState<MarketplaceId | null>(null);
  const [price, setPrice] = useState('');
  const [fieldsJson, setFieldsJson] = useState('{}');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [webViewPayload, setWebViewPayload] = useState<{
    marketplace: CrosslistingMarketplace;
    payload: CrosslistingPayload;
  } | null>(null);
  const pendingKey = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    if (!productId) return;
    setLoading(true);
    setError(null);
    try {
      const [item, savedConnections, recentJobs, savedPhotos] = await Promise.all([
        getProduct(productId), listConnections(), listListingJobs(productId), listProductPhotos(productId),
      ]);
      setProduct(item);
      setConnections(savedConnections);
      setJobs(recentJobs);
      setPhotos(savedPhotos);
      setPrice((current) => current || item.targetPrice.toFixed(2));
      setPlatform((current) => current ?? channels.find((channel) => savedConnections[channel.id] === 'connected')?.id ?? null);
    } catch (cause) {
      setError(messageFrom(cause));
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useEffect(() => { void refresh(); }, [refresh]);

  async function addPhoto() {
    if (!product || !user || uploadingPhoto) return;
    setError(null);
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: false, quality: 0.9 });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset?.uri) return;
    setUploadingPhoto(true);
    try {
      const fileSize = asset.fileSize || new File(asset.uri).size;
      await uploadProductPhoto(product.id, user.$id, {
        uri: asset.uri,
        fileName: asset.fileName,
        fileSize,
        mimeType: asset.mimeType,
      });
      await refresh();
    } catch (cause) {
      setError(messageFrom(cause));
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function removePhoto(imageId: string) {
    if (!product || uploadingPhoto) return;
    setUploadingPhoto(true);
    setError(null);
    try {
      await deleteProductPhoto(product.id, imageId);
      setPhotos((current) => current.filter((photo) => photo.id !== imageId));
    } catch (cause) {
      setError(messageFrom(cause));
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function submit() {
    if (saving || !product || !platform) return;
    setError(null);
    setSuccess(null);
    if (!photos.length) { setError('Add at least one item photo before queueing a listing.'); return; }
    if (!/^\d+(\.\d{1,2})?$/.test(price.trim()) || Number(price) <= 0 || Number(price) > 21_474_836.47) {
      setError('Enter a valid listing price with up to two decimal places.');
      return;
    }
    let platformFields: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(fieldsJson);
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error('invalid');
      platformFields = parsed as Record<string, unknown>;
    } catch {
      setError('Marketplace fields must be a JSON object.');
      return;
    }
    const missing = requiredFields[platform].filter((key) =>
      typeof platformFields[key] !== 'string' || !(platformFields[key] as string).trim());
    if (missing.length) {
      setError(`Add these ${platform} fields before queueing: ${missing.join(', ')}.`);
      return;
    }

    const webViewMarketplace = toWebViewMarketplace(platform);
    if (webViewMarketplace) {
      if (!user?.$id) { setError('Sign in to KeepFlip before preparing a marketplace listing.'); return; }
      const values = stringFields(platformFields);
      const payload = createCrosslistingPayload({
        marketplace: webViewMarketplace,
        title: product.title,
        description: values.description ?? '',
        price: price.trim(),
        category: values.category ?? '',
        condition: values.condition ?? product.condition?.replaceAll('_', ' ') ?? '',
        brand: values.brand ?? '',
        size: values.size ?? '',
        color: values.color ?? '',
        photoCount: photos.length,
        platformFields: values,
      });

      if (Platform.OS === 'web') {
        if (typeof window === 'undefined' || !navigator.clipboard?.writeText) {
          setError('This browser cannot copy the listing draft. Copy the details from the editor instead.');
          return;
        }
        const clipboardWrite = navigator.clipboard.writeText(JSON.stringify(payload));
        window.open(CROSSLISTING_DESTINATIONS[webViewMarketplace].createUrl, '_blank', 'noopener,noreferrer');
        try {
          await clipboardWrite;
          setSuccess(`KeepFlip copied the draft and opened ${channels.find((channel) => channel.id === platform)?.name ?? platform}. Add photos if needed, review the details, and post it when ready.`);
        } catch {
          setError('KeepFlip could not copy the listing draft. Allow clipboard access and try again.');
        }
        return;
      }

      setWebViewPayload({ marketplace: webViewMarketplace, payload });
      setSuccess('Draft ready. KeepFlip will open the marketplace here, fill supported fields, and try to attach saved photos after you log in. Review the page before submitting.');
      return;
    }

    if (connections[platform] !== 'connected') { setError('Connect eBay or Shopify before queueing an API listing.'); return; }
    setSaving(true);
    pendingKey.current ??= ID.unique();
    try {
      const job = await queueListing({
        productId: product.id,
        marketplace: platform,
        listingPrice: Number(price),
        platformFields,
        idempotencyKey: pendingKey.current,
      });
      pendingKey.current = null;
      setJobs((current) => [job, ...current.filter((existing) => existing.id !== job.id)]);
      setSuccess(`${channels.find((channel) => channel.id === platform)?.name ?? platform} listing queued. Refresh activity to see the worker result.`);
    } catch (cause) {
      setError(messageFrom(cause));
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={responsiveStyles.safeArea}>
      <ScrollView contentContainerStyle={responsiveStyles.scroll} keyboardShouldPersistTaps="handled">
        <View style={responsiveStyles.content}>
          <Pressable accessibilityRole="button" onPress={() => router.back()} style={responsiveStyles.backButton}><Text style={responsiveStyles.backText}>← Master catalog</Text></Pressable>
          <Text style={responsiveStyles.eyebrow}>KEEPFLIP / LISTING WORKFLOW</Text>
          <Text style={responsiveStyles.title}>Prepare a listing</Text>
          <Text style={responsiveStyles.subtitle}>Use this saved item and its photos to prepare a marketplace draft. KeepFlip leaves the final review and post with you.</Text>

          {loading && !product ? <View style={responsiveStyles.card}><ActivityIndicator color={brand.colors.goldBright} /><Text style={responsiveStyles.body}>Loading item…</Text></View> : null}
          {product ? <View style={responsiveStyles.itemCard}><Text style={responsiveStyles.itemTitle}>{product.title}</Text><Text style={responsiveStyles.itemPrice}>Target ${product.targetPrice.toFixed(2)}</Text></View> : null}
          {error ? <Text accessibilityRole="alert" style={responsiveStyles.error}>{error}</Text> : null}
          {success ? <Text accessibilityRole="alert" style={responsiveStyles.success}>{success}</Text> : null}

          {product ? <View style={responsiveStyles.card}>
            <Text style={responsiveStyles.cardTitle}>Item photos</Text>
            <Text style={responsiveStyles.body}>Photos stay in your private crosslisting bucket. Add at least one before preparing the listing.</Text>
            <View style={responsiveStyles.photoGrid}>{photos.map((photo) => <View key={photo.id} style={responsiveStyles.photoTile}>
              <Image source={{ uri: photo.viewUrl }} cachePolicy="disk" contentFit="cover" style={responsiveStyles.photo} />
              <Pressable accessibilityRole="button" accessibilityLabel={`Remove photo ${photo.position + 1}`} disabled={uploadingPhoto} onPress={() => { void removePhoto(photo.id); }} style={responsiveStyles.removePhoto}><Text style={responsiveStyles.removePhotoText}>Remove</Text></Pressable>
            </View>)}</View>
            <Pressable accessibilityRole="button" disabled={uploadingPhoto} onPress={() => { void addPhoto(); }} style={responsiveStyles.linkButton}><Text style={responsiveStyles.linkText}>{uploadingPhoto ? 'Uploading photo…' : '+ Add photo'}</Text></Pressable>
          </View> : null}

          {product ? <View style={responsiveStyles.card}>
            <Text style={responsiveStyles.cardTitle}>Marketplace</Text>
            <Text style={responsiveStyles.body}>Choose a marketplace. KeepFlip opens a visible listing page for browser marketplaces; eBay and Shopify use their connected APIs.</Text>
            <View style={responsiveStyles.channelRow}>{channels.map((channel) => (
              <Pressable key={channel.id} accessibilityRole="radio" accessibilityState={{ checked: platform === channel.id }} onPress={() => { setPlatform(channel.id); setFieldsJson('{}'); pendingKey.current = null; }} style={[responsiveStyles.channelChip, platform === channel.id && responsiveStyles.channelChipActive]}>
                <Text style={[responsiveStyles.channelText, platform === channel.id && responsiveStyles.channelTextActive]}>{channel.name}</Text>
              </Pressable>
            ))}</View>
            {platform === 'ebay' || platform === 'shopify' ? (
              <Pressable accessibilityRole="button" onPress={() => router.push('/crosslisting/connections' as Href)} style={responsiveStyles.linkButton}><Text style={responsiveStyles.linkText}>Open Connections →</Text></Pressable>
            ) : null}

            {platform ? <>
              <Text style={responsiveStyles.label}>LISTING PRICE</Text>
              <TextInput accessibilityLabel="Listing price in dollars" keyboardType="decimal-pad" onChangeText={(value) => { setPrice(value); pendingKey.current = null; }} placeholder="0.00" placeholderTextColor={brand.colors.textMuted} style={responsiveStyles.input} value={price} />
              <Text style={responsiveStyles.label}>MARKETPLACE FIELDS / JSON</Text>
              <Text style={responsiveStyles.hint}>Required keys: {requiredFields[platform].join(', ')}. Use IDs and values from your seller account.</Text>
              <TextInput accessibilityLabel="Marketplace fields JSON" autoCapitalize="none" autoCorrect={false} multiline onChangeText={(value) => { setFieldsJson(value); pendingKey.current = null; }} placeholder="{}" placeholderTextColor={brand.colors.textMuted} style={[responsiveStyles.input, responsiveStyles.jsonInput]} textAlignVertical="top" value={fieldsJson} />
              <Text style={responsiveStyles.hint}>{toWebViewMarketplace(platform) ? 'KeepFlip will open the marketplace here, fill supported fields, and try to attach saved photos. Review the draft and post it on the marketplace.' : 'Submitting queues an eBay or Shopify listing through the connected API account.'}</Text>
              <Pressable accessibilityRole="button" accessibilityState={{ disabled: saving }} disabled={saving} onPress={() => { void submit(); }} style={({ pressed }) => [responsiveStyles.primaryButton, pressed && responsiveStyles.pressed, saving && responsiveStyles.disabled]}>
                {saving ? <ActivityIndicator color={brand.colors.background} size="small" /> : null}
                <Text style={responsiveStyles.primaryText}>{saving ? 'Queueing…' : toWebViewMarketplace(platform) ? 'Open marketplace draft' : 'Queue API listing'}</Text>
              </Pressable>
            </> : null}
          </View> : null}

          {product ? <View style={responsiveStyles.card}>
            <View style={responsiveStyles.activityHeader}><Text style={responsiveStyles.cardTitle}>Listing activity</Text><Pressable accessibilityRole="button" onPress={() => { void refresh(); }}><Text style={responsiveStyles.linkText}>Refresh</Text></Pressable></View>
            {jobs.length ? jobs.map((job) => <View key={job.id} style={responsiveStyles.jobRow}>
              <Text style={responsiveStyles.jobName}>{channels.find((channel) => channel.id === job.marketplace)?.name ?? job.marketplace}</Text>
              <Text style={responsiveStyles.jobStatus}>{job.status.replaceAll('_', ' ')}</Text>
              {job.lastError ? <Text style={responsiveStyles.jobError}>{job.lastError}</Text> : null}
            </View>) : <Text style={responsiveStyles.body}>No listing jobs for this item yet.</Text>}
          </View> : null}
        </View>
      </ScrollView>
      {webViewPayload && user?.$id ? (
        <MarketplaceAuthModal
          onClose={() => setWebViewPayload(null)}
          onSaved={() => {
            setSuccess(
              `Opening the ${CROSSLISTING_DESTINATIONS[webViewPayload.marketplace].label} listing page in this device's WebView. Sign in there again if requested.`,
            );
          }}
          payload={webViewPayload.payload}
          photoBucketId={CROSSLISTING_PHOTOS_BUCKET_ID}
          photoFileIds={photos.slice().sort((first, second) => first.position - second.position).map((photo) => photo.fileId)}
          platform={webViewPayload.marketplace}
          userId={user.$id}
          visible
        />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: brand.colors.background },
  scroll: { padding: 18, paddingBottom: 45 },
  content: { width: '100%', maxWidth: 760, alignSelf: 'center', gap: 13 },
  backButton: { alignSelf: 'flex-start', paddingVertical: 10 },
  backText: { color: brand.colors.goldBright, fontSize: 12, fontWeight: '800' },
  eyebrow: { color: brand.colors.gold, fontSize: 9, fontWeight: '900', letterSpacing: 1.5 },
  title: { color: brand.colors.text, fontSize: 29, fontWeight: '900' },
  subtitle: { color: brand.colors.textMuted, fontSize: 13, lineHeight: 19, marginBottom: 4 },
  itemCard: { backgroundColor: brand.colors.cyanSurface, borderColor: brand.colors.cyan, borderWidth: 1, borderRadius: brand.radii.medium, padding: 15, gap: 4 },
  itemTitle: { color: brand.colors.text, fontSize: 16, fontWeight: '900' },
  itemPrice: { color: brand.colors.cyan, fontSize: 12, fontWeight: '800' },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  photoTile: { width: 102, gap: 4 },
  photo: { width: 102, height: 102, borderRadius: brand.radii.small, backgroundColor: brand.colors.inset },
  removePhoto: { alignSelf: 'center', paddingVertical: 4 },
  removePhotoText: { color: brand.colors.danger, fontSize: 10, fontWeight: '800' },
  card: { backgroundColor: brand.colors.card, borderColor: brand.colors.borderStrong, borderWidth: 1, borderRadius: brand.radii.medium, padding: 16, gap: 11 },
  cardTitle: { color: brand.colors.text, fontSize: 17, fontWeight: '900' },
  body: { color: brand.colors.textMuted, fontSize: 12, lineHeight: 18 },
  channelRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  channelChip: { minHeight: 38, borderRadius: brand.radii.pill, borderWidth: 1, borderColor: brand.colors.border, backgroundColor: brand.colors.inset, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  channelChipActive: { borderColor: brand.colors.goldBright, backgroundColor: brand.colors.goldSurface },
  channelText: { color: brand.colors.textMuted, fontSize: 11, fontWeight: '800' },
  channelTextActive: { color: brand.colors.goldBright },
  linkButton: { alignSelf: 'flex-start', paddingVertical: 5 },
  linkText: { color: brand.colors.goldBright, fontSize: 12, fontWeight: '900' },
  label: { color: brand.colors.goldBright, fontSize: 9, fontWeight: '900', letterSpacing: 1.1 },
  hint: { color: brand.colors.textMuted, fontSize: 11, lineHeight: 17 },
  input: { minHeight: 48, borderRadius: brand.radii.small, borderWidth: 1, borderColor: brand.colors.border, backgroundColor: brand.colors.inset, color: brand.colors.text, fontSize: 13, paddingHorizontal: 12, paddingVertical: 10 },
  jsonInput: { minHeight: 120, fontFamily: 'monospace' },
  primaryButton: { minHeight: 48, borderRadius: brand.radii.small, backgroundColor: brand.colors.goldBright, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  primaryText: { color: brand.colors.background, fontSize: 14, fontWeight: '900' },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.6 },
  error: { color: brand.colors.danger, fontSize: 12, lineHeight: 18 },
  success: { color: brand.colors.success, fontSize: 12, lineHeight: 18 },
  activityHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  jobRow: { borderTopColor: brand.colors.border, borderTopWidth: 1, paddingTop: 10, gap: 3 },
  jobName: { color: brand.colors.text, fontSize: 13, fontWeight: '800' },
  jobStatus: { color: brand.colors.cyan, fontSize: 11, fontWeight: '800', textTransform: 'capitalize' },
  jobError: { color: brand.colors.danger, fontSize: 11, lineHeight: 17 },
});

function createStylesWebResponsive(layout: ReturnType<typeof useResponsiveLayout>) {
  return StyleSheet.create({
    ...styles,
    scroll: {
      ...styles["scroll"],
      paddingBottom: layout.isWeb ? layout.webResponsiveHeight(45) : 45,
    },
    content: {
      ...styles["content"],
      maxWidth: layout.isWeb ? layout.webResponsiveWidth(760) : 760,
      gap: layout.isWeb ? layout.webResponsiveWidth(13) : 13,
    },
    backButton: {
      ...styles["backButton"],
      paddingVertical: layout.isWeb ? layout.webResponsiveHeight(10) : 10,
    },
    backText: {
      ...styles["backText"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(12) : 12,
    },
    eyebrow: {
      ...styles["eyebrow"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(9) : 9,
    },
    title: {
      ...styles["title"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(29) : 29,
    },
    subtitle: {
      ...styles["subtitle"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(13) : 13,
      lineHeight: layout.isWeb ? layout.webResponsiveFont(19) : 19,
      marginBottom: layout.isWeb ? layout.webResponsiveHeight(4) : 4,
    },
    itemCard: {
      ...styles["itemCard"],
      gap: layout.isWeb ? layout.webResponsiveWidth(4) : 4,
    },
    itemTitle: {
      ...styles["itemTitle"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(16) : 16,
    },
    itemPrice: {
      ...styles["itemPrice"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(12) : 12,
    },
    photoGrid: {
      ...styles["photoGrid"],
      gap: layout.isWeb ? layout.webResponsiveWidth(10) : 10,
    },
    photoTile: {
      ...styles["photoTile"],
      width: layout.isWeb ? layout.webResponsiveWidth(102) : 102,
      gap: layout.isWeb ? layout.webResponsiveWidth(4) : 4,
    },
    photo: {
      ...styles["photo"],
      width: layout.isWeb ? layout.webResponsiveWidth(102) : 102,
      height: layout.isWeb ? layout.webResponsiveHeight(102) : 102,
    },
    removePhoto: {
      ...styles["removePhoto"],
      paddingVertical: layout.isWeb ? layout.webResponsiveHeight(4) : 4,
    },
    removePhotoText: {
      ...styles["removePhotoText"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(10) : 10,
    },
    card: {
      ...styles["card"],
      gap: layout.isWeb ? layout.webResponsiveWidth(11) : 11,
    },
    cardTitle: {
      ...styles["cardTitle"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(17) : 17,
    },
    body: {
      ...styles["body"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(12) : 12,
      lineHeight: layout.isWeb ? layout.webResponsiveFont(18) : 18,
    },
    channelRow: {
      ...styles["channelRow"],
      gap: layout.isWeb ? layout.webResponsiveWidth(7) : 7,
    },
    channelChip: {
      ...styles["channelChip"],
      minHeight: layout.isWeb ? layout.webResponsiveHeight(38) : 38,
      paddingHorizontal: layout.isWeb ? layout.webResponsiveWidth(12) : 12,
    },
    channelText: {
      ...styles["channelText"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(11) : 11,
    },
    linkButton: {
      ...styles["linkButton"],
      paddingVertical: layout.isWeb ? layout.webResponsiveHeight(5) : 5,
    },
    linkText: {
      ...styles["linkText"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(12) : 12,
    },
    label: {
      ...styles["label"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(9) : 9,
    },
    hint: {
      ...styles["hint"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(11) : 11,
      lineHeight: layout.isWeb ? layout.webResponsiveFont(17) : 17,
    },
    input: {
      ...styles["input"],
      minHeight: layout.isWeb ? layout.webResponsiveHeight(48) : 48,
      fontSize: layout.isWeb ? layout.webResponsiveFont(13) : 13,
      paddingHorizontal: layout.isWeb ? layout.webResponsiveWidth(12) : 12,
      paddingVertical: layout.isWeb ? layout.webResponsiveHeight(10) : 10,
    },
    jsonInput: {
      ...styles["jsonInput"],
      minHeight: layout.isWeb ? layout.webResponsiveHeight(120) : 120,
    },
    primaryButton: {
      ...styles["primaryButton"],
      minHeight: layout.isWeb ? layout.webResponsiveHeight(48) : 48,
      gap: layout.isWeb ? layout.webResponsiveWidth(8) : 8,
    },
    primaryText: {
      ...styles["primaryText"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(14) : 14,
    },
    error: {
      ...styles["error"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(12) : 12,
      lineHeight: layout.isWeb ? layout.webResponsiveFont(18) : 18,
    },
    success: {
      ...styles["success"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(12) : 12,
      lineHeight: layout.isWeb ? layout.webResponsiveFont(18) : 18,
    },
    jobRow: {
      ...styles["jobRow"],
      paddingTop: layout.isWeb ? layout.webResponsiveHeight(10) : 10,
      gap: layout.isWeb ? layout.webResponsiveWidth(3) : 3,
    },
    jobName: {
      ...styles["jobName"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(13) : 13,
    },
    jobStatus: {
      ...styles["jobStatus"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(11) : 11,
    },
    jobError: {
      ...styles["jobError"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(11) : 11,
      lineHeight: layout.isWeb ? layout.webResponsiveFont(17) : 17,
    },
  });
}
