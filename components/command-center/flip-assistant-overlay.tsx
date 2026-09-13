import { type Href, usePathname, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useKeepFlipAuth } from '@/components/auth/keepflip-auth-context';
import { FlipConversationalAssistantPanel } from '@/components/command-center/flip-conversational-assistant-panel';
import { useResponsiveLayout } from '@/hooks/use-responsive-layout';

const SCANNER_FLOW_PATHS = new Set([
  '/scanner',
  '/analysis',
  '/analysis-result',
]);

const EDGE_INSET = 12;
// Keep the minimized Flip control clear of Android's system navigation area,
// but do not make it look like it is floating an entire button-height above it.
const NAVIGATION_BAR_GAP = 4;
const FLOATING_BUTTON_BASE_SIZE = 48;
const FLOATING_CONTROL_RIGHT = 20;
const FLOATING_VERTICAL_LIFT = 10;

type KeyboardFrame = {
  screenY: number;
  height: number;
};

type RootFrame = {
  top: number;
  bottom: number;
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

export function FlipAssistantOverlay() {
  const { user } = useKeepFlipAuth();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const router = useRouter();
  const { height, width, responsiveHeight, responsiveWidth } = useResponsiveLayout();
  const floatingButtonWidth = responsiveWidth(FLOATING_BUTTON_BASE_SIZE);
  const floatingButtonHeight = responsiveHeight(FLOATING_BUTTON_BASE_SIZE);
  const [isAssistantExpanded, setIsAssistantExpanded] = useState(false);
  const [availableHeight, setAvailableHeight] = useState(height);
  const [keyboardFrame, setKeyboardFrame] = useState<KeyboardFrame | null>(null);
  const [rootFrame, setRootFrame] = useState<RootFrame>({ top: 0, bottom: height });
  const rootRef = useRef<View | null>(null);
  const bottomDockX = useSharedValue(0);
  const bottomDockY = useSharedValue(0);
  const bottomDragStartX = useSharedValue(0);
  const bottomDragStartY = useSharedValue(0);
  const topDockX = useSharedValue(0);
  const topDockY = useSharedValue(0);
  const topDragStartX = useSharedValue(0);
  const topDragStartY = useSharedValue(0);

  const assistantWidth = Math.min(400, Math.max(floatingButtonWidth, width - EDGE_INSET * 2));
  const useTopDock = SCANNER_FLOW_PATHS.has(pathname);
  const floatingBottom =
    Math.max(insets.bottom, NAVIGATION_BAR_GAP) +
    NAVIGATION_BAR_GAP +
    FLOATING_VERTICAL_LIFT;
  const floatingTop = insets.top + 72 - FLOATING_VERTICAL_LIFT;
  const expandedTop = insets.top + EDGE_INSET;
  const maximumOverlayHeight = Math.max(160, availableHeight - expandedTop - EDGE_INSET);
  const rootHeight = Math.max(0, rootFrame.bottom - rootFrame.top);
  const keyboardTopInRoot = keyboardFrame
    ? keyboardFrame.screenY > rootFrame.top
      ? Math.min(rootHeight, keyboardFrame.screenY - rootFrame.top)
      : Math.max(0, rootHeight - keyboardFrame.height)
    : availableHeight;
  const keyboardOverlayHeight = Math.max(160, keyboardTopInRoot - expandedTop);
  const overlayConversationMaxHeight = keyboardFrame
    ? Math.max(72, Math.min(240, keyboardOverlayHeight - 218))
    : undefined;
  const floatingBaseTop = useTopDock
    ? floatingTop
    : height - floatingBottom - floatingButtonHeight;
  const minimumTranslateX =
    EDGE_INSET - (width - FLOATING_CONTROL_RIGHT - floatingButtonWidth);
  const maximumTranslateX = 0;
  const minimumTranslateY = insets.top + EDGE_INSET - floatingBaseTop;
  const maximumTranslateY =
    height - floatingBottom - floatingButtonHeight - floatingBaseTop;
  const activeDockX = useTopDock ? topDockX : bottomDockX;
  const activeDockY = useTopDock ? topDockY : bottomDockY;
  const activeDragStartX = useTopDock ? topDragStartX : bottomDragStartX;
  const activeDragStartY = useTopDock ? topDragStartY : bottomDragStartY;
  const dockAboveKeyboard = isAssistantExpanded && keyboardFrame !== null;

  useEffect(() => {
    const updateKeyboardFrame = (event: { endCoordinates?: { screenY?: number; height?: number } }) => {
      const screenY = Number(event.endCoordinates?.screenY);
      const frameHeight = Number(event.endCoordinates?.height);
      if (!Number.isFinite(screenY) || !Number.isFinite(frameHeight)) return;
      setKeyboardFrame({ height: Math.max(0, frameHeight), screenY });
    };
    const clearKeyboardFrame = () => setKeyboardFrame(null);
    const subscriptions = [
      Keyboard.addListener('keyboardWillShow', updateKeyboardFrame),
      Keyboard.addListener('keyboardDidShow', updateKeyboardFrame),
      Keyboard.addListener('keyboardWillChangeFrame', updateKeyboardFrame),
      Keyboard.addListener('keyboardDidChangeFrame', updateKeyboardFrame),
      Keyboard.addListener('keyboardWillHide', clearKeyboardFrame),
      Keyboard.addListener('keyboardDidHide', clearKeyboardFrame),
    ];
    return () => subscriptions.forEach((subscription) => subscription.remove());
  }, []);

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
      pointerEvents="box-none"
      style={styles.root}>
      <View
        ref={rootRef}
        onLayout={(event) => {
          const nextHeight = Math.round(event.nativeEvent.layout.height);
          setAvailableHeight((current) => (current === nextHeight ? current : nextHeight));
          rootRef.current?.measureInWindow((_x, y, _width, measuredHeight) => {
            const nextTop = Number.isFinite(y) ? y : 0;
            const nextBottom = nextTop + (Number.isFinite(measuredHeight) ? measuredHeight : nextHeight);
            setRootFrame((current) => (
              current.top === nextTop && current.bottom === nextBottom
                ? current
                : { top: nextTop, bottom: nextBottom }
            ));
          });
        }}
        pointerEvents="box-none"
        style={StyleSheet.absoluteFill}>
        <GestureDetector gesture={pan}>
          <Animated.View
            style={[
              styles.dock,
              isAssistantExpanded
                ? {
                    justifyContent: 'flex-end',
                    top: expandedTop,
                    height: dockAboveKeyboard
                      ? keyboardOverlayHeight
                      : maximumOverlayHeight,
                    maxHeight: dockAboveKeyboard
                      ? keyboardOverlayHeight
                      : maximumOverlayHeight,
                    width: assistantWidth,
                  }
                : [
                  {
                    width: floatingButtonWidth,
                    height: floatingButtonHeight,
                    right: FLOATING_CONTROL_RIGHT,
                  },
                  useTopDock
                    ? { top: floatingTop }
                    : { bottom: floatingBottom },
                  floatingDockStyle,
                ],
            ]}>
            <FlipConversationalAssistantPanel
              currentRoute={pathname}
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
      </View>
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
