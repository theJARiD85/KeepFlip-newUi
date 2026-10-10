import { createContext, createElement, useContext, useMemo, type PropsWithChildren } from 'react';
import { Platform, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useKeepFlipAppearance } from '@/components/settings/keepflip-appearance-context';

// Constants
const BASE_PHONE_WIDTH = 390;
const BASE_PHONE_HEIGHT = 844;
// 1. Double check or increase your maximum desktop bounds if needed
const WEB_PUBLIC_CONTENT_MAX_WIDTH = 1920; // Changed from 1366 to match full 1080p monitors
const WEB_SIDEBAR_WIDTH = 264;

const WebAppShellLayoutContext = createContext(false);

export function WebAppShellLayoutProvider({ children }: PropsWithChildren) {
  return createElement(WebAppShellLayoutContext.Provider, { value: true }, children);
}

// Utilities
export function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

const scaleWithWidth = (value: number, factor: number, scale: number) => {
  return value + (value * scale - value) * factor;
};

export function useResponsiveLayout() {
  const { width, height, fontScale, scale: pixelRatio } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isInsideWebAppShell = useContext(WebAppShellLayoutContext);

  const isWeb = Platform.OS === 'web';
  
  // Memoize core dimension state to block useless down-stream object recreation
  return useMemo(() => {
    const webViewportWidth = isWeb && typeof window !== 'undefined' && Number.isFinite(window.innerWidth)
      ? window.innerWidth
      : width;

    // Fix static/SSR zero-dimension edge cases
    const layoutWidth = isWeb && webViewportWidth <= 0 ? BASE_PHONE_WIDTH : webViewportWidth;
    const layoutHeight = isWeb && height <= 0 ? BASE_PHONE_HEIGHT : height;

    const shortestSide = Math.min(layoutWidth, layoutHeight);
    const longestSide = Math.max(layoutWidth, layoutHeight);
    const isLandscape = layoutWidth > layoutHeight;
    const isTablet = shortestSide >= 600;
    const isWideTablet = isTablet && layoutWidth >= 900;
    const isCompactWidth = layoutWidth < 360;
    const isCompactHeight = layoutHeight < 700;
    const isTallPhone = !isTablet && layoutHeight / Math.max(layoutWidth, 1) >= 2;

    // Gutter Calculations
    const nativePageGutter = isWideTablet ? 32 : isTablet ? 24 : isCompactWidth ? 8 : 12;
    const nativeContentMaxWidth = width - (nativePageGutter * 2);
    const nativeContentWidth = Math.min(Math.max(0, layoutWidth - nativePageGutter * 2), nativeContentMaxWidth);

    const webPageGutter = layoutWidth >= 1440 ? 32 : layoutWidth >= 980 ? 24 : layoutWidth >= 600 ? 20 : isCompactWidth ? 8 : 12;
    const webSidebarReserve = isWeb && isInsideWebAppShell && layoutWidth >= 980 ? WEB_SIDEBAR_WIDTH : 0;
    const webAvailableWidth = Math.max(0, layoutWidth - webSidebarReserve);
    const webContentMaxWidth = isInsideWebAppShell
    ? webAvailableWidth  // Inside application shell -> Take up 100% of remaining screen
    : Math.min(webAvailableWidth, WEB_PUBLIC_CONTENT_MAX_WIDTH); // Public page -> Cap at container maximum
    const webContentWidth = isInsideWebAppShell 
    ? Math.max(0, webAvailableWidth - (webPageGutter * 2)) 
    : Math.max(0, Math.min(webAvailableWidth, webContentMaxWidth) - (webPageGutter * 2));
    const webGridColumns = webContentWidth >= 800 ? 3 : webContentWidth >= 500 ? 2 : 1;

    // Linear Scaling Math
    const webWidthScale = clamp(
      webContentWidth / (BASE_PHONE_WIDTH - 40),
      0.9,
      isInsideWebAppShell ? 2.0 : (isTablet ? 1.5 : 1.12) // Allow 2x scaling or higher for high-res web monitors
    );
    const nativeWidthScale = clamp(nativeContentWidth / (BASE_PHONE_WIDTH - 40), 0.9, isTablet ? 1.24 : 1.12);
    const nativeHeightScale = clamp(layoutHeight / BASE_PHONE_HEIGHT, 0.88, isTablet ? 1.18 : 1.12);
    const webHeightScale = clamp(layoutHeight / BASE_PHONE_HEIGHT, 0.88, isTablet ? 1.18 : 1.12);

    const pageGutter = isWeb ? webPageGutter : nativePageGutter;
    const contentMaxWidth = isWeb ? webContentMaxWidth : nativeContentMaxWidth;
    const contentWidth = isWeb ? webContentWidth : nativeContentWidth;
    const widthScale = isWeb ? webWidthScale : nativeWidthScale;
    const heightScale = isWeb ? webHeightScale : nativeHeightScale;

    // Dynamic Sizers
    const moderateScale = (value: number, factor = 0.5) => scaleWithWidth(value, factor, widthScale);
    const verticalScale = (value: number, factor = 1) => scaleWithWidth(value, factor, heightScale);

    const responsiveFont = (value: number, factor = 0.35) => scaleWithWidth(value, factor, widthScale);
    const webResponsiveFont = (value: number, factor = 0.35) => scaleWithWidth(value, factor, webWidthScale);
    const responsiveWidth = (value: number, factor = 0.5) => scaleWithWidth(value, factor, widthScale);
    const responsiveHeight = (value: number, factor = 1) => scaleWithWidth(value, factor, heightScale);
    const webResponsiveWidth = (value: number, factor = 0.5) => scaleWithWidth(value, factor, webWidthScale);
    const webResponsiveHeight = (value: number, factor = 1) => scaleWithWidth(value, factor, webHeightScale);

    // Contextual Component Computations (Scoped UI layout anchors)
    const scannerWidth = clamp(contentWidth * (isTablet ? 0.72 : 0.88), isCompactWidth ? 250 : 280, isTablet ? 460 : 360);
    const availableScannerHeight = Math.max(260, height - insets.top - insets.bottom - verticalScale(isCompactHeight ? 250 : 300, 0.5));
    const scannerHeight = clamp(scannerWidth / 0.9, isCompactHeight ? 270 : 300, Math.min(isTablet ? 510 : 420, availableScannerHeight));
    const captureButtonSize = clamp(shortestSide * 0.18, 72, isTablet ? 108 : 92);
    const controlDockWidth = clamp(contentWidth, 300, isTablet ? 700 : 420);
    const scannerControlSize = clamp(scaleWithWidth(86, 0.72, widthScale), 78, isTablet ? 108 : 96);
    const scannerCarouselHeight = clamp(verticalScale(152, 1), 142, isTablet ? 190 : 170);
    const scannerRailTop = clamp(verticalScale(80, 0.55), 72, isTablet ? 104 : 92);
    const scannerRailHeight = clamp(scaleWithWidth(68, 0.55, widthScale), 62, isTablet ? 82 : 74);
    const scannerRailWidth = clamp(controlDockWidth - scaleWithWidth(44, 0.5, widthScale), 286, isTablet ? 470 : 380);
    const scannerWheelRadius = clamp((scannerRailWidth - scannerControlSize) / 2.25, 82, isTablet ? 260 : 230);

    return {
      width: layoutWidth,
      height: layoutHeight,
      shortestSide,
      longestSide,
      fontScale,
      pixelRatio,
      insets,
      isLandscape,
      isTablet,
      isWideTablet,
      isCompactWidth,
      isCompactHeight,
      isTallPhone,
      isWeb,
      pageGutter,
      contentMaxWidth,
      contentWidth,
      widthScale,
      heightScale,
      moderateScale,
      verticalScale,
      responsiveFont,
      webResponsiveFont,
      webResponsiveWidth,
      webResponsiveHeight,
      responsiveWidth,
      responsiveHeight,
      webContentMaxWidth,
      webContentWidth,
      webPageGutter,
      webGridColumns,
      scannerWidth,
      scannerHeight,
      captureButtonSize,
      controlDockWidth,
      scannerControlSize,
      scannerCarouselHeight,
      scannerRailTop,
      scannerRailHeight,
      scannerRailWidth,
      scannerWheelRadius,
      gridColumns: isWeb ? webGridColumns : isWideTablet ? 3 : 2,
    };
  }, [width, height, fontScale, pixelRatio, insets, isInsideWebAppShell, isWeb]);
}

export function useResponsiveStyles<T>(
  createStyles: (layout: ReturnType<typeof useResponsiveLayout>) => T,
) {
  const layout = useResponsiveLayout();
  const { appliedColorScheme } = useKeepFlipAppearance();

  // Strict dependency locking prevents redundant evaluations unless geometry scales change
  return useMemo(
    () => createStyles(layout),
    [createStyles, appliedColorScheme, layout],
  );
}
