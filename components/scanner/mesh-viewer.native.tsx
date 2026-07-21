import { fetch } from "expo/fetch";
import { File, Paths } from "expo-file-system";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";

import { keepFlipTheme as theme } from "@/constants/keepflip-theme";

type MeshViewerProps = {
  jwt: string;
  modelUrl: string;
  projectId: string;
  style?: StyleProp<ViewStyle>;
  onError?: (message: string) => void;
  onLoad?: () => void;
};

type ViewerMessage =
  | { type: "loaded" }
  | { type: "error"; message?: string };

function safeDelete(file: File | null) {
  if (!file?.exists) return;

  try {
    file.delete();
  } catch {
    // Cache cleanup is best-effort.
  }
}

function viewerHtml(modelFileName: string) {
  const safeFileName = JSON.stringify(`./${modelFileName}`);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
  <style>
    html, body {
      width: 100%;
      height: 100%;
      margin: 0;
      overflow: hidden;
      background: transparent;
    }
    model-viewer {
      width: 100%;
      height: 100%;
      background: transparent;
      --poster-color: transparent;
      --progress-bar-color: #58dfe8;
    }
  </style>
  <script type="module" src="https://ajax.googleapis.com/ajax/libs/model-viewer/4.3.1/model-viewer.min.js"></script>
</head>
<body>
  <model-viewer
    id="viewer"
    alt="Generated 3D model of the scanned item"
    src=${safeFileName}
    loading="eager"
    reveal="auto"
    camera-controls
    auto-rotate
    auto-rotate-delay="0"
    rotation-per-second="18deg"
    interaction-prompt="none"
    shadow-intensity="0.8"
    shadow-softness="0.85"
    exposure="1.05"
    tone-mapping="aces"
    touch-action="pan-y"
  ></model-viewer>
  <script>
    const viewer = document.getElementById('viewer');
    viewer.addEventListener('load', () => {
      window.ReactNativeWebView?.postMessage(JSON.stringify({ type: 'loaded' }));
    });
    viewer.addEventListener('error', (event) => {
      const message = event?.detail?.message || 'The generated GLB could not be rendered.';
      window.ReactNativeWebView?.postMessage(JSON.stringify({ type: 'error', message }));
    });
  </script>
</body>
</html>`;
}

export function MeshViewer({
  jwt,
  modelUrl,
  projectId,
  style,
  onError,
  onLoad,
}: MeshViewerProps) {
  const [viewerUri, setViewerUri] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const filesRef = useRef<{ html: File | null; model: File | null }>({
    html: null,
    model: null,
  });

  const cacheKey = useMemo(() => {
    let hash = 0;
    const value = `${projectId}:${modelUrl}`;

    for (let index = 0; index < value.length; index += 1) {
      hash = (hash * 31 + value.charCodeAt(index)) | 0;
    }

    return Math.abs(hash).toString(36);
  }, [modelUrl, projectId]);

  useEffect(() => {
    let cancelled = false;

    setViewerUri(null);
    setLoadError(null);
    setIsModelLoaded(false);

    const prepareViewer = async () => {
      let modelFile: File | null = null;
      let htmlFile: File | null = null;

      try {
        const response = await fetch(modelUrl, {
          headers: {
            "X-Appwrite-JWT": jwt,
            "X-Appwrite-Project": projectId,
          },
        });

        if (!response.ok) {
          throw new Error(
            `Appwrite returned ${response.status} while loading the generated model.`,
          );
        }

        const bytes = await response.bytes();
        if (bytes.byteLength === 0) {
          throw new Error("Appwrite returned an empty GLB model.");
        }

        modelFile = new File(Paths.cache, `keepflip-${cacheKey}.glb`);
        modelFile.create({ intermediates: true, overwrite: true });
        modelFile.write(bytes);

        htmlFile = new File(Paths.cache, `keepflip-${cacheKey}.html`);
        htmlFile.create({ intermediates: true, overwrite: true });
        htmlFile.write(viewerHtml(modelFile.name));

        if (cancelled) {
          safeDelete(htmlFile);
          safeDelete(modelFile);
          return;
        }

        safeDelete(filesRef.current.html);
        safeDelete(filesRef.current.model);
        filesRef.current = { html: htmlFile, model: modelFile };
        setViewerUri(htmlFile.uri);
      } catch (error) {
        safeDelete(htmlFile);
        safeDelete(modelFile);

        if (cancelled) return;
        const message =
          error instanceof Error
            ? error.message
            : "The generated 3D model could not be prepared.";
        setLoadError(message);
        onError?.(message);
      }
    };

    void prepareViewer();

    return () => {
      cancelled = true;
    };
  }, [cacheKey, jwt, modelUrl, onError, projectId]);

  useEffect(
    () => () => {
      safeDelete(filesRef.current.html);
      safeDelete(filesRef.current.model);
      filesRef.current = { html: null, model: null };
    },
    [],
  );

  const handleMessage = (event: WebViewMessageEvent) => {
    let message: ViewerMessage;

    try {
      message = JSON.parse(event.nativeEvent.data) as ViewerMessage;
    } catch {
      return;
    }

    if (message.type === "loaded") {
      setIsModelLoaded(true);
      onLoad?.();
      return;
    }

    const errorMessage =
      message.message || "The generated GLB could not be rendered.";
    setLoadError(errorMessage);
    onError?.(errorMessage);
  };

  return (
    <View style={[styles.container, style]}>
      {viewerUri ? (
        <WebView
          allowFileAccess
          allowUniversalAccessFromFileURLs
          androidLayerType="hardware"
          domStorageEnabled
          javaScriptEnabled
          mixedContentMode="always"
          onMessage={handleMessage}
          originWhitelist={["*"]}
          overScrollMode="never"
          scrollEnabled={false}
          setSupportMultipleWindows={false}
          source={{ uri: viewerUri }}
          style={styles.webView}
        />
      ) : null}

      {!isModelLoaded && !loadError ? (
        <View pointerEvents="none" style={styles.loadingOverlay}>
          <ActivityIndicator color={theme.colors.scannerCyan} size="small" />
          <Text style={styles.loadingText}>PREPARING 3D VIEW</Text>
        </View>
      ) : null}

      {loadError ? (
        <View pointerEvents="none" style={styles.loadingOverlay}>
          <Text style={styles.errorText}>3D VIEW UNAVAILABLE</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: "hidden",
    backgroundColor: "rgba(3, 3, 7, 0.96)",
  },
  webView: {
    flex: 1,
    backgroundColor: "transparent",
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: "rgba(3, 3, 7, 0.76)",
  },
  loadingText: {
    color: theme.colors.scannerCyan,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.5,
  },
  errorText: {
    color: theme.colors.cream,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.3,
  },
});
