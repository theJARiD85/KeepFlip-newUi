export type KeepFlipColorScheme = 'light' | 'dark';

const darkColors = {
  background: '#030305',
  backgroundRaised: 'rgba(11, 10, 14, 0.92)',
  surface: '#08080B',
  surfaceSoft: '#15121A',
  gold: '#D7A84A',
  backgroundDeep: '#010102',
  scannerAmber: '#e0ac4bcc',
  scannerCyan: '#00ffffcc',
  scannerViolet: '#8D72FFcc',
  scannerMagenta: '#ff0080cc',
  scannerWhite: '#FFF2D2cc',
  goldBright: '#F2D38A',
  goldMuted: '#8A642B',
  cream: '#F2EDE4cc',
  text: '#F7F2E8',
  textMuted: '#ADA7B2',
  danger: '#E86158',
} as const;

export type KeepFlipThemeColors = {
  [Key in keyof typeof darkColors]: string;
};

const lightColors: KeepFlipThemeColors = {
  ...darkColors,
  background: '#F6F1E9',
  backgroundRaised: 'rgba(255, 253, 248, 0.94)',
  surface: '#FFFDF8',
  surfaceSoft: '#EAE2D6',
  backgroundDeep: '#E9E1D6',
  cream: '#51483F',
  text: '#29242B',
  textMuted: '#716A72',
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
