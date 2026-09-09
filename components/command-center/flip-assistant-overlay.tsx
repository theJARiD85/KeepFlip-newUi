import { type Href, usePathname, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useKeepFlipAuth } from '@/components/auth/keepflip-auth-context';
import { FlipConversationalAssistantPanel } from '@/components/command-center/flip-conversational-assistant-panel';

const SCANNER_FLOW_PATHS = new Set([
  '/scanner',
  '/analysis',
  '/analysis-result',
]);

const EDGE_INSET = 12;
const FLOATING_BUTTON_SIZE = 46;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

export function FlipAssistantOverlay() {
  const { user } = useKeepFlipAuth();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const router = useRouter();
  const { height, width } = useWindowDimensions();
  const [isAssistantExpanded, setIsAssistantExpanded] = useState(false);
  const [availableHeight, setAvailableHeight] = useState(height);
  const bottomDockX = useSharedValue(0);
  const bottomDockY = useSharedValue(0);
  const bottomDragStartX = useSharedValue(0);
  const bottomDragStartY = useSharedValue(0);
  const topDockX = useSharedValue(0);
  const topDockY = useSharedValue(0);
  const topDragStartX = useSharedValue(0);
  const topDragStartY = useSharedValue(0);

  const assistantWidth = Math.min(400, Math.max(FLOATING_BUTTON_SIZE, width - EDGE_INSET * 2));
  const useTopDock = SCANNER_FLOW_PATHS.has(pathname);
  const floatingBottom = Math.max(insets.bottom, EDGE_INSET) + EDGE_INSET;
  const floatingTop = insets.top + 72;
  const expandedTop = insets.top + EDGE_INSET;
  const maximumOverlayHeight = Math.max(160, availableHeight - expandedTop - EDGE_INSET);
  const overlayConversationMaxHeight = Math.max(
    72,
    Math.min(240, maximumOverlayHeight - 218),
  );
  const floatingBaseTop = useTopDock
    ? floatingTop
    : height - floatingBottom - FLOATING_BUTTON_SIZE;
  const minimumTranslateX = EDGE_INSET - (width - EDGE_INSET - FLOATING_BUTTON_SIZE);
  const maximumTranslateX = 0;
  const minimumTranslateY = insets.top + EDGE_INSET - floatingBaseTop;
  const maximumTranslateY =
    height - floatingBottom - FLOATING_BUTTON_SIZE - floatingBaseTop;
  const activeDockX = useTopDock ? topDockX : bottomDockX;
  const activeDockY = useTopDock ? topDockY : bottomDockY;
  const activeDragStartX = useTopDock ? topDragStartX : bottomDragStartX;
  const activeDragStartY = useTopDock ? topDragStartY : bottomDragStartY;

  useEffect(() => {
    activeDockX.value = clamp(
      activeDockX.value,
      minimumTranslateX,
      maximumTranslateX,
    );
    activeDockY.value = clamp(
      activeDockY.value,
      minimumTranslateY,
      maximumTranslateY,
    );
  }, [
    activeDockX,
    activeDockY,
    maximumTranslateX,
    maximumTranslateY,
    minimumTranslateX,
    minimumTranslateY,
  ]);

  const floatingDockStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: activeDockX.value },
      { translateY: activeDockY.value },
    ],
  }));

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .enabled(!isAssistantExpanded)
        .minDistance(6)
        .onBegin(() => {
          activeDragStartX.value = activeDockX.value;
          activeDragStartY.value = activeDockY.value;
        })
        .onUpdate(({ translationX, translationY }) => {
          activeDockX.value = clamp(
            activeDragStartX.value + translationX,
            minimumTranslateX,
            maximumTranslateX,
          );
          activeDockY.value = clamp(
            activeDragStartY.value + translationY,
            minimumTranslateY,
            maximumTranslateY,
          );
        }),
    [
      activeDockX,
      activeDockY,
      activeDragStartX,
      activeDragStartY,
      isAssistantExpanded,
      maximumTranslateX,
      maximumTranslateY,
      minimumTranslateX,
      minimumTranslateY,
    ],
  );

  if (!user || pathname === '/walkthrough') return null;

  return (
    <KeyboardAvoidingView
      behavior="height"
      onLayout={(event) => {
        const nextHeight = Math.round(event.nativeEvent.layout.height);
        setAvailableHeight((current) => (current === nextHeight ? current : nextHeight));
      }}
      pointerEvents="box-none"
      style={styles.root}>
      <GestureDetector gesture={pan}>
        <Animated.View
        style={[
          styles.dock,
          isAssistantExpanded
            ? {
                maxHeight: maximumOverlayHeight,
                top: expandedTop,
                width: assistantWidth,
              }
            : [
                { width: FLOATING_BUTTON_SIZE },
                useTopDock
                  ? { top: floatingTop }
                  : { bottom: floatingBottom },
                floatingDockStyle,
              ],
        ]}>
        <FlipConversationalAssistantPanel
          onNavigate={(route) => router.push(route as Href)}
          onOpenSellerOperations={() => {
            router.push('/command-center?openSellerOperations=1' as Href);
          }}
          onExpandedChange={setIsAssistantExpanded}
          overlayConversationMaxHeight={overlayConversationMaxHeight}
          presentation="overlay"
        />
        </Animated.View>
      </GestureDetector>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFill,
    zIndex: 9000,
    elevation: 9000,
  },
  dock: {
    position: 'absolute',
    right: EDGE_INSET,
  },
});
