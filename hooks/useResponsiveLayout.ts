import { useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const BASE_PHONE_WIDTH = 390;
const BASE_PHONE_HEIGHT = 844;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function useResponsiveLayout() {
  const {
    width,
    height,
    fontScale,
    scale: pixelRatio,
  } = useWindowDimensions();

  const insets = useSafeAreaInsets();

  const shortestSide = Math.min(width, height);
  const longestSide = Math.max(width, height);

  const isTablet = shortestSide >= 600;
  const isWideTablet = isTablet && width >= 900;

  const isCompactWidth = width < 360;
  const isCompactHeight = height < 700;
  const isTallPhone = !isTablet && height / width >= 2;

  const pageGutter = isTablet ? 24 : width < 360 ? 16 : 20;

  const contentMaxWidth = isWideTablet
    ? 1040
    : isTablet
      ? 720
      : 560;

  const availableWidth = Math.max(
    0,
    width - pageGutter * 2
  );

  const contentWidth = Math.min(
    availableWidth,
    contentMaxWidth
  );

  /*
   * Keep scaling deliberately bounded.
   *
   * Never use width / 1080 or width / 1440 here.
   * React Native width is measured in logical dp units.
   */
  const widthScale = clamp(
    width / BASE_PHONE_WIDTH,
    0.9,
    isTablet ? 1.2 : 1.12
  );

  const heightScale = clamp(
    height / BASE_PHONE_HEIGHT,
    0.88,
    isTablet ? 1.15 : 1.12
  );

  const moderateScale = (
    value: number,
    factor = 0.5
  ) => {
    const scaled = value * widthScale;

    return value + (scaled - value) * factor;
  };

  const verticalScale = (value: number) =>
    value * heightScale;

  const responsiveFont = (
    value: number,
    maximumFontScale = 1.2
  ) =>
    moderateScale(value, 0.35) /
    Math.min(fontScale, maximumFontScale);

  const scannerWidth = clamp(
    width * (isTablet ? 0.5 : 0.58),
    isCompactWidth ? 190 : 220,
    isTablet ? 430 : 330
  );

  const scannerHeight = clamp(
    scannerWidth * 1.08,
    220,
    isTablet ? 470 : 360
  );

  const captureButtonSize = clamp(
    shortestSide * 0.14,
    62,
    isTablet ? 94 : 82
  );

  const controlDockWidth = clamp(
    width - pageGutter * 2,
    280,
    isTablet ? 520 : 400
  );

  return {
    width,
    height,
    shortestSide,
    longestSide,

    insets,
    fontScale,
    pixelRatio,

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

    gridColumns: isWideTablet ? 3 : 2,
  };
}