import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, type Href } from 'expo-router';
import { File } from 'expo-file-system';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { ID } from 'react-native-appwrite';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useKeepFlipAuth } from '@/components/auth/keepflip-auth-context';
import { KeepFlipText as Text, KeepFlipTextInput as TextInput } from '@/components/ui/keepflip-text';
import { brand } from '@/components/crosslisting-lab/brand';
import type {
  InventoryProduct,
  ListingJob,
  MarketplaceConnectionStatus,
  MarketplaceId,
  ProductPhoto,
} from '@/components/crosslisting-lab/types';
import { channels } from '@/components/crosslisting-lab/types';
import { deleteProductPhoto, getProduct, listConnections, listListingJobs, listProductPhotos, queueListing, uploadProductPhoto } from '@/services/crosslisting-lab-api';

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

export function ListItemScreen({ productId }: { productId: string }) {
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
    if (connections[platform] !== 'connected') { setError('Save test access for this marketplace first.'); return; }
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

  const savedChannels = channels.filter((channel) => connections[channel.id] === 'connected');

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.content}>
          <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.backButton}><Text style={styles.backText}>← Master catalog</Text></Pressable>
          <Text style={styles.eyebrow}>KEEPFLIP / CROSSLISTING LAB</Text>
          <Text style={styles.title}>Prepare a listing</Text>
          <Text style={styles.subtitle}>Choose one marketplace, map its required fields, then queue a test listing.</Text>

          {loading && !product ? <View style={styles.card}><ActivityIndicator color={brand.colors.goldBright} /><Text style={styles.body}>Loading item…</Text></View> : null}
          {product ? <View style={styles.itemCard}><Text style={styles.itemTitle}>{product.title}</Text><Text style={styles.itemPrice}>Target ${product.targetPrice.toFixed(2)}</Text></View> : null}
          {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
          {success ? <Text accessibilityRole="alert" style={styles.success}>{success}</Text> : null}

          {product ? <View style={styles.card}>
            <Text style={styles.cardTitle}>Item photos</Text>
            <Text style={styles.body}>Photos stay in the private crosslisting bucket. Add at least one before queueing a listing.</Text>
            <View style={styles.photoGrid}>{photos.map((photo) => <View key={photo.id} style={styles.photoTile}>
              <Image source={{ uri: photo.viewUrl }} cachePolicy="disk" contentFit="cover" style={styles.photo} />
              <Pressable accessibilityRole="button" accessibilityLabel={`Remove photo ${photo.position + 1}`} disabled={uploadingPhoto} onPress={() => { void removePhoto(photo.id); }} style={styles.removePhoto}><Text style={styles.removePhotoText}>Remove</Text></Pressable>
            </View>)}</View>
            <Pressable accessibilityRole="button" disabled={uploadingPhoto} onPress={() => { void addPhoto(); }} style={styles.linkButton}><Text style={styles.linkText}>{uploadingPhoto ? 'Uploading photo…' : '+ Add photo'}</Text></Pressable>
          </View> : null}

          {product ? <View style={styles.card}>
            <Text style={styles.cardTitle}>Marketplace</Text>
            {savedChannels.length ? <View style={styles.channelRow}>{savedChannels.map((channel) => (
              <Pressable key={channel.id} accessibilityRole="radio" accessibilityState={{ checked: platform === channel.id }} onPress={() => { setPlatform(channel.id); setFieldsJson('{}'); pendingKey.current = null; }} style={[styles.channelChip, platform === channel.id && styles.channelChipActive]}>
                <Text style={[styles.channelText, platform === channel.id && styles.channelTextActive]}>{channel.name}</Text>
              </Pressable>
            ))}</View> : <Text style={styles.body}>No marketplace access is saved yet. Open Connections to add a test account.</Text>}
            <Pressable accessibilityRole="button" onPress={() => router.push('/crosslisting/connections' as Href)} style={styles.linkButton}><Text style={styles.linkText}>Open Connections →</Text></Pressable>

            {platform ? <>
              <Text style={styles.label}>LISTING PRICE</Text>
              <TextInput accessibilityLabel="Listing price in dollars" keyboardType="decimal-pad" onChangeText={(value) => { setPrice(value); pendingKey.current = null; }} placeholder="0.00" placeholderTextColor={brand.colors.textMuted} style={styles.input} value={price} />
              <Text style={styles.label}>MARKETPLACE FIELDS / JSON</Text>
              <Text style={styles.hint}>Required keys: {requiredFields[platform].join(', ')}. Use IDs and values from your seller account.</Text>
              <TextInput accessibilityLabel="Marketplace fields JSON" autoCapitalize="none" autoCorrect={false} multiline onChangeText={(value) => { setFieldsJson(value); pendingKey.current = null; }} placeholder="{}" placeholderTextColor={brand.colors.textMuted} style={[styles.input, styles.jsonInput]} textAlignVertical="top" value={fieldsJson} />
              <Text style={styles.hint}>Submitting queues a real publish attempt when your local worker is running. Browser form mappings are still unverified.</Text>
              <Pressable accessibilityRole="button" accessibilityState={{ disabled: saving }} disabled={saving} onPress={() => { void submit(); }} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed, saving && styles.disabled]}>
                {saving ? <ActivityIndicator color={brand.colors.background} size="small" /> : null}
                <Text style={styles.primaryText}>{saving ? 'Queueing…' : 'Queue test listing'}</Text>
              </Pressable>
            </> : null}
          </View> : null}

          {product ? <View style={styles.card}>
            <View style={styles.activityHeader}><Text style={styles.cardTitle}>Listing activity</Text><Pressable accessibilityRole="button" onPress={() => { void refresh(); }}><Text style={styles.linkText}>Refresh</Text></Pressable></View>
            {jobs.length ? jobs.map((job) => <View key={job.id} style={styles.jobRow}>
              <Text style={styles.jobName}>{channels.find((channel) => channel.id === job.marketplace)?.name ?? job.marketplace}</Text>
              <Text style={styles.jobStatus}>{job.status.replaceAll('_', ' ')}</Text>
              {job.lastError ? <Text style={styles.jobError}>{job.lastError}</Text> : null}
            </View>) : <Text style={styles.body}>No listing jobs for this item yet.</Text>}
          </View> : null}
        </View>
      </ScrollView>
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
