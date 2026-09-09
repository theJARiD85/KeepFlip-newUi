import { type Href, usePathname, useRouter } from 'expo-router';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useKeepFlipAuth } from '@/components/auth/keepflip-auth-context';
import { FlipConversationalAssistantPanel } from '@/components/command-center/flip-conversational-assistant-panel';

const SCANNER_FLOW_PATHS = new Set([
  '/scanner',
  '/analysis',
  '/analysis-result',
]);

export function FlipAssistantOverlay() {
  const { user } = useKeepFlipAuth();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const router = useRouter();
  const { width } = useWindowDimensions();

  if (!user || pathname === '/walkthrough') return null;

  const assistantWidth = Math.min(400, Math.max(56, width - 24));
  const useTopDock = SCANNER_FLOW_PATHS.has(pathname);

  return (
    <View pointerEvents="box-none" style={styles.root}>
      <View
        pointerEvents="box-none"
        style={[
          styles.dock,
          { width: assistantWidth },
          useTopDock
            ? { top: insets.top + 72 }
            : { bottom: Math.max(insets.bottom, 12) + 12 },
        ]}>
        <FlipConversationalAssistantPanel
          onNavigate={(route) => router.push(route as Href)}
          onOpenSellerOperations={() => {
            router.push('/command-center?openSellerOperations=1' as Href);
          }}
          presentation="overlay"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9000,
    elevation: 9000,
  },
  dock: {
    position: 'absolute',
    right: 12,
  },
});
