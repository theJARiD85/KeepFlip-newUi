import { createContext, createElement, useContext, useMemo, type PropsWithChildren } from 'react';
import { Platform, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useKeepFlipAppearance } from '@/components/settings/keepflip-appearance-context';

const BASE_PHONE_WIDTH = 390;
const BASE_PHONE_HEIGHT = 844;
const WEB_PUBLIC_CONTENT_MAX_WIDTH = 1_366;
const WEB_SIDEBAR_WIDTH = 264;

const WebAppShellLayoutContext = createContext(false);

export function WebAppShellLayoutProvider({ children }: PropsWithChildren) {
  return createElement(
    WebAppShellLayoutContext.Provider,
    { value: true },
    children,
  );
}

export function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

export function useResponsiveLayout() {
  const { width, height, fontScale, scale: pixelRatio } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isInsideWebAppShell = useContext(WebAppShellLayoutContext);

  const isWeb = Platform.OS === 'web';
  // Expo static rendering can report zero dimensions before the browser mounts.
  // Use the phone baseline until a real web viewport size is available.
  const layoutWidth = isWeb && width <= 0 ? BASE_PHONE_WIDTH : width;
  const layoutHeight = isWeb && height <= 0 ? BASE_PHONE_HEIGHT : height;

  const shortestSide = Math.min(layoutWidth, layoutHeight);
  const longestSide = Math.max(layoutWidth, layoutHeight);
  const isLandscape = layoutWidth > layoutHeight;
  const isTablet = shortestSide >= 600;
  const isWideTablet = isTablet && layoutWidth >= 900;
  const isCompactWidth = layoutWidth < 360;
  const isCompactHeight = layoutHeight < 700;
  const isTallPhone = !isTablet && layoutHeight / Math.max(layoutWidth, 1) >= 2;

  const nativePageGutter = isWideTablet ? 32 : isTablet ? 24 : isCompactWidth ? 8 : 12;
  const nativeContentMaxWidth = isWideTablet ? 1040 : isTablet ? 720 : 560;
  const nativeAvailableWidth = Math.max(0, layoutWidth - nativePageGutter * 2);
  const nativeContentWidth = Math.min(nativeAvailableWidth, nativeContentMaxWidth);

  const webPageGutter =
    layoutWidth >= 1440 ? 32 : layoutWidth >= 980 ? 24 : layoutWidth >= 600 ? 20 : isCompactWidth ? 8 : 12;
  const webSidebarReserve =
    isWeb && isInsideWebAppShell && layoutWidth >= 980 ? WEB_SIDEBAR_WIDTH : 0;
  const webAvailableWidth = Math.max(0, layoutWidth - webSidebarReserve);
  const webContentMaxWidth = isInsideWebAppShell
    ? webAvailableWidth
    : Math.min(webAvailableWidth, WEB_PUBLIC_CONTENT_MAX_WIDTH);
  const webContentWidth = Math.max(
    0,
    Math.min(webAvailableWidth, webContentMaxWidth - webPageGutter * 2),
  );
  const webGridColumns = webContentWidth >= 800 ? 3 : webContentWidth >= 500 ? 2 : 1;
  const webWidthScale = clamp(
    webContentWidth / (BASE_PHONE_WIDTH - 40),
    0.9,
    isTablet ? 1.24 : 1.12,
  );
  const nativeWidthScale = clamp(
    nativeContentWidth / (BASE_PHONE_WIDTH - 40),
    0.9,
    isTablet ? 1.24 : 1.12,
  );
  const nativeHeightScale = clamp(layoutHeight / BASE_PHONE_HEIGHT, 0.88, isTablet ? 1.18 : 1.12);
  const webHeightScale = clamp(layoutHeight / BASE_PHONE_HEIGHT, 0.88, isTablet ? 1.18 : 1.12);
  const pageGutter = isWeb ? webPageGutter : nativePageGutter;
  const contentMaxWidth = isWeb ? webContentMaxWidth : nativeContentMaxWidth;
  const contentWidth = isWeb ? webContentWidth : nativeContentWidth;
  const widthScale = isWeb ? webWidthScale : nativeWidthScale;
  const heightScale = isWeb ? webHeightScale : nativeHeightScale;

  const scaleWithWidth = (value: number, factor: number, scale: number) => {
    const scaled = value * scale;
    return value + (scaled - value) * factor;
  };
  const moderateScale = (value: number, factor = 0.5) =>
    scaleWithWidth(value, factor, widthScale);
  const webModerateScale = (value: number, factor = 0.5) =>
    scaleWithWidth(value, factor, webWidthScale);

  const verticalScale = (value: number, factor = 1) => {
    const scaled = value * heightScale;
    return value + (scaled - value) * factor;
  };

  const webResponsiveFont = (value: number, factor = 0.35) => webModerateScale(value, factor);
  const nativeResponsiveFont = (value: number, factor = 0.35) => moderateScale(value, factor);
  const nativeResponsiveWidth = (value: number, factor = 0.5) => moderateScale(value, factor);
  const nativeResponsiveHeight = (value: number, factor = 1) => verticalScale(value, factor);
  const webResponsiveWidth = (value: number, factor = 0.5) => webModerateScale(value, factor);
  const webResponsiveHeight = (value: number, factor = 1) => {
    const scaled = value * webHeightScale;
    return value + (scaled - value) * factor;
  };
  const responsiveFont = isWeb ? webResponsiveFont : nativeResponsiveFont;
  const responsiveWidth = isWeb ? webResponsiveWidth : nativeResponsiveWidth;
  const responsiveHeight = isWeb ? webResponsiveHeight : nativeResponsiveHeight;

  const scannerWidth = clamp(
    contentWidth * (isTablet ? 0.72 : 0.88),
    isCompactWidth ? 250 : 280,
    isTablet ? 460 : 360,
  );
  const availableScannerHeight = Math.max(
    260,
    height - insets.top - insets.bottom - verticalScale(isCompactHeight ? 250 : 300, 0.5),
  );
  const scannerHeight = clamp(
    scannerWidth / 0.9,
    isCompactHeight ? 270 : 300,
    Math.min(isTablet ? 510 : 420, availableScannerHeight),
  );
  const captureButtonSize = clamp(shortestSide * 0.18, 72, isTablet ? 108 : 92);
  const controlDockWidth = clamp(contentWidth, 300, isTablet ? 700 : 420);
  const scannerControlSize = clamp(moderateScale(86, 0.72), 78, isTablet ? 108 : 96);
  const scannerCarouselHeight = clamp(verticalScale(152, 1), 142, isTablet ? 190 : 170);
  const scannerRailTop = clamp(verticalScale(80, 0.55), 72, isTablet ? 104 : 92);
  const scannerRailHeight = clamp(moderateScale(68, 0.55), 62, isTablet ? 82 : 74);
  const scannerRailWidth = clamp(controlDockWidth - moderateScale(44), 286, isTablet ? 470 : 380);
  const scannerWheelRadius = clamp(
    (scannerRailWidth - scannerControlSize) / 2.25,
    82,
    isTablet ? 260 : 230,
  );

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
    responsiveWidth,
    responsiveHeight,
    webPageGutter,
    webContentMaxWidth,
    webContentWidth,
    webWidthScale,
    webHeightScale,
    webResponsiveFont,
    webResponsiveWidth,
    webResponsiveHeight,
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
}

export function useResponsiveStyles<T>(
  createStyles: (layout: ReturnType<typeof useResponsiveLayout>) => T,
) {
  const layout = useResponsiveLayout();
  const { appliedColorScheme } = useKeepFlipAppearance();

  return useMemo(
    () => createStyles(layout),
    [createStyles, appliedColorScheme, layout.widthScale, layout.heightScale],
  );
}
