import { Image } from "expo-image";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";

import { KeepFlipText as Text } from "@/components/ui/keepflip-text";
import { keepFlipTheme as theme } from "@/constants/keepflip-theme";
import { releasePhotoBackgroundPreview, removePhotoBackground } from "@/services/photo-background-removal.native";
import { releaseInventoryCoverImageUri, resolveInventoryCoverImageUri } from "@/services/inventory-cover-image";
import { getItemPhotos, saveBackgroundRemovedItemPhoto, type ItemPhoto } from "@/services/itemPhotoService";

type Props = {
  itemId: string;
  ownerId: string;
  photoCount: number;
  onSaved: () => Promise<void>;
};

export function PhotoBackgroundRemover({ itemId, ownerId, photoCount, onSaved }: Props) {
  const [photos, setPhotos] = useState<ItemPhoto[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [source, setSource] = useState<{ fileId: string; uri: string } | null>(null);
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    let active = true;
    getItemPhotos({ itemId, ownerId })
      .then((nextPhotos) => {
        if (!active) return;
        setPhotos(nextPhotos);
        setSelectedIndex((current) => Math.min(current, Math.max(nextPhotos.length - 1, 0)));
        setError(null);
      })
      .catch((caughtError: unknown) => {
        if (!active) return;
        setError(caughtError instanceof Error ? caughtError.message : "KeepFlip could not load the saved photos.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [itemId, ownerId, photoCount]);

  const selected = photos[selectedIndex];
  useEffect(() => {
    let active = true;
    let resolvedUri: string | null = null;
    if (selected?.fileId) {
      resolveInventoryCoverImageUri(selected.fileId)
        .then((uri) => {
          if (!active) {
            if (uri) releaseInventoryCoverImageUri(uri);
            return;
          }
          resolvedUri = uri;
          if (uri) setSource({ fileId: selected.fileId, uri });
          if (!uri) setError("KeepFlip could not open the selected photo.");
        })
        .catch((caughtError: unknown) => {
          if (active) setError(caughtError instanceof Error ? caughtError.message : "KeepFlip could not open this photo.");
        });
    }
    return () => {
      active = false;
      if (resolvedUri) releaseInventoryCoverImageUri(resolvedUri);
    };
  }, [selected?.fileId]);

  useEffect(() => () => releasePhotoBackgroundPreview(previewUri), [previewUri]);

  const sourceUri = source?.fileId === selected?.fileId ? source.uri : null;

  const choosePhoto = useCallback((direction: -1 | 1) => {
    if (processing || saving || photos.length < 2) return;
    setSelectedIndex((current) => (current + direction + photos.length) % photos.length);
    setPreviewUri(null);
    setError(null);
    setNotice(null);
  }, [photos.length, processing, saving]);

  const removeBackground = useCallback(async () => {
    if (!sourceUri || processing || saving) return;
    setProcessing(true);
    setError(null);
    setNotice(null);
    setPreviewUri(null);
    try {
      const uri = await removePhotoBackground(sourceUri);
      if (mountedRef.current) setPreviewUri(uri);
      else releasePhotoBackgroundPreview(uri);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "KeepFlip could not remove the background from this photo.");
    } finally {
      setProcessing(false);
    }
  }, [processing, saving, sourceUri]);

  const saveCutout = useCallback(async () => {
    if (!previewUri || saving || processing) return;
    setSaving(true);
    setError(null);
    try {
      await saveBackgroundRemovedItemPhoto({ itemId, ownerId, previewUri });
      setPreviewUri(null);
      setNotice("Cutout saved as another item photo. The original is still here.");
      await onSaved();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "KeepFlip could not save the cutout.");
    } finally {
      setSaving(false);
    }
  }, [itemId, onSaved, ownerId, previewUri, processing, saving]);

  const busy = processing || saving;
  const displayedUri = previewUri ?? sourceUri;

  return (
    <View style={styles.panel}>
      <Text style={styles.eyebrow}>PHOTO BACKGROUND</Text>
      <Text style={styles.description}>
        Pick a saved photo, remove its background, then review the cutout before saving it.
      </Text>
      {loading ? (
        <ActivityIndicator color={theme.colors.scannerCyan} style={styles.loader} />
      ) : photos.length === 0 ? (
        <Text style={styles.helper}>Add an item photo above to make a cutout.</Text>
      ) : (
        <>
          <View style={styles.previewRow}>
            <Pressable
              accessibilityLabel="Previous item photo"
              accessibilityRole="button"
              accessibilityState={{ disabled: busy || photos.length < 2 }}
              disabled={busy || photos.length < 2}
              onPress={() => choosePhoto(-1)}
              style={({ pressed }) => [styles.photoArrow, pressed && styles.pressed]}
            >
              <Text style={styles.arrowText}>‹</Text>
            </Pressable>
            <View style={styles.previewFrame}>
              {displayedUri ? (
                <Image
                  accessibilityLabel={previewUri ? "Background removed preview" : "Original item photo"}
                  contentFit="contain"
                  source={{ uri: displayedUri }}
                  style={styles.previewImage}
                />
              ) : (
                <ActivityIndicator color={theme.colors.scannerCyan} />
              )}
            </View>
            <Pressable
              accessibilityLabel="Next item photo"
              accessibilityRole="button"
              accessibilityState={{ disabled: busy || photos.length < 2 }}
              disabled={busy || photos.length < 2}
              onPress={() => choosePhoto(1)}
              style={({ pressed }) => [styles.photoArrow, pressed && styles.pressed]}
            >
              <Text style={styles.arrowText}>›</Text>
            </Pressable>
          </View>
          <Text style={styles.helper}>
            Photo {selectedIndex + 1} of {photos.length} · {previewUri ? "Cutout preview" : "Original"}
          </Text>
          {previewUri ? (
            <View style={styles.actions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Discard cutout preview"
                disabled={busy}
                onPress={() => setPreviewUri(null)}
                style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
              >
                <Text style={styles.secondaryText}>DISCARD</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Save cutout as a new item photo"
                accessibilityState={{ disabled: busy || photoCount >= 10 }}
                disabled={busy || photoCount >= 10}
                onPress={() => void saveCutout()}
                style={({ pressed }) => [styles.primaryButton, (pressed || busy || photoCount >= 10) && styles.dimmed]}
              >
                {saving ? <ActivityIndicator color={theme.colors.textOnAccent} /> : <Text style={styles.primaryText}>SAVE NEW PHOTO</Text>}
              </Pressable>
            </View>
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Remove background from selected item photo"
              accessibilityState={{ disabled: busy || !sourceUri }}
              disabled={busy || !sourceUri}
              onPress={() => void removeBackground()}
              style={({ pressed }) => [styles.primaryButton, (pressed || busy || !sourceUri) && styles.dimmed]}
            >
              {processing ? <ActivityIndicator color={theme.colors.textOnAccent} /> : <Text style={styles.primaryText}>REMOVE BACKGROUND</Text>}
            </Pressable>
          )}
          {photoCount >= 10 && previewUri ? (
            <Text style={styles.helper}>This item has 10 photos. Remove one before saving the cutout.</Text>
          ) : null}
        </>
      )}
      {error ? <Text selectable style={styles.error}>{error}</Text> : null}
      {notice ? <Text style={styles.notice}>{notice}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    borderColor: theme.colors.divider,
    borderTopWidth: 1,
    gap: 10,
    marginTop: 16,
    paddingTop: 16,
  },
  eyebrow: { color: theme.colors.scannerCyan, fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  description: { color: theme.colors.textMuted, fontSize: 12, lineHeight: 18 },
  helper: { color: theme.colors.textMuted, fontSize: 11, textAlign: "center" },
  loader: { marginVertical: 20 },
  previewRow: { alignItems: "center", flexDirection: "row", gap: 8 },
  previewFrame: {
    alignItems: "center",
    backgroundColor: "#606068",
    borderColor: theme.colors.divider,
    borderRadius: 10,
    borderWidth: 1,
    flex: 1,
    height: 230,
    justifyContent: "center",
    overflow: "hidden",
  },
  previewImage: { height: "100%", width: "100%" },
  photoArrow: {
    alignItems: "center",
    borderColor: theme.colors.divider,
    borderRadius: 8,
    borderWidth: 1,
    height: 42,
    justifyContent: "center",
    width: 34,
  },
  arrowText: { color: theme.colors.text, fontSize: 28, lineHeight: 32 },
  actions: { flexDirection: "row", gap: 8 },
  primaryButton: {
    alignItems: "center",
    backgroundColor: theme.colors.scannerCyan,
    borderRadius: 8,
    flex: 1,
    justifyContent: "center",
    minHeight: 40,
    paddingHorizontal: 12,
  },
  primaryText: { color: theme.colors.textOnAccent, fontSize: 10, fontWeight: "900", letterSpacing: 0.6 },
  secondaryButton: {
    alignItems: "center",
    borderColor: theme.colors.divider,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 40,
    paddingHorizontal: 12,
  },
  secondaryText: { color: theme.colors.text, fontSize: 10, fontWeight: "800" },
  pressed: { opacity: 0.76 },
  dimmed: { opacity: 0.55 },
  error: { color: theme.colors.goldBright, fontSize: 12, lineHeight: 18 },
  notice: { color: theme.colors.scannerCyan, fontSize: 12, lineHeight: 18 },
});
