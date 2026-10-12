import { Asset } from "expo-asset";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from "react-native";

import { KeepFlipText as Text } from "@/components/ui/keepflip-text";
import { keepFlipTheme as theme } from "@/constants/keepflip-theme";
import {
  releasePhotoBackgroundPreview,
  removePhotoBackground,
  removePhotoBackgroundWithBiRefNet,
} from "@/services/photo-background-removal.native";

const DEMO_PHOTO_ASSET = require("@/assets/images/walkthrough-coach-bag.jpeg");

type ModelChoice = "Current KeepFlip" | "BiRefNet Lite";

export default function BiRefNetTestScreen() {
  const router = useRouter();
  const { autoRunBiRefNet } = useLocalSearchParams<{ autoRunBiRefNet?: string }>();
  const autoRunStarted = useRef(false);
  const [sourceUri, setSourceUri] = useState<string | null>(null);
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);
  const [runningModel, setRunningModel] = useState<ModelChoice | null>(null);
  const [previewModel, setPreviewModel] = useState<ModelChoice | null>(null);
  const [details, setDetails] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Asset.loadAsync(DEMO_PHOTO_ASSET)
      .then(([asset]) => {
        if (!active) return;
        if (!asset.localUri?.startsWith("file://")) {
          setError("The bundled demo photo could not be opened on this device.");
          return;
        }
        setSourceUri(asset.localUri);
      })
      .catch((caughtError: unknown) => {
        if (active) {
          setError(caughtError instanceof Error ? caughtError.message : "The bundled demo photo could not be loaded.");
        }
      });
    return () => { active = false; };
  }, []);

  useEffect(() => () => releasePhotoBackgroundPreview(previewUri), [previewUri]);

  const runModel = useCallback(async (modelChoice: ModelChoice) => {
    if (!sourceUri || runningModel) return;
    setRunningModel(modelChoice);
    setError(null);
    setDetails(null);
    setPreviewUri(null);
    setPreviewModel(null);
    setShowOriginal(false);
    const startedAt = Date.now();
    try {
      if (modelChoice === "BiRefNet Lite") {
        const result = await removePhotoBackgroundWithBiRefNet(sourceUri);
        setPreviewUri(result.uri);
        setPreviewModel(modelChoice);
        setDetails(
          `${modelChoice} · FP16 weights / FP32 tensors · ${result.delegates.join(", ") || "CPU"} · ${(result.inferenceMs / 1000).toFixed(1)}s inference · ${(result.totalMs / 1000).toFixed(1)}s total`,
        );
        console.info("[BiRefNet test] completed", {
          delegates: result.delegates,
          inferenceMs: result.inferenceMs,
          totalMs: result.totalMs,
        });
      } else {
        const uri = await removePhotoBackground(sourceUri);
        setPreviewUri(uri);
        setPreviewModel(modelChoice);
        setDetails(`${modelChoice} · ${((Date.now() - startedAt) / 1000).toFixed(1)}s total`);
      }
    } catch (caughtError) {
      console.error(
        "[BiRefNet test] failed",
        caughtError instanceof Error ? caughtError.message : caughtError,
      );
      setError(caughtError instanceof Error ? caughtError.message : `${modelChoice} could not process this photo.`);
    } finally {
      setRunningModel(null);
    }
  }, [runningModel, sourceUri]);

  useEffect(() => {
    if (autoRunBiRefNet !== "1" || !sourceUri || autoRunStarted.current) return;
    autoRunStarted.current = true;
    void runModel("BiRefNet Lite");
  }, [autoRunBiRefNet, runModel, sourceUri]);

  const displayedUri = previewUri && !showOriginal ? previewUri : sourceUri;

  return (
    <ScrollView contentContainerStyle={styles.content} style={styles.screen}>
      <Text style={styles.eyebrow}>ON-DEVICE MODEL CHECK</Text>
      <Text style={styles.title}>BiRefNet Lite</Text>
      <Text style={styles.description}>
        This test uses a bundled handbag demo photo. Processing stays on this phone; the preview is not saved or uploaded.
      </Text>

      <View style={styles.previewFrame}>
        {displayedUri ? (
          <Image
            accessibilityLabel={previewUri && !showOriginal ? `${previewModel ?? "Cutout"} preview` : "Bundled handbag demo photo"}
            contentFit="contain"
            source={{ uri: displayedUri }}
            style={styles.previewImage}
          />
        ) : (
          <ActivityIndicator color={theme.colors.scannerCyan} />
        )}
      </View>
      <Text style={styles.helper}>
        {previewUri && !showOriginal ? `${previewModel ?? "Cutout"} preview` : "Bundled Coach bag demo photo"}
      </Text>

      {previewUri ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => setShowOriginal((current) => !current)}
          style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
        >
          <Text style={styles.secondaryText}>{showOriginal ? "SHOW CUTOUT" : "SHOW ORIGINAL"}</Text>
        </Pressable>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Run current KeepFlip cutout model"
        accessibilityState={{ disabled: !sourceUri || Boolean(runningModel) }}
        disabled={!sourceUri || Boolean(runningModel)}
        onPress={() => void runModel("Current KeepFlip")}
        style={({ pressed }) => [styles.secondaryButton, (pressed || Boolean(runningModel) || !sourceUri) && styles.dimmed]}
      >
        {runningModel === "Current KeepFlip" ? (
          <ActivityIndicator color={theme.colors.scannerCyan} />
        ) : (
          <Text style={styles.secondaryText}>RUN CURRENT KEEPFLIP MODEL</Text>
        )}
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Run BiRefNet Lite using the Android CPU runtime"
        accessibilityState={{ disabled: !sourceUri || Boolean(runningModel) }}
        disabled={!sourceUri || Boolean(runningModel)}
        onPress={() => void runModel("BiRefNet Lite")}
        style={({ pressed }) => [styles.primaryButton, (pressed || Boolean(runningModel) || !sourceUri) && styles.dimmed]}
      >
        {runningModel === "BiRefNet Lite" ? (
          <ActivityIndicator color={theme.colors.textOnAccent} />
        ) : (
          <Text style={styles.primaryText}>RUN BIREFNET LITE · ANDROID CPU</Text>
        )}
      </Pressable>

      {details ? <Text selectable style={styles.notice}>{details}</Text> : null}
      {error ? <Text selectable style={styles.error}>{error}</Text> : null}
      {runningModel ? (
        <Text style={styles.helper}>
          {runningModel === "BiRefNet Lite" ? "Loading and running the FP16-weight model through Android CPU…" : "Running the current cutout model on this phone…"}
        </Text>
      ) : null}

      <Pressable
        accessibilityRole="button"
        onPress={() => router.back()}
        style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
      >
        <Text style={styles.closeText}>CLOSE TEST</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: theme.colors.backgroundDeep, flex: 1 },
  content: { alignItems: "stretch", gap: 14, padding: 20, paddingTop: 30 },
  eyebrow: { color: theme.colors.scannerCyan, fontSize: 11, fontWeight: "800", letterSpacing: 1.2 },
  title: { color: theme.colors.text, fontSize: 26, fontWeight: "800" },
  description: { color: theme.colors.textMuted, fontSize: 13, lineHeight: 19 },
  previewFrame: {
    alignItems: "center",
    backgroundColor: "#606068",
    borderColor: theme.colors.divider,
    borderRadius: 12,
    borderWidth: 1,
    height: 390,
    justifyContent: "center",
    overflow: "hidden",
  },
  previewImage: { height: "100%", width: "100%" },
  helper: { color: theme.colors.textMuted, fontSize: 12, textAlign: "center" },
  primaryButton: {
    alignItems: "center",
    backgroundColor: theme.colors.scannerCyan,
    borderRadius: 8,
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: 12,
  },
  primaryText: { color: theme.colors.textOnAccent, fontSize: 11, fontWeight: "900", letterSpacing: 0.5 },
  secondaryButton: {
    alignItems: "center",
    borderColor: theme.colors.divider,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: 12,
  },
  secondaryText: { color: theme.colors.text, fontSize: 11, fontWeight: "800", letterSpacing: 0.5 },
  notice: { color: theme.colors.scannerCyan, fontSize: 12, textAlign: "center" },
  error: { color: theme.colors.goldBright, fontSize: 12, lineHeight: 18, textAlign: "center" },
  closeButton: { alignItems: "center", padding: 12 },
  closeText: { color: theme.colors.textMuted, fontSize: 11, fontWeight: "800", letterSpacing: 0.6 },
  pressed: { opacity: 0.74 },
  dimmed: { opacity: 0.5 },
});
