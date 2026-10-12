export type KeepFlipColorScheme = 'light' | 'dark';

const darkColors = {
  background: '#1e1612',
  backgroundRaised: 'rgba(11, 10, 14, 0.75)',
  scrim: 'rgba(99, 81, 54, 0.16)',
  surface: '#211404ff',
  surfaceSoft: '#1e150aff',
  card: 'rgba(5, 13, 19, 0.99)',
  surfaceOverlay: 'rgba(8, 8, 11, 0.98)',
  surfaceInset: 'rgba(5, 13, 19, 0.83)',
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
  background: '#1e1612',
  backgroundRaised: 'rgba(11, 10, 14, 0.75)',
  scrim: 'rgba(99, 81, 54, 0.16)',
  surface: '#211404ff',
  surfaceSoft: '#1e150aff',
  card: 'rgba(5, 13, 19, 0.99)',
  surfaceOverlay: 'rgba(8, 8, 11, 0.98)',
  surfaceInset: 'rgba(5, 13, 19, 0.83)',
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
