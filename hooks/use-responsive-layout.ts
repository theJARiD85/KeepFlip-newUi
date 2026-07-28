import { useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const BASE_PHONE_WIDTH = 390;
const BASE_PHONE_HEIGHT = 844;

export function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

export function useResponsiveLayout() {
  const { width, height, fontScale, scale: pixelRatio } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const shortestSide = Math.min(width, height);
  const longestSide = Math.max(width, height);
  const isLandscape = width > height;
  const isTablet = shortestSide >= 600;
  const isWideTablet = isTablet && width >= 900;
  const isCompactWidth = width < 360;
  const isCompactHeight = height < 700;
  const isTallPhone = !isTablet && height / Math.max(width, 1) >= 2;

  const pageGutter = isWideTablet ? 32 : isTablet ? 24 : isCompactWidth ? 16 : 20;
  const contentMaxWidth = isWideTablet ? 1040 : isTablet ? 720 : 560;
  const availableWidth = Math.max(0, width - pageGutter * 2);
  const contentWidth = Math.min(availableWidth, contentMaxWidth);

  const widthScale = clamp(
    contentWidth / (BASE_PHONE_WIDTH - 40),
    0.9,
    isTablet ? 1.24 : 1.12,
  );
  const heightScale = clamp(height / BASE_PHONE_HEIGHT, 0.88, isTablet ? 1.18 : 1.12);

  const moderateScale = (value: number, factor = 0.5) => {
    const scaled = value * widthScale;
    return value + (scaled - value) * factor;
  };

  const verticalScale = (value: number, factor = 1) => {
    const scaled = value * heightScale;
    return value + (scaled - value) * factor;
  };

  const responsiveFont = (value: number, factor = 0.35) => moderateScale(value, factor);

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
    width,
    height,
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
    pageGutter,
    contentMaxWidth,
    contentWidth,
    widthScale,
    heightScale,
    moderateScale,
    verticalScale,
    responsiveFont,
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
    gridColumns: isWideTablet ? 3 : 2,
  };
}
