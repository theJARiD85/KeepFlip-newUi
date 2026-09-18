export type KeepFlipColorScheme = 'light' | 'dark';

const darkColors = {
  background: '#1e1612',
  backgroundRaised: 'rgba(11, 10, 14, 0.92)',
  scrim: 'rgba(1, 1, 2, 0.68)',
  surface: '#342005',
  surfaceSoft: '#15121A',
  card: 'rgba(5, 13, 19, 0.86)',
  surfaceOverlay: 'rgba(8, 8, 11, 0.76)',
  surfaceInset: 'rgba(5, 13, 19, 0.72)',
  cardSoft: 'rgba(255, 255, 255, 0.035)',
  iconSurface: 'rgba(3, 3, 6, 0.54)',
  iconSurfaceCyan: 'rgba(88, 223, 232, 0.12)',
  iconSurfaceGold: 'rgba(215, 168, 74, 0.12)',
  iconSurfaceViolet: 'rgba(141, 114, 255, 0.12)',
  accentCyanBorder: 'rgba(88, 223, 232, 0.24)',
  accentGoldBorder: 'rgba(242, 211, 138, 0.24)',
  accentVioletBorder: 'rgba(141, 114, 255, 0.28)',
  success: '#46F5A2',
  successSurface: 'rgba(70, 245, 162, 0.08)',
  dangerSurface: 'rgba(232, 97, 88, 0.10)',
  divider: 'rgba(242, 211, 138, 0.14)',
  dividerStrong: 'rgba(242, 211, 138, 0.24)',
  gold: '#D7A84A',
  backgroundDeep: '#010102',
  scannerAmber: '#f8d79acc',
  scannerCyan: '#00ffffcc',
  scannerViolet: '#8D72FFcc',
  scannerMagenta: '#ff0080cc',
  scannerWhite: '#FFF2D2cc',
  goldBright: '#F2D38A',
  goldMuted: '#8A642B',
  cream: '#F2EDE4cc',
  textOnAccent: '#010102',
  text: '#F7F2E8',
  textMuted: '#ADA7B2',
  danger: '#E86158',
} as const;

export type KeepFlipThemeColors = {
  [Key in keyof typeof darkColors]: string;
};

const lightColors: KeepFlipThemeColors = {
  ...darkColors,
  background: '#F2EDE4',
  backgroundRaised: 'rgba(251, 253, 248, 0.96)',
  scrim: 'rgba(61, 48, 39, 0.26)',
  surface: '#D7C6A8',
  surfaceSoft: '#FBF5EA',
  card: '#E9DDC7F2',
  surfaceOverlay: '#F8F1E6F5',
  surfaceInset: '#E4D9C5E8',
  cardSoft: '#E8F2EEC1',
  iconSurface: '#D7F2EAE8',
  iconSurfaceCyan: '#B6EFE9E8',
  iconSurfaceGold: '#F4DFB1E0',
  iconSurfaceViolet: '#E7DDF7E0',
  accentCyanBorder: 'rgba(0, 116, 125, 0.34)',
  accentGoldBorder: 'rgba(138, 90, 10, 0.34)',
  accentVioletBorder: 'rgba(108, 75, 255, 0.30)',
  success: '#168555',
  successSurface: 'rgba(22, 133, 85, 0.12)',
  dangerSurface: 'rgba(177, 52, 45, 0.12)',
  divider: 'rgba(97, 78, 58, 0.28)',
  dividerStrong: 'rgba(97, 78, 58, 0.42)',
  gold: '#8A5A0A',
  goldBright: '#805307',
  goldMuted: '#77623D',
  backgroundDeep: '#E9E1D6',
  cream: '#3F2A08',
  textOnAccent: '#FFFDF7',
  text: '#110E08',
  textMuted: '#716A72',
  scannerAmber: '#a8761fe8',
  scannerCyan: '#00757de8',
  scannerViolet: '#8b78cbe8',
};

export const keepFlipTheme = {
  fonts: {
    analysis: 'FlexiIBMVGAFalse437',
    body: 'Inter',
    medium: 'PlusJakartaSansMedium',
    semibold: 'PlusJakartaSansSemiBold',
    bold: 'PlusJakartaSansBold',
    display: 'Inter',
    numbers: 'PlusJakartaSansBold',
    radar: 'FlexiIBMVGAFalse437',

  },
  colors: { ...darkColors },
  radii: {
    small: 12,
    medium: 20,
    large: 30,
    pill: 999,
  },
};

export function getKeepFlipThemeColors(colorScheme: KeepFlipColorScheme) {
  return colorScheme === 'light' ? lightColors : darkColors;
}

export function setKeepFlipThemeColorScheme(colorScheme: KeepFlipColorScheme) {
  Object.assign(keepFlipTheme.colors, getKeepFlipThemeColors(colorScheme));
}
