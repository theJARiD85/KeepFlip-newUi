import { Dimensions } from 'react-native';

const BASE_PHONE_WIDTH = 390;
const BASE_PHONE_HEIGHT = 844;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

function getWidthScale() {
  const { height, width } = Dimensions.get('window');
  const isTablet = Math.min(width, height) >= 600;
  const isWideTablet = isTablet && width >= 900;
  const isCompactWidth = width < 360;
  const pageGutter = isWideTablet ? 32 : isTablet ? 24 : isCompactWidth ? 10 : 15;
  const contentMaxWidth = isWideTablet ? 1040 : isTablet ? 720 : 560;
  const contentWidth = Math.min(
    Math.max(0, width - pageGutter * 2),
    contentMaxWidth,
  );
  return clamp(
    contentWidth / (BASE_PHONE_WIDTH - 40),
    0.9,
    isTablet ? 1.24 : 1.12,
  );
}

function getHeightScale() {
  const { height, width } = Dimensions.get('window');
  const isTablet = Math.min(width, height) >= 600;
  return clamp(height / BASE_PHONE_HEIGHT, 0.88, isTablet ? 1.18 : 1.12);
}

function moderateScale(value: number, scale: number, factor: number) {
  const scaled = value * scale;
  return value + (scaled - value) * factor;
}

/** Scale a literal `width` value against KeepFlip's 390-point phone baseline. */
export function responsiveWidth(value: number, factor = 0.5) {
  return moderateScale(value, getWidthScale(), factor);
}

/** Scale a literal `height` value against KeepFlip's 844-point phone baseline. */
export function responsiveHeight(value: number, factor = 1) {
  return moderateScale(value, getHeightScale(), factor);
}

/**
 * Module-safe font scaling for static StyleSheet declarations.
 *
 * React Native applies the user's accessibility font scale separately, so
 * this only accounts for the available layout width.
 */
export function responsiveFont(value: number, factor = 0.35) {
  return responsiveWidth(value, factor);
}

export default responsiveFont;
