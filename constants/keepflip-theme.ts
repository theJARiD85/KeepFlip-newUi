export type KeepFlipColorScheme = 'light' | 'dark';

const darkColors = {
  background: '#1e1612',
  backgroundRaised: 'rgba(11, 10, 14, 0.75)',
  scrim: 'rgba(99, 81, 54, 0.16)',
  surface: '#211404ff',
  surfaceSoft: '#1e150aff',
  card: 'rgba(5, 13, 19, 0.91)',
  surfaceOverlay: 'rgba(8, 8, 11, 0.98)',
  surfaceInset: 'rgba(5, 13, 19, 0.48)',
  cardSoft: 'rgba(12, 10, 9, 0.95)',
  iconSurface: 'rgba(3, 3, 6, 0.98)',
  iconSurfaceCyan: 'rgba(88, 223, 232, 0.12)',
  iconSurfaceGold: 'rgba(215, 168, 74, 0.12)',
  iconSurfaceViolet: 'rgba(141, 114, 255, 0.12)',
  accentCyanBorder: 'rgba(88, 223, 232, 0.35',
  accentGoldBorder: 'rgba(242, 211, 138, 0.35',
  accentVioletBorder: 'rgba(141, 114, 255, 0.35',
  success: '#46F5A2',
  successSurface: 'rgba(70, 245, 163, 0.17)',
  dangerSurface: 'rgba(232, 98, 88, 0.17)',
  divider: 'rgba(242, 211, 138, 0.29)',
  dividerStrong: 'rgba(242, 211, 138, 0.41)',
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
  textMuted: '#9d9b9fff',
  danger: '#E86158',
} as const;

export type KeepFlipThemeColors = {
  [Key in keyof typeof darkColors]: string;
};

const lightColors: KeepFlipThemeColors = {
  ...darkColors,
  background: '#F2EDE4',
  backgroundRaised: 'rgba(251, 253, 248, 0.96)',
  scrim: 'rgba(173, 134, 106, 0.18)',
  surface: '#D7C6A8',
  surfaceSoft: '#FBF5EA',
  card: '#E9DDC7F2',
  surfaceOverlay: '#e8e4def5',
  surfaceInset: '#e4d9c58f',
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
  backgroundDeep: '#d8cec0ff',
  cream: '#3F2A08',
  textOnAccent: '#FFFDF7',
  text: '#110E08',
  textMuted: '#686568ff',
  scannerAmber: '#a8761fe8',
  scannerCyan: '#00757de8',
  scannerViolet: '#8b78cbe8',
};

export const keepFlipTheme = {
  fonts: {
    analysis: 'LucidaConsole',
    body: 'Inter',
    medium: 'PlusJakartaSansMedium',
    semibold: 'PlusJakartaSansSemiBold',
    bold: 'PlusJakartaSansBold',
    display: 'Inter',
    numbers: 'PlusJakartaSansBold',
    radar: 'LucidaConsole',

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
