import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { MeshViewer } from '@/components/scanner/mesh-viewer.native';
import { keepFlipTheme as theme } from '@/constants/keepflip-theme';
import { getAppwriteCoreServices } from '@/lib/appwrite';

const TEST_MODEL_URL =
  'https://sfo.cloud.appwrite.io/v1/storage/buckets/glb_models/files/6a5f29ed0031eacdfd37/view?project=6a35bcae000cf7c40b0a';
const TEST_PROJECT_ID = '6a35bcae000cf7c40b0a';

export default function MeshTestScreen() {
  const router = useRouter();
  const [jwt, setJwt] = useState<string | null>(null);
  const [status, setStatus] = useState('AUTHORIZING MODEL VIEW');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const authorize = async () => {
      try {
        const { account } = getAppwriteCoreServices();
        const result = await account.createJWT({ duration: 900 });
        const token = result.jwt?.trim();

        if (!token) {
          throw new Error('Appwrite did not return a model-viewer JWT.');
        }

        if (!cancelled) {
          setJwt(token);
          setStatus('LOADING GENERATED MODEL');
        }
      } catch (caught) {
        if (cancelled) return;
        const message =
          caught instanceof Error
            ? caught.message
            : 'KeepFlip could not authorize the generated model.';
        setError(message);
        setStatus('3D VIEW UNAVAILABLE');
      }
    };

    void authorize();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>BACK</Text>
        </Pressable>
        <View style={styles.titleBlock}>
          <Text style={styles.kicker}>KEEPFLIP LAB</Text>
          <Text style={styles.title}>Generated Mesh Test</Text>
        </View>
      </View>

      <View style={styles.viewerFrame}>
        {jwt ? (
          <MeshViewer
            jwt={jwt}
            modelUrl={TEST_MODEL_URL}
            projectId={TEST_PROJECT_ID}
            onLoad={() => {
              setError(null);
              setStatus('MODEL READY • DRAG TO ROTATE');
            }}
            onError={(message) => {
              setError(message);
              setStatus('3D VIEW UNAVAILABLE');
            }}
            style={styles.viewer}
          />
        ) : (
          <View style={styles.centered}>
            <ActivityIndicator color={theme.colors.scannerCyan} size="large" />
          </View>
        )}
      </View>

      <View style={styles.statusPanel}>
        <Text style={styles.status}>{status}</Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Text selectable style={styles.fileId}>
          glb_models / 6a5f29ed0031eacdfd37
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.backgroundDeep,
  },
  header: {
    minHeight: 82,
    paddingHorizontal: 18,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  backButton: {
    minWidth: 58,
    minHeight: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(88, 223, 232, 0.55)',
  },
  backText: {
    color: theme.colors.scannerCyan,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  titleBlock: {
    flex: 1,
  },
  kicker: {
    color: theme.colors.scannerCyan,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.8,
  },
  title: {
    marginTop: 2,
    color: theme.colors.cream,
    fontSize: 20,
    fontWeight: '800',
  },
  viewerFrame: {
    flex: 1,
    marginHorizontal: 14,
    borderWidth: 1,
    borderColor: 'rgba(88, 223, 232, 0.35)',
    backgroundColor: 'rgba(3, 3, 7, 0.96)',
    overflow: 'hidden',
  },
  viewer: {
    flex: 1,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusPanel: {
    minHeight: 94,
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  status: {
    color: theme.colors.scannerCyan,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.25,
  },
  error: {
    marginTop: 7,
    color: '#ff8e8e',
    fontSize: 12,
    lineHeight: 17,
  },
  fileId: {
    marginTop: 7,
    color: 'rgba(255, 248, 231, 0.62)',
    fontSize: 10,
  },
});
